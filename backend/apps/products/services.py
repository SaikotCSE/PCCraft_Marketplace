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