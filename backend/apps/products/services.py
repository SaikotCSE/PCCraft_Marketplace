"""Service layer for the products app."""
from __future__ import annotations

import logging
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import VendorProfile
from apps.brands.models import Brand
from apps.categories.models import Category
from apps.products.models import (
    PriceHistory,
    Product,
    ProductImage,
    ProductStatus,
)

logger = logging.getLogger(__name__)


class ProductServiceError(Exception):
    def __init__(self, code: str, message: str, *, fields: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}


MAX_PRODUCT_IMAGES = 8


def _validate_specs_against_template(category: Category, specs: dict) -> None:
    """If the category has a ``spec_template``, every key in ``specs`` must
    be declared there. Unknown keys are rejected so we never drift from
    the canonical compatibility schema (§2.7)."""
    template = category.spec_template or []
    if not template:
        return
    declared = {entry["key"] for entry in template if "key" in entry}
    unknown = set(specs.keys()) - declared
    if unknown:
        raise ProductServiceError(
            "invalid_specs",
            "Specs contain keys not declared by the category.",
            fields={"specs": sorted(unknown)},
        )


class ProductService:
    """Stateless helper for product lifecycle."""

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def create(
        cls,
        *,
        vendor: VendorProfile,
        category: Category,
        brand: Brand,
        data: dict[str, Any],
        images: Iterable | None = None,
    ) -> Product:
        specs = data.get("specs") or {}
        _validate_specs_against_template(category, specs)

        # Stock-keeping unit uniqueness per vendor (active products only).
        sku = data["sku"]
        if Product.objects.filter(vendor=vendor, sku=sku).exists():
            raise ProductServiceError(
                "duplicate_sku",
                "A product with this SKU already exists for your shop.",
                fields={"sku": "Already used."},
            )

        product = Product(
            vendor=vendor,
            category=category,
            brand=brand,
            **{k: v for k, v in data.items() if k != "images"},
        )
        product.save()
        PriceHistory.objects.create(
            product=product, price=product.effective_price,
        )

        if images:
            cls._add_images(product, images)

        logger.info("products.create ok product_id=%s", product.pk)
        return product

    @classmethod
    @transaction.atomic
    def update(
        cls,
        product: Product,
        *,
        category: Category | None = None,
        brand: Brand | None = None,
        data: dict[str, Any],
    ) -> Product:
        if category is not None:
            product.category = category
            _validate_specs_against_template(category, data.get("specs") or product.specs)
        if brand is not None:
            product.brand = brand

        if "sku" in data and data["sku"] != product.sku:
            if (
                Product.objects.filter(vendor=product.vendor, sku=data["sku"])
                .exclude(pk=product.pk)
                .exists()
            ):
                raise ProductServiceError(
                    "duplicate_sku",
                    "A product with this SKU already exists for your shop.",
                    fields={"sku": "Already used."},
                )

        price_changed = False
        for field in (
            "name",
            "description",
            "short_description",
            "base_price",
            "discounted_price",
            "discount_start",
            "discount_end",
            "sku",
            "stock_quantity",
            "low_stock_threshold",
            "status",
            "is_featured",
            "weight_kg",
            "dimensions_cm",
            "warranty_months",
            "specs",
        ):
            if field in data:
                if field in {"base_price", "discounted_price"}:
                    price_changed = True
                setattr(product, field, data[field])

        product.save()

        if price_changed:
            PriceHistory.objects.create(
                product=product, price=product.effective_price,
            )
        logger.info("products.update ok product_id=%s", product.pk)
        return product

    @classmethod
    def soft_delete(cls, product: Product) -> None:
        product.soft_delete()

    # ------------------------------------------------------------------
    # Image management
    # ------------------------------------------------------------------
    @classmethod
    def _add_images(cls, product: Product, images: Iterable) -> list[ProductImage]:
        existing = product.images.filter(is_active=True).count()
        if existing + len(list(images)) > MAX_PRODUCT_IMAGES:
            raise ProductServiceError(
                "too_many_images",
                "A product can have at most %d images." % MAX_PRODUCT_IMAGES,
                fields={"images": "Limit reached."},
            )
        created: list[ProductImage] = []
        for idx, image in enumerate(images):
            created.append(ProductImage.objects.create(
                product=product,
                image=image,
                display_order=existing + idx,
                is_primary=(existing == 0 and idx == 0),
            ))
        return created

    @classmethod
    @transaction.atomic
    def add_images(cls, product: Product, images: Iterable) -> list[ProductImage]:
        return cls._add_images(product, images)

    @classmethod
    @transaction.atomic
    def delete_image(cls, product: Product, image_id: str) -> None:
        try:
            image = product.images.get(pk=image_id)
        except ProductImage.DoesNotExist:
            raise ProductServiceError("not_found", "Image not found.")
        was_primary = image.is_primary
        image.soft_delete()
        if was_primary:
            first = product.images.filter(is_active=True).order_by("display_order").first()
            if first is not None:
                first.is_primary = True
                first.save(update_fields=["is_primary", "updated_at"])

    @classmethod
    @transaction.atomic
    def reorder_images(cls, product: Product, ordered_ids: list[str]) -> None:
        ids = [str(i) for i in ordered_ids]
        images = {str(img.pk): img for img in product.images.filter(is_active=True)}
        if set(ids) != set(images.keys()):
            raise ProductServiceError(
                "invalid_ids",
                "Reorder payload must contain exactly the existing image ids.",
            )
        for idx, image_id in enumerate(ids):
            img = images[image_id]
            if img.display_order != idx:
                img.display_order = idx
                img.save(update_fields=["display_order", "updated_at"])

    @classmethod
    @transaction.atomic
    def set_primary_image(cls, product: Product, image_id: str) -> None:
        try:
            target = product.images.get(pk=image_id)
        except ProductImage.DoesNotExist:
            raise ProductServiceError("not_found", "Image not found.")
        product.images.filter(is_active=True, is_primary=True).exclude(
            pk=target.pk,
        ).update(is_primary=False)
        if not target.is_primary:
            target.is_primary = True
            target.save(update_fields=["is_primary", "updated_at"])

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @classmethod
    def transition_status(cls, product: Product, new_status: str) -> Product:
        if new_status not in ProductStatus.values:
            raise ProductServiceError(
                "invalid_status",
                "Unknown status: %s" % new_status,
                fields={"status": "Invalid choice."},
            )
        product.status = new_status
        product.save(update_fields=["status", "updated_at"])
        return product


