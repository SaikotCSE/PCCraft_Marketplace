"""Serializers for the compatibility / PC Builder domain (Module 8).

Public shapes follow the contract from ``PCCraft_Master_Spec_v4.md``
sections ``2.10`` and ``MODULE 8``:

* ``CompatibilityAttributeSerializer`` -- the small admin-managed table
  that lists every spec attribute the rule engine understands.
* ``CompatibilityRuleSerializer`` -- admin-managed CRUD shape. Categories
  are referenced by slug so admin tooling can use the same identifier
  the catalog does; the response embeds a nested ``name`` so the UI
  doesn't need to resolve the slug client-side.
* ``PCBuildSerializer`` -- nested ``slots`` dict covering all 11 slots
  (empty slots render as ``null`` so the UI never needs to special-case
  a missing key) plus a freshly-computed ``compatibility_results`` list
  and the wattage summary.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.categories.models import Category
from apps.categories.serializers import CategoryListSerializer
from apps.compatibility.models import (
    PCBuild,
    PCBuildItem,
    PCBuildSlot,
    CompatibilityAttribute,
    CompatibilityRule,
)
from apps.products.models import ProductStatus
from apps.products.serializers import ProductListSerializer


# ====================================================================
# Attributes
# ====================================================================
class CompatibilityAttributeSerializer(serializers.ModelSerializer):
    """Read/write shape for ``CompatibilityAttribute``.

    All fields are exposed because the admin form needs them and the
    table is small enough to render without projection.
    """

    class Meta:
        model = CompatibilityAttribute
        fields = (
            "id",
            "name",
            "description",
            "data_type",
            "created_at",
            "updated_at",
            "is_active",
        )
        read_only_fields = ("id", "created_at", "updated_at", "is_active")

    def validate_name(self, value: str) -> str:
        cleaned = (value or "").strip().lower().replace(" ", "_")
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned

    def validate_data_type(self, value: str) -> str:
        from apps.compatibility.models import AttributeDataType

        if value not in AttributeDataType.values:
            raise serializers.ValidationError("Invalid data_type.")
        return value


# ====================================================================
# Rules
# ====================================================================
class _CategoryBySlugField(serializers.SlugRelatedField):
    """``SlugRelatedField`` that raises a clean validation error on miss."""

    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except (KeyError, TypeError) as exc:
            raise serializers.ValidationError("Category not found: %s" % data) from exc


class _AttributeByNameField(serializers.SlugRelatedField):
    """``CompatibilityAttribute`` lookup by ``name`` (the stable identifier)."""

    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except (KeyError, TypeError) as exc:
            raise serializers.ValidationError("Attribute not found: %s" % data) from exc


class CompatibilityRuleSerializer(serializers.ModelSerializer):
    """Read/write shape for ``CompatibilityRule``.

    Write input uses slug + name identifiers so admin tooling can talk
    the same vocabulary as the catalog. The response embeds a richer
    category representation (id+slug+name) so the UI table doesn't need
    to refetch.
    """

    category_a = _CategoryBySlugField(
        slug_field="slug", queryset=Category.objects.all(),
    )
    category_b = _CategoryBySlugField(
        slug_field="slug", queryset=Category.objects.all(),
    )
    attribute_a = _AttributeByNameField(
        slug_field="name", queryset=CompatibilityAttribute.objects.all(),
    )
    attribute_b = _AttributeByNameField(
        slug_field="name", queryset=CompatibilityAttribute.objects.all(),
    )

    # ---- read-only nested views ----
    category_a_detail = CategoryListSerializer(source="category_a", read_only=True)
    category_b_detail = CategoryListSerializer(source="category_b", read_only=True)
    attribute_a_detail = CompatibilityAttributeSerializer(source="attribute_a", read_only=True)
    attribute_b_detail = CompatibilityAttributeSerializer(source="attribute_b", read_only=True)

    class Meta:
        model = CompatibilityRule
        fields = (
            "id",
            "rule_name",
            "category_a",
            "category_b",
            "attribute_a",
            "attribute_b",
            "category_a_detail",
            "category_b_detail",
            "attribute_a_detail",
            "attribute_b_detail",
            "rule_type",
            "severity",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "category_a_detail",
            "category_b_detail",
            "attribute_a_detail",
            "attribute_b_detail",
            "created_at",
            "updated_at",
        )

    def validate_rule_type(self, value: str) -> str:
        from apps.compatibility.models import RuleType

        if value not in RuleType.values:
            raise serializers.ValidationError("Invalid rule_type.")
        return value

    def validate_severity(self, value: str) -> str:
        from apps.compatibility.models import RuleSeverity

        if value not in RuleSeverity.values:
            raise serializers.ValidationError("Invalid severity.")
        return value

    def validate(self, attrs):
        # Block identical a/b sides -- meaningless rule and would loop
        # the engine. Soft constraint (not a DB constraint) so future
        # tooling can override for special cases.
        cat_a = attrs.get("category_a") or getattr(self.instance, "category_a", None)
        cat_b = attrs.get("category_b") or getattr(self.instance, "category_b", None)
        attr_a = attrs.get("attribute_a") or getattr(self.instance, "attribute_a", None)
        attr_b = attrs.get("attribute_b") or getattr(self.instance, "attribute_b", None)
        if (
            cat_a is not None
            and cat_b is not None
            and attr_a is not None
            and attr_b is not None
            and cat_a == cat_b
            and attr_a == attr_b
        ):
            raise serializers.ValidationError(
                "Category A and Category B must differ (or use different attributes).",
            )
        return attrs


# ====================================================================
# PC Build
# ====================================================================
class PCBuildItemWriteSerializer(serializers.Serializer):
    """One slot in a build write payload.

    Accepts either the nested ``{"product_id": "uuid"}`` shape or the
    flat ``"uuid"``/``null`` shape so the frontend can post whichever
    is simpler. ``null``/empty string clears the slot.
    """

    product_id = serializers.UUIDField(required=False, allow_null=True)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            data = dict(data)
            pid = data.get("product_id")
            if pid == "" or pid == 0:
                data["product_id"] = None
            return super().to_internal_value(data)
        # Flat shape: the slot value IS the product_id (or null/"").
        if data is None or data == "":
            return {"product_id": None}
        return {"product_id": str(data)}


class PCBuildWriteSerializer(serializers.ModelSerializer):
    """Write shape -- used for both POST and PATCH.

    The ``slots`` field is a flexible mapping (slot_key -> product_id);
    the service layer normalises it into PCBuildItem rows.
    """

    slots = serializers.DictField(
        child=PCBuildItemWriteSerializer(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = PCBuild
        fields = ("name", "is_public", "slots")

    def validate_name(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Name is required.")
        return cleaned[:120]


class PCBuildReadSerializer(serializers.ModelSerializer):
    """Read shape -- nested slots + computed compatibility results.

    The ``slots`` dict always carries every one of the 11 PCBuildSlot
    keys so the UI can map over a stable list without conditional
    rendering. Missing products serialise as ``None``.
    """

    slots = serializers.SerializerMethodField()
    compatibility_results = serializers.SerializerMethodField()
    wattage = serializers.SerializerMethodField()

    class Meta:
        model = PCBuild
        fields = (
            "id",
            "name",
            "status",
            "total_price",
            "share_token",
            "is_public",
            "user_id",
            "slots",
            "compatibility_results",
            "wattage",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    # -- slots ---------------------------------------------------------
    def get_slots(self, build: PCBuild):
        """Return ``{CPU: <product|null>, MOBO: ..., ...}`` for all 11 slots.

        We deliberately build the dict ourselves (rather than using a
        nested serializer on the reverse ``items`` relation) so the
        response shape is stable regardless of which slots the user
        has filled. Empty slots serialise as ``None``.
        """
        # Prefetch items + product + category if not already loaded.
        items = list(build.items.all())
        products_by_id = {}
        product_ids = [it.product_id for it in items if it.product_id is not None]
        if product_ids:
            from apps.products.models import Product

            products = Product.objects.filter(pk__in=product_ids).select_related(
                "brand", "category", "vendor"
            )
            products_by_id = {str(p.pk): p for p in products}

        slot_map: dict[str, dict | None] = {}
        for slot_key, _label in PCBuildSlot.choices:
            slot_map[slot_key] = None
        for it in items:
            if it.slot not in slot_map:
                continue
            product = products_by_id.get(str(it.product_id)) if it.product_id else None
            slot_map[it.slot] = (
                ProductListSerializer(product, context=self.context).data
                if product is not None
                else None
            )
        return slot_map

    # -- compatibility + wattage ---------------------------------------
    def _build_slot_map(self, build: PCBuild) -> dict[str, object]:
        """Resolve every filled slot to its product instance.

        Returned as a ``{slot_key: Product}`` dict keyed on PCBuildSlot
        values — every consumer (system_overhead, compute_estimated_tdp,
        _product_for_category, check_build) looks up by slot key, so
        product-pk-keyed entries would silently bypass the engine.

        We start with every slot mapped to ``None`` so callers that
        iterate the result (compute_wattage_summary, get_compatibility_results)
        can treat every slot as present even when unfilled.
        """
        from apps.products.models import Product

        slot_map: dict[str, object] = {slot_key: None for slot_key, _ in PCBuildSlot.choices}
        items = list(build.items.select_related("product").all())
        missing_ids: list = []
        for it in items:
            if it.product_id is None:
                continue
            product = it.product
            if product is None:
                missing_ids.append(it.product_id)
                continue
            slot_map[it.slot] = product
        if missing_ids:
            for p in Product.objects.filter(pk__in=missing_ids):
                # Re-bind to whichever slot referenced this pk.
                for it in items:
                    if it.product_id == p.pk:
                        slot_map[it.slot] = p
        return slot_map

    def get_compatibility_results(self, build: PCBuild):
        """Run ``CompatibilityService.check_build`` against this build.

        Returns a list of spec §2.10 ``CompatibilityResult`` dicts:

        ``{rule_name, status, message, category_a, category_b}``
        where ``status`` is one of ``OK`` / ``WARNING`` / ``ERROR`` / ``INFO``.
        """
        from apps.compatibility.services import CompatibilityService

        slot_map = self._build_slot_map(build)
        results = CompatibilityService.check_build_from_slots(slot_map)
        return [r.as_dict() for r in results]

    def get_wattage(self, build: PCBuild):
        """Spec §2.10 wattage display payload.

        Shape::

            {
              "estimated_tdp": str,
              "psu_wattage": str | None,
              "psu_headroom": str | None,
              "psu_max_load": str | None,
              "status": "ok" | "warning" | "error" | "none",
              "message": str,
            }
        """
        from apps.compatibility.services import CompatibilityService

        slot_map = self._build_slot_map(build)
        return CompatibilityService.compute_wattage_summary(slot_map)


class PCBuildInlineSerializer(serializers.ModelSerializer):
    """Lightweight shape used in share / listings (no nested results)."""

    class Meta:
        model = PCBuild
        fields = (
            "id",
            "name",
            "status",
            "total_price",
            "share_token",
            "is_public",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


# ====================================================================
# Public check payload (no DB persistence)
# ====================================================================
class CompatibilityCheckRequestSerializer(serializers.Serializer):
    """Body of ``POST /api/v1/compatibility/check/``.

    Accepts a flat ``slots`` map of slot_key -> product_id. Unknown slot
    keys are rejected so typos surface as a 400 instead of silent
    ignores.
    """

    slots = serializers.DictField(
        child=serializers.UUIDField(allow_null=True),
        required=True,
        allow_empty=True,
    )

    def validate_slots(self, value: dict) -> dict:
        valid_slots = {key for key, _ in PCBuildSlot.choices}
        cleaned: dict[str, str | None] = {}
        for k, v in value.items():
            if k not in valid_slots:
                raise serializers.ValidationError(
                    "Unknown slot: %s. Valid slots: %s"
                    % (k, sorted(valid_slots))
                )
            cleaned[k] = str(v) if v else None
        return cleaned


class _CompatibilityResultRowSerializer(serializers.Serializer):
    """Spec §2.10 ``CompatibilityResult`` wire shape.

    Exactly five fields, in this order -- the frontend binds to them
    directly without projection:

    * ``rule_name``
    * ``status`` -- ``OK`` / ``WARNING`` / ``ERROR`` / ``INFO``
    * ``message`` -- human-readable
    * ``category_a`` / ``category_b`` -- rule's category pair
    """

    rule_name = serializers.CharField()
    status = serializers.CharField()
    message = serializers.CharField()
    category_a = serializers.CharField()
    category_b = serializers.CharField()


class CompatibilityCheckResponseSerializer(serializers.Serializer):
    """Response of ``POST /api/v1/compatibility/check/``.

    Envelope::

        {
          "results":     [CompatibilityResult, ...],   # spec §2.10 wire shape
          "wattage":     {estimated_tdp, psu_wattage,
                           psu_headroom, status, message},
          "total_price": "1234.56",
        }
    """

    results = _CompatibilityResultRowSerializer(many=True)
    wattage = serializers.DictField()
    total_price = serializers.CharField()