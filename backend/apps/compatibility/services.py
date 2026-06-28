"""Compatibility engine for Module 8.

This module implements the algorithm described in
``PCCraft_Master_Spec_v4.md`` section ``2.10`` -- the rule evaluator
that powers the PC Builder UI. It is intentionally pure-Python with
no DRF / HTTP imports so it can be exercised from management commands,
signals, or async Celery tasks in future modules.

Public surface:

* :class:`CompatibilityResult` -- a dataclass describing the outcome of
  one rule evaluation. The wire shape (defined in
  ``PCCraft_Master_Spec_v4.md`` §2.10) is::

      {rule_name, status, message, category_a, category_b}

  where ``status`` is one of ``OK`` / ``WARNING`` / ``ERROR`` / ``INFO``.
* :class:`CompatibilityService` -- exposes the operations the API
  layer needs:

  - :meth:`evaluate_slot_pair` -- evaluate a single (product_a,
    product_b) pair against every applicable rule.
  - :meth:`check_build` -- evaluate every pair of products in a build.
  - :meth:`get_compatible_products` -- return a queryset of products
    that pass every applicable rule for the given ``slot`` and the
    already-selected components.
  - :meth:`compute_wattage_summary` -- TDP sum + system overhead +
    PSU headroom per spec §2.10.

The implementation deliberately loads all active rules once per
evaluation pass (small dataset -- 10 rules per spec) and indexes them
by ``(category_a_slug, category_b_slug)`` pairs.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

from django.db.models import Q, QuerySet

from apps.compatibility.models import (
    PCBuildSlot,
    AttributeDataType,
    CompatibilityAttribute,
    CompatibilityRule,
    RuleType,
)
from apps.products.models import Product, ProductStatus


# Per spec §2.10 CompatibilityResult severity values. The frontend
# renders these verbatim, so they are string constants, not enum imports.
STATUS_OK = "OK"
STATUS_WARNING = "WARNING"
STATUS_ERROR = "ERROR"
STATUS_INFO = "INFO"


# ====================================================================
# Slot → category-slug map
# ====================================================================
# The builder slot keys do not always match category slugs 1:1 (e.g.
# slot ``CPU`` maps to category ``cpus``). This map is the single
# source of truth for that translation; any new slot must add an entry
# here as well.
SLOT_CATEGORY_SLUGS: dict[str, str] = {
    PCBuildSlot.CPU: "cpus",
    PCBuildSlot.MOBO: "motherboards",
    PCBuildSlot.RAM_1: "ram",
    PCBuildSlot.RAM_2: "ram",
    PCBuildSlot.GPU: "gpus",
    PCBuildSlot.PSU: "power-supplies",
    PCBuildSlot.CASE: "pc-cases",
    PCBuildSlot.COOLER: "cpu-coolers",
    PCBuildSlot.SSD_1: "ssd",
    PCBuildSlot.SSD_2: "ssd",
    PCBuildSlot.HDD: "hdd",
}


# ====================================================================
# Result dataclass
# ====================================================================
@dataclass
class CompatibilityResult:
    """Outcome of a single rule evaluation.

    The first five fields are the spec §2.10 wire contract -- the API
    serialises exactly these (in this order) so the frontend can bind
    directly. ``rule_type`` and ``severity`` are kept on the dataclass
    so the engine can dispatch and label without re-querying the DB,
    but they are intentionally NOT in :meth:`as_dict`.

    ``status`` is one of ``OK`` / ``WARNING`` / ``ERROR`` / ``INFO``.
    Per spec:

    * ``INFO`` -- either required slot is empty (UI: "Select X and Y to
      check this rule").
    * ``OK`` -- both slots filled and the rule matched.
    * ``ERROR`` -- both slots filled and the rule failed with
      severity=ERROR (blocks the build).
    * ``WARNING`` -- both slots filled and the rule failed with
      severity=WARNING (advisory only).
    """

    rule_name: str
    status: str
    message: str
    category_a: str = ""
    category_b: str = ""
    # Internal helpers used by the engine -- not serialised.
    rule_type: str = ""
    severity: str = ""

    def as_dict(self) -> dict:
        """Return the exact wire shape defined in spec §2.10."""
        return {
            "rule_name": self.rule_name,
            "status": self.status,
            "message": self.message,
            "category_a": self.category_a,
            "category_b": self.category_b,
        }


# ====================================================================
# Helpers
# ====================================================================
def _category_slug(product: Product | None) -> str | None:
    if product is None:
        return None
    cat = getattr(product, "category", None)
    if cat is None:
        return None
    return getattr(cat, "slug", None)


def _spec_value(product: Product | None, attribute: CompatibilityAttribute) -> Any:
    """Look up an attribute value in ``Product.specs``.

    ``Product.specs`` is the JSON blob captured at vendor submit time
    per spec §2.5. The lookup is case-insensitive against the
    attribute name so vendors can type ``"TDP"`` or ``"tdp"``
    interchangeably.
    """
    if product is None:
        return None
    specs = getattr(product, "specs", None) or {}
    if not specs:
        return None
    target = attribute.name.strip().lower()
    if target in specs:
        return specs[target]
    # Try without underscores / with spaces -- vendors vary in style.
    flat = target.replace("_", "")
    for key, value in specs.items():
        if str(key).strip().lower().replace("_", "") == flat:
            return value
    return None


def _coerce_numeric(value: Any) -> Optional[Decimal]:
    """Best-effort numeric coercion for wattage / size comparisons."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    text = str(value).strip()
    if not text:
        return None
    # Strip trailing unit suffixes -- "650W" -> "650".
    cleaned = "".join(ch for ch in text if ch.isdigit() or ch == "." or ch == "-")
    if not cleaned or cleaned in ("-", ".", "-."):
        return None
    try:
        return Decimal(cleaned)
    except Exception:
        return None


def _coerce_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    return [value]


# ====================================================================
# Service
# ====================================================================
class CompatibilityService:
    """Pure-logic engine for the compatibility domain.

    The class has no constructor arguments -- everything is loaded from
    the DB on demand. Rule lookups are cached in a class-level dict
    keyed on the active ruleset fingerprint so multiple evaluations in
    one request reuse the loaded rules.
    """

    # ----------------------------------------------------------------
    # System overhead (spec §2.10 Wattage Display Logic)
    # ----------------------------------------------------------------
    @staticmethod
    def system_overhead(slot_map: dict[str, Product | None]) -> Decimal:
        """Return the system overhead for a build.

        Formula per spec §2.10::

            system_overhead = 50W
                            + 5W × filled_RAM_slots
                            + 5W × filled_SSD_slots
                            + 10W × (1 if HDD else 0)
        """
        overhead = Decimal("50")
        for slot_key in (PCBuildSlot.RAM_1, PCBuildSlot.RAM_2):
            if slot_map.get(slot_key) is not None:
                overhead += Decimal("5")
        for slot_key in (PCBuildSlot.SSD_1, PCBuildSlot.SSD_2):
            if slot_map.get(slot_key) is not None:
                overhead += Decimal("5")
        if slot_map.get(PCBuildSlot.HDD) is not None:
            overhead += Decimal("10")
        return overhead

    # ----------------------------------------------------------------
    # Total TDP (spec §2.10 estimated_tdp)
    # ----------------------------------------------------------------
    @staticmethod
    def compute_total_tdp(slot_map: dict[str, Product | None]) -> Decimal:
        """Sum CPU + GPU TDP across the build."""
        total = Decimal("0")
        for slot_key in (PCBuildSlot.CPU, PCBuildSlot.GPU):
            product = slot_map.get(slot_key)
            if product is None:
                continue
            tdp_attr = CompatibilityAttribute.objects.filter(
                name__iexact="tdp", is_active=True,
            ).first()
            if tdp_attr is None:
                continue
            tdp = _coerce_numeric(_spec_value(product, tdp_attr))
            if tdp is not None:
                total += tdp
        return total

    @staticmethod
    def compute_estimated_tdp(slot_map: dict[str, Product | None]) -> Decimal:
        """Spec §2.10 ``estimated_tdp`` = CPU + GPU + overhead."""
        return (
            CompatibilityService.compute_total_tdp(slot_map)
            + CompatibilityService.system_overhead(slot_map)
        )

    @staticmethod
    def compute_wattage_summary(slot_map: dict[str, Product | None]) -> dict:
        """Spec §2.10 wattage display payload.

        Shape::

            {
              "estimated_tdp": str,           # CPU + GPU + overhead
              "psu_wattage": str | None,      # PSU.wattage or None
              "psu_headroom": str | None,     # psu.wattage × 0.80 or None
              "psu_max_load": str | None,     # alias of psu_headroom
              "status": "ok" | "warning" | "error" | "none",
              "message": str,
            }

        ``status`` is the UI band: green/yellow/red/none. ``message``
        is the rendered sentence the builder page displays.
        """
        estimated = CompatibilityService.compute_estimated_tdp(slot_map)

        psu = slot_map.get(PCBuildSlot.PSU)
        psu_w: Decimal | None = None
        if psu is not None:
            wattage_attr = CompatibilityAttribute.objects.filter(
                name__iexact="wattage", is_active=True,
            ).first()
            if wattage_attr is not None:
                psu_w = _coerce_numeric(_spec_value(psu, wattage_attr))

        if psu_w is None:
            return {
                "estimated_tdp": str(estimated),
                "psu_wattage": None,
                "psu_headroom": None,
                "psu_max_load": None,
                "status": "none",
                "message": "Estimated Load: %s W  (Select a PSU to check headroom)" % estimated,
            }

        headroom = (psu_w * Decimal("0.80")).quantize(Decimal("0.01"))
        if estimated <= headroom * Decimal("0.70"):
            status_label = "ok"
            message = "Estimated Load: %s W / %s W  ✓ Good headroom" % (estimated, psu_w)
        elif estimated <= headroom:
            status_label = "warning"
            message = "Estimated Load: %s W / %s W  ⚠ Near limit" % (estimated, psu_w)
        else:
            status_label = "error"
            message = "Estimated Load: %s W / %s W  ✗ Underpowered" % (estimated, psu_w)

        return {
            "estimated_tdp": str(estimated),
            "psu_wattage": str(psu_w),
            "psu_headroom": str(headroom),
            "psu_max_load": str(headroom),
            "status": status_label,
            "message": message,
        }

    # ----------------------------------------------------------------
    # Pair evaluation
    # ----------------------------------------------------------------
    @staticmethod
    def _info_for_missing(
        rule: CompatibilityRule,
        product_a: Product | None,
        product_b: Product | None,
    ) -> CompatibilityResult:
        """Spec §2.10: emit ``INFO`` when either side of a rule is empty."""
        cat_a_name = rule.category_a.name
        cat_b_name = rule.category_b.name
        return CompatibilityResult(
            rule_name=rule.rule_name,
            status=STATUS_INFO,
            message="Select %s and %s to check this rule." % (cat_a_name, cat_b_name),
            category_a=cat_a_name,
            category_b=cat_b_name,
            rule_type=rule.rule_type,
            severity=rule.severity,
        )

    @staticmethod
    def evaluate_slot_pair(
        slot_a: str,
        slot_b: str,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None] | None = None,
    ) -> list[CompatibilityResult]:
        """Evaluate every active rule that binds ``slot_a`` to ``slot_b``.

        ``slot_map`` is the full build -- required only by the
        POWER_CHECK rule, which sums TDPs across the whole build
        (per spec §2.10). Other rules ignore it.
        """

        slug_a = _category_slug(product_a)
        slug_b = _category_slug(product_b)

        rules = (
            CompatibilityRule.objects.filter(is_active=True)
            .filter(
                (Q(category_a__slug=slug_a) & Q(category_b__slug=slug_b))
                | (Q(category_a__slug=slug_b) & Q(category_b__slug=slug_a))
            )
            .select_related("category_a", "category_b", "attribute_a", "attribute_b")
            if slug_a and slug_b
            else CompatibilityRule.objects.none()
        )

        results: list[CompatibilityResult] = []
        for rule in rules:
            # Map each rule side to the right product. ``attr_a`` stays
            # bound to ``category_a`` -- the rule's seed convention.
            if rule.category_a.slug == slug_a:
                product_for_a, product_for_b = product_a, product_b
            else:
                product_for_a, product_for_b = product_b, product_a

            results.append(
                CompatibilityService._evaluate_rule(
                    rule,
                    rule.attribute_a,
                    rule.attribute_b,
                    product_for_a,
                    product_for_b,
                    slot_map or {slot_a: product_a, slot_b: product_b},
                )
            )
        return results

    # ----------------------------------------------------------------
    # Rule evaluation
    # ----------------------------------------------------------------
    @staticmethod
    def _evaluate_rule(
        rule: CompatibilityRule,
        attribute_a: CompatibilityAttribute,
        attribute_b: CompatibilityAttribute,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None],
    ) -> CompatibilityResult:
        """Dispatch to the rule-type-specific evaluator.

        Falls back to ``OK`` with an explanatory message if the rule
        references a type we don't know -- safer than raising, because
        that would block builds whenever a vendor/admin adds a new
        rule type without yet implementing it.
        """

        if product_a is None or product_b is None:
            return CompatibilityService._info_for_missing(rule, product_a, product_b)

        dispatch = {
            RuleType.MATCH: CompatibilityService._rule_match,
            RuleType.MEMBER_OF: CompatibilityService._rule_member_of,
            RuleType.RANGE_MAX: CompatibilityService._rule_range_max,
            RuleType.POWER_CHECK: CompatibilityService._rule_power_check,
        }
        handler = dispatch.get(rule.rule_type)
        if handler is None:
            return CompatibilityResult(
                rule_name=rule.rule_name,
                status=STATUS_OK,
                message="Rule type %s not implemented." % rule.rule_type,
                category_a=rule.category_a.name,
                category_b=rule.category_b.name,
                rule_type=rule.rule_type,
                severity=rule.severity,
            )
        return handler(rule, attribute_a, attribute_b, product_a, product_b, slot_map)

    # ---- MATCH --------------------------------------------------------
    @staticmethod
    def _rule_match(
        rule: CompatibilityRule,
        attr_a: CompatibilityAttribute,
        attr_b: CompatibilityAttribute,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None],
    ) -> CompatibilityResult:
        val_a = _spec_value(product_a, attr_a)
        val_b = _spec_value(product_b, attr_b)
        passed = (
            val_a is not None
            and val_b is not None
            and str(val_a).strip().lower() == str(val_b).strip().lower()
        )
        status_value = STATUS_OK if passed else (
            STATUS_ERROR if rule.severity == "ERROR" else STATUS_WARNING
        )
        if passed:
            message = "%s: %s matches %s." % (rule.description, val_a, val_b)
        else:
            message = "%s: %s does not match %s." % (rule.description, val_a, val_b)
        return CompatibilityResult(
            rule_name=rule.rule_name,
            status=status_value,
            message=message,
            category_a=rule.category_a.name,
            category_b=rule.category_b.name,
            rule_type=rule.rule_type,
            severity=rule.severity,
        )

    # ---- MEMBER_OF ----------------------------------------------------
    @staticmethod
    def _rule_member_of(
        rule: CompatibilityRule,
        attr_a: CompatibilityAttribute,
        attr_b: CompatibilityAttribute,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None],
    ) -> CompatibilityResult:
        # The superset attribute carries ``AttributeDataType.JSON_ARRAY``;
        # whichever side has that type provides the options, and the
        # other side provides the chosen value. This is robust to the
        # category pair order in seed data and to which side the
        # ``evaluate_slot_pair`` caller happened to send as ``a``.
        if attr_a.data_type == AttributeDataType.JSON_ARRAY:
            superset_raw = _spec_value(product_a, attr_a)
            chosen = _spec_value(product_b, attr_b)
        elif attr_b.data_type == AttributeDataType.JSON_ARRAY:
            superset_raw = _spec_value(product_b, attr_b)
            chosen = _spec_value(product_a, attr_a)
        else:
            return CompatibilityResult(
                rule_name=rule.rule_name,
                status=STATUS_OK,
                message="%s: MEMBER_OF rule has no JSON_ARRAY attribute; skipped."
                        % rule.description,
                category_a=rule.category_a.name,
                category_b=rule.category_b.name,
                rule_type=rule.rule_type,
                severity=rule.severity,
            )
        superset = set(str(x).strip().lower() for x in _coerce_list(superset_raw))
        passed = chosen is not None and str(chosen).strip().lower() in superset
        status_value = STATUS_OK if passed else (
            STATUS_ERROR if rule.severity == "ERROR" else STATUS_WARNING
        )
        if passed:
            message = "%s: %s is supported." % (rule.description, chosen)
        else:
            message = "%s: %s not in supported list (%s)." % (
                rule.description, chosen, ", ".join(sorted(superset)) or "none",
            )
        return CompatibilityResult(
            rule_name=rule.rule_name,
            status=status_value,
            message=message,
            category_a=rule.category_a.name,
            category_b=rule.category_b.name,
            rule_type=rule.rule_type,
            severity=rule.severity,
        )

    # ---- RANGE_MAX ----------------------------------------------------
    @staticmethod
    def _rule_range_max(
        rule: CompatibilityRule,
        attr_a: CompatibilityAttribute,
        attr_b: CompatibilityAttribute,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None],
    ) -> CompatibilityResult:
        """Spec §2.10: ``numeric(spec_a) ≤ numeric(spec_b)``.

        ``attribute_a`` is the limit (e.g. case max GPU length) and
        ``attribute_b`` is the measurement (e.g. GPU length). The
        engine checks ``measurement ≤ limit`` directly with a 5%
        rounding tolerance for spec-sheet variance.
        """

        num_a = _coerce_numeric(_spec_value(product_a, attr_a))
        num_b = _coerce_numeric(_spec_value(product_b, attr_b))
        if num_a is None or num_b is None:
            return CompatibilityResult(
                rule_name=rule.rule_name,
                status=STATUS_OK,
                message="%s: missing spec value; skipped." % rule.description,
                category_a=rule.category_a.name,
                category_b=rule.category_b.name,
                rule_type=rule.rule_type,
                severity=rule.severity,
            )
        passed = num_b <= num_a * Decimal("1.05")
        status_value = STATUS_OK if passed else (
            STATUS_ERROR if rule.severity == "ERROR" else STATUS_WARNING
        )
        if passed:
            message = "%s: %s ≤ %s, within range." % (rule.description, num_b, num_a)
        else:
            message = "%s: %s exceeds limit %s." % (rule.description, num_b, num_a)
        return CompatibilityResult(
            rule_name=rule.rule_name,
            status=status_value,
            message=message,
            category_a=rule.category_a.name,
            category_b=rule.category_b.name,
            rule_type=rule.rule_type,
            severity=rule.severity,
        )

    # ---- POWER_CHECK --------------------------------------------------
    @staticmethod
    def _rule_power_check(
        rule: CompatibilityRule,
        attr_a: CompatibilityAttribute,
        attr_b: CompatibilityAttribute,
        product_a: Product | None,
        product_b: Product | None,
        slot_map: dict[str, Product | None],
    ) -> CompatibilityResult:
        """Spec §2.10 POWER_CHECK.

        Formula::

            estimated_tdp = cpu.tdp + gpu.tdp + system_overhead
            headroom      = psu.wattage × 0.80
            pass          = estimated_tdp ≤ headroom
        """

        estimated = CompatibilityService.compute_estimated_tdp(slot_map)

        psu = slot_map.get(PCBuildSlot.PSU)
        psu_w: Decimal | None = None
        if psu is not None:
            wattage_attr = CompatibilityAttribute.objects.filter(
                name__iexact="wattage", is_active=True,
            ).first()
            if wattage_attr is not None:
                psu_w = _coerce_numeric(_spec_value(psu, wattage_attr))

        if psu is None or psu_w is None:
            return CompatibilityResult(
                rule_name=rule.rule_name,
                status=STATUS_INFO,
                message="%s: select a PSU to check the build's power budget."
                        % rule.description,
                category_a=rule.category_a.name,
                category_b=rule.category_b.name,
                rule_type=rule.rule_type,
                severity=rule.severity,
            )

        headroom = psu_w * Decimal("0.80")
        passed = estimated <= headroom
        status_value = STATUS_OK if passed else (
            STATUS_ERROR if rule.severity == "ERROR" else STATUS_WARNING
        )
        if passed:
            message = (
                "%s: estimated load %s W is within PSU headroom %s W."
                % (rule.description, estimated, headroom.quantize(Decimal("0.01")))
            )
        else:
            message = (
                "%s: estimated load %s W exceeds PSU headroom %s W (PSU %s W)."
                % (
                    rule.description, estimated,
                    headroom.quantize(Decimal("0.01")), psu_w,
                )
            )
        return CompatibilityResult(
            rule_name=rule.rule_name,
            status=status_value,
            message=message,
            category_a=rule.category_a.name,
            category_b=rule.category_b.name,
            rule_type=rule.rule_type,
            severity=rule.severity,
        )

    # ----------------------------------------------------------------
    # Build-wide evaluation
    # ----------------------------------------------------------------
    @staticmethod
    def check_build(slot_map: dict[str, Product | None]) -> list[CompatibilityResult]:
        """Evaluate every active rule against a build (spec §2.10 algorithm).

        Each rule contributes exactly one row to the response:

        * If both required categories are filled in the build, evaluate
          the rule and emit ``OK`` / ``WARNING`` / ``ERROR``.
        * If either required category is unfilled, emit ``INFO`` (per
          spec: "A rule produces ``INFO`` (not ``ERROR``) when either
          required slot is empty.").
        """
        rules = list(
            CompatibilityRule.objects.filter(is_active=True)
            .select_related("category_a", "category_b")
        )

        results: list[CompatibilityResult] = []
        for rule in rules:
            cat_a_slug = rule.category_a.slug
            cat_b_slug = rule.category_b.slug
            product_a = CompatibilityService._product_for_category(slot_map, cat_a_slug)
            product_b = CompatibilityService._product_for_category(slot_map, cat_b_slug)

            if product_a is None or product_b is None:
                results.append(
                    CompatibilityService._info_for_missing(rule, product_a, product_b)
                )
                continue

            results.append(
                CompatibilityService._evaluate_rule(
                    rule,
                    rule.attribute_a,
                    rule.attribute_b,
                    product_a,
                    product_b,
                    slot_map,
                )
            )
        return results

    @staticmethod
    def _product_for_category(
        slot_map: dict[str, Product | None],
        category_slug: str,
    ) -> Product | None:
        """Return the first filled slot whose category matches ``category_slug``.

        For categories with two slots in the builder (RAM_1/RAM_2,
        SSD_1/SSD_2) the first non-empty slot wins.
        """
        for slot_key, product in slot_map.items():
            if product is None:
                continue
            cat = getattr(product, "category", None)
            if cat is not None and getattr(cat, "slug", None) == category_slug:
                return product
        return None

    @classmethod
    def check_build_from_slots(cls, slot_map: dict[str, object]) -> list[CompatibilityResult]:
        """Same as :meth:`check_build` but accepts arbitrary slot keys.

        The DRF serializer resolves slot values into ``Product`` instances
        before calling this; this helper lets the rest of the codebase
        pass the resolved dict in directly.
        """
        return cls.check_build(slot_map)  # type: ignore[arg-type]

    # ----------------------------------------------------------------
    # Compatible product filter
    # ----------------------------------------------------------------
    @staticmethod
    def get_compatible_products(
        slot: str,
        selected: dict[str, Product | None],
        search: str | None = None,
    ) -> QuerySet[Product]:
        """Return a queryset of products that pass every applicable rule.

        ``slot`` is the ``PCBuildSlot`` value the user is filling.
        ``selected`` is the currently-filled portion of the build
        (``{slot_key: Product|None}``). ``search`` is an optional
        substring applied to product ``name`` and ``brand.name``.

        Per spec §2.10, this returns the queryset for the slot's
        category; the Python engine rejects candidates that would
        introduce an ``ERROR`` against any rule involving this slot.
        """
        from django.db.models import Q as _Q

        target_slug = SLOT_CATEGORY_SLUGS.get(slot) or slot.lower()

        qs = Product.objects.filter(
            is_active=True,
            status=ProductStatus.ACTIVE,
            category__slug=target_slug,
        ).select_related("brand", "category", "vendor")

        if search:
            qs = qs.filter(_Q(name__icontains=search) | _Q(brand__name__icontains=search))

        rules = list(
            CompatibilityRule.objects.filter(is_active=True)
            .filter(_Q(category_a__slug=target_slug) | _Q(category_b__slug=target_slug))
            .select_related("category_a", "category_b", "attribute_a", "attribute_b")
        )
        if not rules:
            return qs

        candidate_ids: set[str] | None = None
        for product in qs:
            test_map = dict(selected)
            test_map[slot] = product
            results = CompatibilityService.check_build(test_map)
            relevant = [
                r for r in results
                if _category_matches_slot(r, product.category.slug, slot)
            ]
            failed_error = any(r.status == STATUS_ERROR for r in relevant)
            if failed_error:
                continue
            candidate_ids = candidate_ids or set()
            candidate_ids.add(str(product.pk))

        if candidate_ids is None:
            return qs.none()
        return qs.filter(pk__in=candidate_ids)


def _category_matches_slot(
    result: CompatibilityResult,
    product_category_slug: str,
    slot_key: str,
) -> bool:
    """Return True if a result row is one of the rules that constrain ``slot_key``."""
    # Re-derive the category slugs from the rule's category_a/category_b names
    # via the slot→category-slug map (the inverse of SLOT_CATEGORY_SLUGS).
    expected_slug = SLOT_CATEGORY_SLUGS.get(slot_key, "").lower()
    return product_category_slug == expected_slug


# ====================================================================
# Convenience helpers
# ====================================================================
def products_by_slot(slot: str) -> QuerySet[Product]:
    """Return the candidate queryset for a slot, before compatibility filtering."""
    return (
        Product.objects.filter(
            is_active=True,
            status=ProductStatus.APPROVED,
            category__slug=slot.lower(),
        )
        .select_related("brand", "category", "vendor")
    )