# ====================================================================
# AdminProductService — Module 9 admin product moderation
# ====================================================================
class AdminProductServiceError(Exception):
    """Typed error for admin-product operations.

    The corresponding views read ``exc.http_status`` to map the failure
    to a DRF response, so every code MUST carry an explicit HTTP code.
    """

    DEFAULT_HTTP_STATUS = 400

    def __init__(
        self,
        code: str,
        message: str,
        *,
        fields: dict | None = None,
        http_status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.http_status = http_status or self.DEFAULT_HTTP_STATUS


class AdminProductService:
    """Business-logic for admin product moderation.

    Per spec §Module 9 (lines 3163-3185):

    * Admins can list / inspect / soft-delete / restore / hard-delete
      any product across all vendors.
    * Moderation actions (hide, restore, status change, delete) all
      require a ``reason`` / ``message`` field for the audit log.
    * Self-service vendor actions are NOT routed through this service
      — see :class:`ProductService` instead.
    """

    @staticmethod
    def list_products(
        *,
        status: str | None = None,
        vendor_id: str | None = None,
        search: str | None = None,
        ordering: str | None = None,
    ):
        """Return a queryset of all products (including drafts + soft-deleted).

        Uses ``Product.all_objects`` so admins can see rows hidden by
        vendors or by previous moderation actions. Filtering /
        ordering matches what the admin UI's filter bar needs.
        """
        qs = Product.all_objects.select_related("vendor", "brand", "category")

        if status:
            qs = qs.filter(status=status)
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        if search:
            term = search.strip()
            if term:
                qs = qs.filter(name__icontains=term)
        if ordering:
            # Defensive: only allow ordering on fields that exist on the
            # model to avoid leaking column-name info through 500s.
            allowed = {"created_at", "-created_at", "name", "-name",
                       "base_price", "-base_price", "updated_at", "-updated_at"}
            if ordering in allowed:
                qs = qs.order_by(ordering)
        return qs

    @staticmethod
    def get_product(product_id):
        """Fetch a single product (any status, any vendor) by UUID."""
        try:
            return Product.all_objects.select_related(
                "vendor", "brand", "category"
            ).get(pk=product_id)
        except Product.DoesNotExist as exc:
            raise AdminProductServiceError(
                "not_found",
                "Product not found.",
                fields={"product_id": "No product with that id."},
                http_status=404,
            ) from exc

    @staticmethod
    def get_product_by_slug(slug: str):
        try:
            return Product.all_objects.select_related(
                "vendor", "brand", "category"
            ).get(slug=slug)
        except Product.DoesNotExist as exc:
            raise AdminProductServiceError(
                "not_found",
                "Product not found.",
                fields={"slug": "No product with that slug."},
                http_status=404,
            ) from exc

    @staticmethod
    @transaction.atomic
    def soft_delete(*, actor, product_id, reason: str | None = None):
        """Flip ``is_active=False`` (soft delete). Reason is recorded
        via :class:`apps.common.audit` if available."""
        product = AdminProductService.get_product(product_id)
        if not product.is_active:
            return product  # idempotent
        product.soft_delete()
        AdminProductService._audit(
            actor=actor,
            action="product.soft_delete",
            target=product,
            reason=reason,
        )
        return product

    @staticmethod
    @transaction.atomic
    def hard_delete(*, actor, product_id, reason: str | None = None):
        """Permanently remove a product row. Spec line 3174 mandates
        a hard-delete option distinct from soft-delete."""
        product = AdminProductService.get_product(product_id)
        snapshot = {"id": str(product.pk), "slug": product.slug}
        product.delete()
        AdminProductService._audit(
            actor=actor,
            action="product.hard_delete",
            target=None,
            reason=reason,
            snapshot=snapshot,
        )
        return snapshot

    @staticmethod
    @transaction.atomic
    def hide(*, actor, product_id, reason: str | None = None):
        """Set status to HIDDEN. Reason is required for the audit log."""
        product = AdminProductService.get_product(product_id)
        if product.status == ProductStatus.HIDDEN:
            return product
        product.status = ProductStatus.HIDDEN
        product.save(update_fields=["status", "updated_at"])
        AdminProductService._audit(
            actor=actor,
            action="product.hide",
            target=product,
            reason=reason,
        )
        return product

    @staticmethod
    @transaction.atomic
    def restore(*, actor, product_id, reason: str | None = None):
        """Restore a HIDDEN product back to ACTIVE."""
        product = AdminProductService.get_product(product_id)
        if product.status == ProductStatus.HIDDEN:
            product.status = ProductStatus.ACTIVE
            product.save(update_fields=["status", "updated_at"])
        AdminProductService._audit(
            actor=actor,
            action="product.restore",
            target=product,
            reason=reason,
        )
        return product

    @staticmethod
    @transaction.atomic
    def moderate_status(*, actor, product_id, new_status: str, reason: str | None = None):
        """Set product.status to any :class:`ProductStatus` value."""
        product = AdminProductService.get_product(product_id)
        valid = {choice.value for choice in ProductStatus}
        if new_status not in valid:
            raise AdminProductServiceError(
                "invalid_status",
                "Unknown status: %s" % new_status,
                fields={"status": "Invalid choice."},
                http_status=400,
            )
        previous = product.status
        product.status = new_status
        product.save(update_fields=["status", "updated_at"])
        AdminProductService._audit(
            actor=actor,
            action="product.moderate",
            target=product,
            reason=reason,
            metadata={"from": previous, "to": new_status},
        )
        return product

    @staticmethod
    def _audit(*, actor, action: str, target, reason: str | None = None, snapshot=None, metadata=None):
        """Best-effort audit log entry. Wrapped in try/except so an
        audit-system outage never blocks a moderation action."""
        try:
            from apps.common.audit import log_action  # type: ignore
        except Exception:  # pragma: no cover
            logger.warning("apps.common.audit not available; skipping audit for %s", action)
            return
        try:
            log_action(
                actor=actor,
                action=action,
                target=target,
                reason=reason,
                snapshot=snapshot,
                metadata=metadata,
            )
        except Exception:  # pragma: no cover
            logger.exception("audit log failed for %s", action)


# ====================================================================
# ProductSearchService — Module 11 faceted search backend
# ====================================================================
class ProductSearchService:
    """Stateless facade used by ``/api/v1/search/`` (Module 11 §11.1).

    Build the queryset that the public search view paginates and
    serializes. Keeps the search-specific filter logic out of the
    public ``ProductService`` so admin / vendor CRUD isn't polluted
    with rating / discount / stock filters.
    """

    MAX_PAGE_SIZE = 40
    DEFAULT_SORT = "-created_at"

    @staticmethod
    def build_queryset(
        *,
        q: str = "",
        category_slugs: list[str] | None = None,
        brand_slugs: list[str] | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        in_stock: bool | None = None,
        discount: bool | None = None,
        min_rating: float | None = None,
        vendor_id: str | None = None,
        ordering: str = "",
    ):
        """Compose the public-facing product search queryset.

        Only ``ACTIVE`` products are exposed to anonymous / customer
        callers — drafts, paused, archived and hidden rows are
        filtered out by design.
        """
        from django.db.models import Avg, Count, Q

        qs = (
            Product.objects
            .select_related("vendor", "category", "brand")
            .filter(status=ProductStatus.ACTIVE)
        )

        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(description__icontains=q)
                | Q(sku__icontains=q)
            )

        if category_slugs:
            qs = qs.filter(category__slug__in=category_slugs)
        if brand_slugs:
            qs = qs.filter(brand__slug__in=brand_slugs)

        if min_price is not None:
            qs = qs.filter(base_price__gte=min_price)
        if max_price is not None:
            qs = qs.filter(base_price__lte=max_price)

        if in_stock:
            qs = qs.filter(stock_quantity__gt=0)
        if discount:
            qs = qs.filter(discounted_price__isnull=False)

        if min_rating is not None:
            qs = qs.annotate(_avg_rating=Avg("reviews__rating")).filter(
                _avg_rating__gte=min_rating,
            )

        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)

        # Annotate review count once so ordering is stable.
        qs = qs.annotate(_review_count=Count("reviews", distinct=True))

        allowed_orders = {
            "created_at", "-created_at",
            "base_price", "-base_price",
            "name", "-name",
        }
        if ordering and ordering in allowed_orders:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        return qs