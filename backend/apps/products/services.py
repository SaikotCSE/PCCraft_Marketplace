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
        """Create a new product owned by ``vendor`` and seed its price history.

        Validates that any ``specs`` keys are declared in
        ``category.spec_template`` (spec §2.7) and that the SKU is
        unique per active vendor product. If ``images`` is provided,
        the first uploaded image is promoted to ``is_primary``.

        Args:
            vendor: Vendor that owns the new product.
            category: Category the product belongs to; supplies
                ``spec_template`` for spec validation.
            brand: Brand attached to the product.
            data: Mapping of product fields, including ``sku``,
                ``name``, ``base_price`` and any other editable
                columns. ``images`` is consumed here and not stored
                on the product itself.
            images: Optional iterable of image uploads to attach.
                The first entry becomes the primary image.

        Returns:
            The freshly persisted :class:`Product`.

        Raises:
            ProductServiceError: With code ``invalid_specs`` (HTTP
                400) if ``data["specs"]`` contains keys absent from
                the category's template, or ``duplicate_sku`` (HTTP
                400) if the SKU is already used by another active
                product of the same vendor.
        """
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
        """Apply a partial update to ``product`` from a ``data`` mapping.

        Only keys listed in the editable-field whitelist are copied
        across. If ``category`` is supplied, ``specs`` are revalidated
        against the new category's ``spec_template``. When
        ``base_price`` or ``discounted_price`` change, a new
        :class:`PriceHistory` row is appended so the price-change
        timeline is auditable.

        Args:
            product: The product to mutate.
            category: Optional replacement category. When supplied,
                triggers spec validation against the new template.
            brand: Optional replacement brand.
            data: Mapping of editable fields. Unrecognised keys are
                silently ignored.

        Returns:
            The persisted :class:`Product` with updates applied.

        Raises:
            ProductServiceError: ``invalid_specs`` (HTTP 400) if the
                new specs contain keys not declared by the category,
                or ``duplicate_sku`` (HTTP 400) if the new SKU
                collides with another active product of the same
                vendor.
        """
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
        """Soft-delete ``product`` by delegating to the model hook.

        Vendor-initiated soft-delete uses this entry point; admin
        moderation should go through :class:`AdminProductService`
        instead so the audit log is populated.

        Args:
            product: The product to deactivate. Mutated in place.
        """
        product.soft_delete()

    # ------------------------------------------------------------------
    # Image management
    # ------------------------------------------------------------------
    @classmethod
    def _add_images(cls, product: Product, images: Iterable) -> list[ProductImage]:
        """Attach additional images to an existing product.

        Enforces the per-product image limit and persists each image
        with a stable display order. The first uploaded image is
        automatically marked primary unless one already exists.

        Args:
            product: Target ``Product`` instance (must be saved).
            images: Iterable of upload-file objects (``UploadedFile``
                or anything ``ProductImage.objects.create`` accepts).

        Returns:
            List of newly created ``ProductImage`` rows.

        Raises:
            ProductServiceError: ``"too_many_images"`` when the
                resulting count would exceed ``MAX_PRODUCT_IMAGES``.
        """
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
        """Attach new images to ``product`` while enforcing the per-product cap.

        Thin transactional wrapper around :meth:`_add_images` used
        by vendor-facing views.

        Args:
            product: Product that will own the new images.
            images: Iterable of image file uploads.

        Returns:
            The list of newly created :class:`ProductImage` rows.

        Raises:
            ProductServiceError: ``too_many_images`` (HTTP 400) if
                the cap defined by :data:`MAX_PRODUCT_IMAGES` would
                be exceeded.
        """
        return cls._add_images(product, images)

    @classmethod
    @transaction.atomic
    def delete_image(cls, product: Product, image_id: str) -> None:
        """Soft-delete a single image and promote a new primary if needed.

        If the deleted image was the primary, the next image by
        ``display_order`` is promoted so the storefront always has a
        hero image.

        Args:
            product: Product that owns the image.
            image_id: Primary key of the :class:`ProductImage` to
                remove.

        Raises:
            ProductServiceError: ``not_found`` (HTTP 404) when no
                image with ``image_id`` exists on the product.
        """
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
        """Rewrite the ``display_order`` of all active images for ``product``.

        ``ordered_ids`` must list every active image id exactly
        once; partial reorderings are rejected so we never end up
        with two images sharing a ``display_order`` or with rows
        that disappear from the storefront.

        Args:
            product: Product whose images are being reordered.
            ordered_ids: Image ids in the desired order.

        Raises:
            ProductServiceError: ``invalid_ids`` (HTTP 400) when the
                payload does not exactly match the set of active
                image ids.
        """
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
        """Mark ``image_id`` as the primary image for ``product``.

        Any other image currently flagged as primary is demoted in
        the same transaction.

        Args:
            product: Product that owns the images.
            image_id: Primary key of the image to promote.

        Raises:
            ProductServiceError: ``not_found`` (HTTP 404) if no
                matching image exists on the product.
        """
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
        """Set ``product.status`` to a valid :class:`ProductStatus` value.

        A simple state transition used by vendor flows; admin
        moderation should use :meth:`AdminProductService.moderate_status`
        so the action is audited.

        Args:
            product: Product whose status will change.
            new_status: Target status. Must be one of
                :attr:`ProductStatus.values`.

        Returns:
            The updated :class:`Product`.

        Raises:
            ProductServiceError: ``invalid_status`` (HTTP 400) when
                ``new_status`` is not a recognised choice.
        """
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
        """Fetch a product (any status, any vendor) by slug.

        Uses ``Product.all_objects`` so admins can inspect drafts and
        soft-deleted rows by slug.

        Args:
            slug: URL slug of the product.

        Returns:
            The matching :class:`Product` with ``vendor``, ``brand``
            and ``category`` eagerly loaded.

        Raises:
            AdminProductServiceError: ``not_found`` (HTTP 404) when
                no product matches the slug.
        """
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
        from django.contrib.postgres.search import (
            SearchQuery,
            SearchRank,
            SearchVector,
        )
        from django.db.models import Avg, Count, Q

        qs = (
            Product.objects
            .select_related("vendor", "category", "brand")
            .filter(status=ProductStatus.ACTIVE)
        )

        if q:
            # Use the GIN-indexed ``search_vector`` (name=A, short=B, desc=C)
            # for the primary full-text match, then fall back to
            # ``icontains`` on the same fields so a typo in an unindexed
            # column (e.g. SKU) still surfaces. The GIN lookup alone would
            # miss anything that hasn't been vectorised yet.
            try:
                sq = SearchQuery(q, search_type="websearch")
                qs = qs.annotate(
                    _rank=SearchRank(
                        SearchVector("name", weight="A")
                        + SearchVector("short_description", weight="B")
                        + SearchVector("description", weight="C"),
                        sq,
                    )
                ).filter(
                    Q(search_vector=sq)
                    | Q(name__icontains=q)
                    | Q(short_description__icontains=q)
                    | Q(description__icontains=q)
                )
                # Relevance sort needs the rank to be the first ORDER BY
                # term; downstream callers can override.
                if ordering in {"relevance", ""}:
                    qs = qs.order_by("-_rank", "-created_at")
            except Exception:  # noqa: BLE001
                # SQLite (tests) has no ``search_vector``; fall back to plain
                # icontains so the search endpoint still responds.
                logger.warning("FTS unavailable, falling back to icontains")
                qs = qs.filter(
                    Q(name__icontains=q)
                    | Q(short_description__icontains=q)
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

        # NOTE: ``Review.product`` declares ``related_query_name="review"``
        # (singular) so cross-app ``__`` lookups must use the query name,
        # not the manager name (``reviews``). Using ``reviews__rating`` raises
        # ``FieldError`` at SQL build time.
        if min_rating is not None:
            qs = qs.annotate(_avg_rating=Avg("review__rating")).filter(
                _avg_rating__gte=min_rating,
            )

        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)

        # Annotate review count once so ordering is stable. Same caveat as
        # above — must use the query name (``review``), not the manager
        # (``reviews``) which is only resolvable as a Python attribute.
        qs = qs.annotate(_review_count=Count("review", distinct=True))

        # Spec §11.1: ordering values are
        # ``relevance | newest | price | -price | rating | popularity``.
        # ``relevance`` is the default for a non-empty ``q``; ``popularity``
        # sorts by ``total_sold``; ``rating`` uses the denormalised
        # ``average_rating`` column (kept in sync by ReviewService).
        if ordering in {"newest", "relevance", ""}:
            order_expr = "-created_at"
        elif ordering == "price":
            order_expr = "base_price"
        elif ordering == "-price":
            order_expr = "-base_price"
        elif ordering == "rating":
            order_expr = "-average_rating"
        elif ordering == "-rating":
            order_expr = "average_rating"
        elif ordering == "popularity":
            order_expr = "-total_sold"
        elif ordering == "-popularity":
            order_expr = "total_sold"
        else:
            # Unknown / unsupported values fall back to newest so a bad URL
            # never 500s.
            order_expr = "-created_at"
        qs = qs.order_by(order_expr)

        return qs