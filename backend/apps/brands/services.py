"""Service layer for the brands app."""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils.text import slugify

from apps.brands.models import Brand


class BrandServiceError(Exception):
    def __init__(self, code: str, message: str, *, fields: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}


class BrandService:
    """Stateless helper — every method is a classmethod-equivalent."""

    # ------------------------------------------------------------------
    # Writes (admin only — enforced at the view layer)
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def create(cls, data: dict[str, Any]) -> Brand:
        slug = data.pop("slug", None) or slugify(data.get("name", ""))
        if Brand.objects.filter(slug=slug).exists():
            raise BrandServiceError(
                "duplicate_slug",
                "A brand with this slug already exists.",
                fields={"slug": "Already taken."},
            )
        brand = Brand(slug=slug, **data)
        brand.save()
        return brand

    @classmethod
    @transaction.atomic
    def update(cls, brand: Brand, data: dict[str, Any]) -> Brand:
        if "slug" in data and data["slug"]:
            new_slug = data["slug"]
            if (
                Brand.objects.filter(slug=new_slug)
                .exclude(pk=brand.pk)
                .exists()
            ):
                raise BrandServiceError(
                    "duplicate_slug",
                    "A brand with this slug already exists.",
                    fields={"slug": "Already taken."},
                )
            brand.slug = new_slug

        for field in (
            "name",
            "description",
            "website",
            "is_active",
            "is_featured",
            "display_order",
        ):
            if field in data:
                setattr(brand, field, data[field])

        for field in ("logo", "banner"):
            if field in data:
                setattr(brand, field, data[field])

        brand.save()
        return brand

    @classmethod
    def soft_delete(cls, brand: Brand) -> None:
        """Refuse if any products still reference this brand."""
        # Avoid a hard import on the products app so we don't introduce
        # an import cycle (products → brands → products).
        try:
            from apps.products.models import Product
        except Exception:  # pragma: no cover -- products not migrated yet
            Product = None  # type: ignore[assignment]

        if Product is not None and Product.all_objects.filter(brand=brand).exists():
            raise BrandServiceError(
                "has_products",
                "Re-assign or delete products under this brand before removing it.",
            )
        brand.soft_delete()
