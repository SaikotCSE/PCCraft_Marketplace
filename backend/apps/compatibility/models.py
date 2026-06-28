"""Models for the compatibility / PC Builder domain (Module 8 + spec §2.10).

Four concrete models:

* ``CompatibilityAttribute`` -- named spec attribute (e.g. ``socket``,
  ``form_factor``). The rule engine reads ``data_type`` to know how to
  cast a product spec value before comparison (string / int / JSON list).

* ``CompatibilityRule`` -- a data-driven compatibility check between two
  categories and two attributes. A row in this table IS a rule; the
  Python engine never hardcodes "CPU socket must match motherboard
  socket" -- it walks these rows. Toggle ``is_active=False`` to
  retire a rule without losing history.

* ``PCBuild`` -- one build per user (or anonymous; ``user`` nullable).
  Stores the share token (UUID), total price (denormalised for the
  summary panel), and a status enum (``DRAFT`` / ``COMPLETE``) that the
  service layer flips after every ``check_build``.

* ``PCBuildItem`` -- a single slot (``CPU`` / ``MOBO`` / ``RAM_1`` / ...)
  in a build. ``slot`` is a TextChoices enum, not a free string, and
  the (build, slot) pair is unique so the service layer can treat it as
  an upsert key.

Every concrete model inherits from ``apps.common.models.TimeStampedModel``
for audit + soft-delete columns.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from apps.categories.models import Category
from apps.common.models import TimeStampedModel


# ====================================================================
# Enums (TextChoices)
# ====================================================================
class AttributeDataType(models.TextChoices):
    """How the rule engine should cast a spec value before comparison."""

    STRING = "STRING", _("String")
    INTEGER = "INTEGER", _("Integer")
    JSON_ARRAY = "JSON_ARRAY", _("JSON array")


class RuleType(models.TextChoices):
    """Algorithm the engine runs to evaluate a single rule."""

    MATCH = "MATCH", _("Match (string equality)")
    MEMBER_OF = "MEMBER_OF", _("Member of (value in JSON array)")
    RANGE_MAX = "RANGE_MAX", _("Range max (a <= b)")
    POWER_CHECK = "POWER_CHECK", _("Power check (sum TDP <= PSU * 0.80)")


class RuleSeverity(models.TextChoices):
    """How a failed rule surfaces in the UI."""

    ERROR = "ERROR", _("Error")
    WARNING = "WARNING", _("Warning")


class BuildStatus(models.TextChoices):
    """Computed lifecycle state of a build."""

    DRAFT = "DRAFT", _("Draft")
    COMPLETE = "COMPLETE", _("Complete")


# The 11 slots the builder UI knows about. Order matches §2.10 PC
# Builder Slots table.
class PCBuildSlot(models.TextChoices):
    CPU = "CPU", _("CPU")
    MOBO = "MOBO", _("Motherboard")
    RAM_1 = "RAM_1", _("Memory slot 1")
    RAM_2 = "RAM_2", _("Memory slot 2")
    GPU = "GPU", _("Graphics card")
    PSU = "PSU", _("Power supply")
    CASE = "CASE", _("PC case")
    COOLER = "COOLER", _("CPU cooler")
    SSD_1 = "SSD_1", _("Storage SSD slot 1")
    SSD_2 = "SSD_2", _("Storage SSD slot 2")
    HDD = "HDD", _("Storage HDD")


# ====================================================================
# CompatibilityAttribute
# ====================================================================
class CompatibilityAttribute(TimeStampedModel):
    """A named spec attribute the rule engine knows about.

    Example rows: ``socket`` (STRING), ``form_factor`` (STRING),
    ``max_ram_speed_mhz`` (INTEGER), ``form_factors_supported``
    (JSON_ARRAY). The engine uses ``data_type`` to coerce values before
    a comparison so the same rule code can handle "DDR4" strings and
    "5600" MHz ints.
    """

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(
        _("name"),
        max_length=64,
        unique=True,
        help_text=_("e.g. 'socket', 'form_factor', 'max_ram_speed_mhz'."),
    )
    description = models.TextField(_("description"), blank=True)
    data_type = models.CharField(
        _("data type"),
        max_length=16,
        choices=AttributeDataType.choices,
        default=AttributeDataType.STRING,
    )

    class Meta:
        verbose_name = _("Compatibility attribute")
        verbose_name_plural = _("Compatibility attributes")
        ordering = ("name",)

    def __str__(self) -> str:  # pragma: no cover
        return self.name


# ====================================================================
# CompatibilityRule
# ====================================================================
class CompatibilityRule(TimeStampedModel):
    """A data-driven compatibility rule between two category+attribute pairs.

    The rule engine walks every active rule, resolves the products that
    currently fill the two referenced categories in the build, and runs
    ``rule_type`` against the two spec values. The rule never holds a
    hard-coded condition -- all behaviour is driven by these columns.

    ``description`` is the human-readable text shown in the UI accordion
    so admins know what each rule checks without reading the engine.
    """

    id = models.BigAutoField(primary_key=True)

    rule_name = models.CharField(
        _("rule name"),
        max_length=80,
        unique=True,
        help_text=_("Unique identifier, e.g. 'CPU_MOBO_SOCKET'."),
    )

    # ---- left side of the comparison ----
    category_a = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name="rules_as_a",
        verbose_name=_("category A"),
    )
    attribute_a = models.ForeignKey(
        CompatibilityAttribute,
        on_delete=models.PROTECT,
        related_name="rules_as_a",
        verbose_name=_("attribute A"),
    )

    # ---- right side of the comparison ----
    category_b = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name="rules_as_b",
        verbose_name=_("category B"),
    )
    attribute_b = models.ForeignKey(
        CompatibilityAttribute,
        on_delete=models.PROTECT,
        related_name="rules_as_b",
        verbose_name=_("attribute B"),
    )

    # ---- evaluation ----
    rule_type = models.CharField(
        _("rule type"),
        max_length=16,
        choices=RuleType.choices,
    )
    severity = models.CharField(
        _("severity"),
        max_length=16,
        choices=RuleSeverity.choices,
        default=RuleSeverity.ERROR,
    )

    description = models.TextField(
        _("description"),
        help_text=_("Human-readable explanation shown in the UI accordion."),
    )

    is_active = models.BooleanField(_("is active"), default=True, db_index=True)

    class Meta:
        verbose_name = _("Compatibility rule")
        verbose_name_plural = _("Compatibility rules")
        ordering = ("rule_name",)
        indexes = [
            models.Index(fields=("is_active", "rule_type")),
            models.Index(fields=("category_a", "is_active")),
            models.Index(fields=("category_b", "is_active")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "%s (%s)" % (self.rule_name, self.rule_type)


# ====================================================================
# PCBuild
# ====================================================================
class PCBuild(TimeStampedModel):
    """A saved PC build.

    Anonymous builds persist in the browser's localStorage keyed by
    ``pccraft_build``; once a user logs in the build migrates to this
    table. The ``share_token`` (UUID) powers the public ``/builds/share/<token>/``
    endpoint that renders a read-only version of the build without
    requiring auth.
    """

    id = models.BigAutoField(primary_key=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pc_builds",
        null=True,
        blank=True,
    )
    name = models.CharField(_("name"), max_length=120, default="My Build")

    is_public = models.BooleanField(_("is public"), default=False)
    share_token = models.UUIDField(
        _("share token"),
        default=uuid.uuid4,
        unique=True,
        editable=False,
        db_index=True,
    )

    # ---- denormalised aggregates (kept in sync by the service layer) ----
    total_price = models.DecimalField(
        _("total price"),
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text=_("Sum of selected products' effective prices."),
    )

    status = models.CharField(
        _("status"),
        max_length=16,
        choices=BuildStatus.choices,
        default=BuildStatus.DRAFT,
        db_index=True,
    )

    class Meta:
        verbose_name = _("PC build")
        verbose_name_plural = _("PC builds")
        ordering = ("-updated_at",)
        indexes = [
            models.Index(fields=("user", "-updated_at")),
            models.Index(fields=("status",)),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "%s <%s>" % (self.name, self.user_id or "anon")

    def recompute_total_price(self) -> Decimal:
        """Sum the effective prices of every non-empty slot."""
        total = Decimal("0.00")
        for item in self.items.select_related("product").all():
            product = item.product
            if product is None:
                continue
            total += product.effective_price
        return total

    def save(self, *args, **kwargs):
        # ``name`` defaults to "My Build" -- no slug to generate here.
        # Keep ``status`` flipped to COMPLETE only by the service layer;
        # a direct ``save()`` will not change it.
        super().save(*args, **kwargs)


# ====================================================================
# PCBuildItem
# ====================================================================
class PCBuildItem(TimeStampedModel):
    """A single slot in a build.

    ``product`` is nullable because a build may exist with empty slots
    (DRAFT state) and the FK uses ``SET_NULL`` so deleting a product
    doesn't cascade-delete the user's build history.

    The (build, slot) pair is unique -- the slot is the natural upsert
    key when the frontend PATCHes a build with a fresh ``slots`` map.
    """

    id = models.BigAutoField(primary_key=True)

    build = models.ForeignKey(
        PCBuild,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        related_name="build_items",
        null=True,
        blank=True,
    )

    slot = models.CharField(
        _("slot"),
        max_length=16,
        choices=PCBuildSlot.choices,
    )

    class Meta:
        verbose_name = _("PC build item")
        verbose_name_plural = _("PC build items")
        ordering = ("slot",)
        constraints = [
            models.UniqueConstraint(
                fields=("build", "slot"),
                name="uniq_builditem_build_slot",
            ),
        ]
        indexes = [
            models.Index(fields=("build", "slot")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "%s/%s <%s>" % (self.build_id, self.slot, self.product_id)
