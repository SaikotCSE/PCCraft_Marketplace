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


# ====================================================================
# BrandAdminService — Module 9 admin brand CRUD
# ====================================================================
class BrandAdminServiceError(Exception):
    """Typed error for admin-brand operations. Views read ``exc.http_status``."""

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


class BrandAdminService:
    """Business-logic for admin brand CRUD (Module 9 §9.4).

    Mirrors :class:`BrandService` but every mutation records an audit
    log entry and refuses to operate on brands still referenced by
    products.
    """

    @staticmethod
    def list_brands(*, search: str = "", is_active: str = "", ordering: str = "display_order"):
        qs = Brand.all_objects.all()
        if search:
            qs = qs.filter(name__icontains=search.strip())
        if is_active in {"true", "1", "yes"}:
            qs = qs.filter(is_active=True)
        elif is_active in {"false", "0", "no"}:
            qs = qs.filter(is_active=False)
        allowed = {"display_order", "-display_order", "name", "-name",
                   "created_at", "-created_at"}
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("display_order", "name")
        return qs

    @staticmethod
    def get_brand_by_slug(slug: str) -> Brand:
        try:
            return Brand.all_objects.get(slug=slug)
        except Brand.DoesNotExist as exc:
            raise BrandAdminServiceError(
                "not_found",
                "Brand not found.",
                fields={"slug": "No brand with that slug."},
                http_status=404,
            ) from exc

    @staticmethod
    @transaction.atomic
    def create(*, actor, data: dict, request=None) -> Brand:
        name = (data.get("name") or "").strip()
        if not name:
            raise BrandAdminServiceError(
                "validation_error",
                "Name is required.",
                fields={"name": "This field is required."},
                http_status=400,
            )
        slug = (data.get("slug") or "").strip()
        if slug and Brand.all_objects.filter(slug=slug).exists():
            raise BrandAdminServiceError(
                "slug_taken",
                "Slug already in use.",
                fields={"slug": "Slug already in use."},
                http_status=400,
            )
        brand = Brand(
            name=name,
            slug=slug,
            description=data.get("description", "") or "",
            website=data.get("website", "") or "",
            is_featured=bool(data.get("is_featured", False)),
            is_active=bool(data.get("is_active", True)),
            display_order=int(data.get("display_order") or 0),
            logo=data.get("logo"),
            banner=data.get("banner"),
        )
        brand.save()
        BrandAdminService._audit(actor, "brand.create", brand, request=request)
        return brand

    @staticmethod
    @transaction.atomic
    def update(*, actor, brand: Brand, data: dict, request=None) -> Brand:
        editable = {
            "name", "slug", "description", "website",
            "is_featured", "is_active", "display_order",
            "logo", "banner",
        }
        if "slug" in data and data["slug"]:
            new_slug = data["slug"].strip()
            if (
                new_slug != brand.slug
                and Brand.all_objects.filter(slug=new_slug).exists()
            ):
                raise BrandAdminServiceError(
                    "slug_taken",
                    "Slug already in use.",
                    fields={"slug": "Slug already in use."},
                    http_status=400,
                )
            brand.slug = new_slug
        for field in editable - {"slug"}:
            if field in data:
                setattr(brand, field, data[field])
        brand.save()
        BrandAdminService._audit(actor, "brand.update", brand, request=request)
        return brand

    @staticmethod
    @transaction.atomic
    def soft_delete(*, actor, brand: Brand, request=None) -> None:
        try:
            from apps.products.models import Product
            if Product.all_objects.filter(brand=brand).exists():
                raise BrandAdminServiceError(
                    "has_products",
                    "Re-assign or delete products under this brand before removing it.",
                    http_status=400,
                )
        except BrandAdminServiceError:
            raise
        except Exception:  # pragma: no cover
            pass
        brand.soft_delete()
        BrandAdminService._audit(actor, "brand.soft_delete", brand, request=request)

    @staticmethod
    @transaction.atomic
    def restore(*, actor, brand: Brand, request=None) -> Brand:
        if brand.is_active:
            return brand
        brand.is_active = True
        brand.save(update_fields=["is_active", "updated_at"])
        BrandAdminService._audit(actor, "brand.restore", brand, request=request)
        return brand

    @staticmethod
    def _audit(actor, action: str, target, *, request=None):
        try:
            from apps.common.audit import log_action  # type: ignore
        except Exception:  # pragma: no cover
            return
        try:
            log_action(
                actor=actor,
                action=action,
                target=target,
                request=request,
            )
        except Exception:  # pragma: no cover
            logger.exception("audit log failed for %s", action)
