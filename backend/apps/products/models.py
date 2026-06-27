"""Product models for Module 2 (spec §2.7)."""
from __future__ import annotations

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.common.models import TimeStampedModel
from apps.common.validators import ImageValidator


# --------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------
def _product_image_path(instance: "ProductImage", filename: str) -> str:
    return "products/%s/%s" % (uuid.uuid4().hex, filename)


class ProductStatus(models.TextChoices):
    DRAFT = "DRAFT", _("Draft")
    ACTIVE = "ACTIVE", _("Active")
    PAUSED = "PAUSED", _("Paused")
    ARCHIVED = "ARCHIVED", _("Archived")
    HIDDEN = "HIDDEN", _("Hidden")


class StockStatus(models.TextChoices):
    """Computed client-side; stored on each row for fast filtering."""

    IN_STOCK = "IN_STOCK", _("In stock")
    LOW_STOCK = "LOW_STOCK", _("Low stock")
    OUT_OF_STOCK = "OUT_OF_STOCK", _("Out of stock")


class Product(TimeStampedModel):
    """Canonical product row.

    Soft-delete via ``is_active`` (TimeStampedModel). Status workflow is
    separate from ``is_active``: ACTIVE+inactive == admin-disabled.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(_("name"), max_length=200)
    slug = models.SlugField(
        _("slug"),
        max_length=220,
        unique=True,
        db_index=True,
    )

    brand = models.ForeignKey(
        Brand,
        on_delete=models.PROTECT,
        related_name="products",
        verbose_name=_("brand"),
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
        verbose_name=_("category"),
    )
    vendor = models.ForeignKey(
        "accounts.VendorProfile",
        on_delete=models.PROTECT,
        related_name="products",
        verbose_name=_("vendor"),
    )

    description = models.TextField(_("description"), blank=True)
    short_description = models.CharField(
        _("short description"), max_length=500, blank=True,
    )

    # -- Pricing -----------------------------------------------------
    base_price = models.DecimalField(
        _("base price"),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    discounted_price = models.DecimalField(
        _("discounted price"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    discount_start = models.DateTimeField(_("discount start"), null=True, blank=True)
    discount_end = models.DateTimeField(_("discount end"), null=True, blank=True)

    # -- Inventory ---------------------------------------------------
    sku = models.CharField(
        _("sku"),
        max_length=80,
        db_index=True,
        help_text=_("Unique per vendor."),
    )
    stock_quantity = models.PositiveIntegerField(_("stock quantity"), default=0)
    low_stock_threshold = models.PositiveIntegerField(
        _("low stock threshold"), default=5,
    )

    # -- Lifecycle ---------------------------------------------------
    status = models.CharField(
        _("status"),
        max_length=16,
        choices=ProductStatus.choices,
        default=ProductStatus.DRAFT,
        db_index=True,
    )
    is_featured = models.BooleanField(_("is featured"), default=False, db_index=True)

    # -- Shipping ----------------------------------------------------
    weight_kg = models.DecimalField(
        _("weight (kg)"),
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
    )
    dimensions_cm = models.JSONField(
        _("dimensions (cm)"),
        null=True,
        blank=True,
        help_text=_("{'l': 0, 'w': 0, 'h': 0}"),
    )

    warranty_months = models.PositiveSmallIntegerField(_("warranty months"), default=0)

    # -- Category-specific structured attributes ---------------------
    specs = models.JSONField(_("specs"), default=dict, blank=True)

    # -- Denormalised counters (updated by reviews / sales signals) --
    average_rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=0,
    )
    review_count = models.PositiveIntegerField(default=0)
    total_sold = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = _("Product")
        verbose_name_plural = _("Products")
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("status", "is_active")),
            models.Index(fields=("category", "status", "is_active")),
            models.Index(fields=("brand", "status", "is_active")),
            models.Index(fields=("vendor", "status")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("vendor", "sku"),
                condition=models.Q(is_active=True),
                name="uniq_product_sku_per_vendor",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return self.name

    # ------------------------------------------------------------------
    # Pricing helpers
    # ------------------------------------------------------------------
    def is_discount_active(self) -> bool:
        """True iff a discount window exists and is currently in effect."""
        if self.discounted_price is None:
            return False
        if self.discount_start and self.discount_end:
            from django.utils import timezone
            now = timezone.now()
            return self.discount_start <= now <= self.discount_end
        if self.discount_start:
            from django.utils import timezone
            return self.discount_start <= timezone.now()
        if self.discount_end:
            from django.utils import timezone
            return timezone.now() <= self.discount_end
        return True  # discount price set but no window => always on

    @property
    def effective_price(self) -> Decimal:
        """Display price honouring the active discount window."""
        if self.is_discount_active() and self.discounted_price is not None:
            return self.discounted_price
        return self.base_price

    @property
    def discount_percent(self) -> int:
        if (
            self.discounted_price is None
            or self.discounted_price >= self.base_price
        ):
            return 0
        delta = self.base_price - self.discounted_price
        return int((delta / self.base_price) * Decimal(100))

    @property
    def is_in_stock(self) -> bool:
        return self.stock_quantity > 0

    @property
    def stock_status(self) -> str:
        if self.stock_quantity <= 0:
            return StockStatus.OUT_OF_STOCK
        if self.stock_quantity <= self.low_stock_threshold:
            return StockStatus.LOW_STOCK
        return StockStatus.IN_STOCK

    @property
    def is_purchasable(self) -> bool:
        """A product is purchasable iff it is ACTIVE, soft-active and in stock."""
        return (
            self.is_active
            and self.status == ProductStatus.ACTIVE
            and self.is_in_stock
        )

    # ------------------------------------------------------------------
    # Slug auto-gen with collision handling
    # ------------------------------------------------------------------
    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = slugify(self.name) or "product"
            slug = base
            i = 1
            while (
                Product.all_objects.filter(slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                i += 1
                slug = "%s-%d" % (base, i)
            self.slug = slug
        super().save(*args, **kwargs)


class ProductImage(TimeStampedModel):
    """Image attached to a Product (max 8 enforced in service layer)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image = models.ImageField(
        _("image"),
        upload_to=_product_image_path,
        validators=[ImageValidator(max_size_mb=8)],
    )
    alt_text = models.CharField(_("alt text"), max_length=200, blank=True)
    display_order = models.PositiveSmallIntegerField(_("display order"), default=0)
    is_primary = models.BooleanField(_("is primary"), default=False, db_index=True)

    class Meta:
        verbose_name = _("Product image")
        verbose_name_plural = _("Product images")
        ordering = ("display_order", "id")
        indexes = [
            models.Index(fields=("product", "display_order")),
        ]
        constraints = [
            # At most one primary image per product. Enforced in the
            # service layer; this constraint is a defence-in-depth.
            models.UniqueConstraint(
                fields=("product",),
                condition=models.Q(is_primary=True),
                name="uniq_primary_image_per_product",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "%s <%s>" % (self.product_id, self.image.name)


class PriceHistory(TimeStampedModel):
    """Append-only log of price changes."""

    id = models.BigAutoField(primary_key=True)
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="price_history",
    )
    price = models.DecimalField(max_digits=12, decimal_places=2)
    recorded_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = _("Price history")
        verbose_name_plural = _("Price history")
        ordering = ("-recorded_at",)
        indexes = [
            models.Index(fields=("product", "recorded_at")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return "%s @ %s" % (self.product_id, self.recorded_at.isoformat())
