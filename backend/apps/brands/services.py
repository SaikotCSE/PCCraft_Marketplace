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
        """Create a new :class:`Brand`.

        Derives the slug from ``data['name']`` if no explicit ``slug``
        is supplied, and refuses creation if the resulting slug is
        already taken.

        Args:
            data: Validated brand fields. May include an optional
                ``slug``; otherwise it is auto-generated from
                ``name``. The ``slug`` key is popped before being
                passed to the model constructor.

        Returns:
            The newly created :class:`Brand` instance.

        Raises:
            BrandServiceError: If the slug is already in use
                (``code='duplicate_slug'``).
        """
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
        """Update an existing :class:`Brand` with the supplied fields.

        Supports changing the ``slug`` (with duplicate check) and a
        fixed list of editable attributes: ``name``, ``description``,
        ``website``, ``is_active``, ``is_featured``, ``display_order``,
        ``logo``, and ``banner``.

        Args:
            brand: The :class:`Brand` instance to update.
            data: Mapping of field names to new values. Unknown fields
                are ignored.

        Returns:
            The updated :class:`Brand` instance.

        Raises:
            BrandServiceError: If a new ``slug`` is provided and
                another brand already uses it
                (``code='duplicate_slug'``).
        """
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
        """Return a queryset of :class:`Brand` with optional filters.

        Filters by ``name__icontains`` (case-insensitive) when
        ``search`` is provided, and by ``is_active`` when
        ``is_active`` is one of ``"true"|"1"|"yes"`` or
        ``"false"|"0"|"no"``. ``ordering`` is restricted to an
        allow-list; anything else falls back to
        ``("display_order", "name")``.

        Args:
            search: Substring to match against ``name`` (whitespace
                trimmed).
            is_active: Tri-state string filter. ``"true"``, ``"1"``,
                ``"yes"`` filter to active; ``"false"``, ``"0"``,
                ``"no"`` filter to inactive; any other value is
                ignored.
            ordering: One of the allowed orderings:
                ``display_order``, ``-display_order``, ``name``,
                ``-name``, ``created_at``, ``-created_at``.

        Returns:
            A queryset of :class:`Brand` rows.
        """
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
        """Fetch a single :class:`Brand` by its slug.

        Args:
            slug: The unique slug of the brand.

        Returns:
            The matching :class:`Brand` instance.

        Raises:
            BrandAdminServiceError: If no brand with ``slug`` exists
                (``code='not_found'``, ``http_status=404``).
        """
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
        """Create a :class:`Brand` and audit the action.

        Args:
            actor: The :class:`CustomUser` performing the action.
            data: Validated brand fields. Requires ``name``; ``slug``
                is optional. Other supported keys: ``description``,
                ``website``, ``is_featured``, ``is_active``,
                ``display_order``, ``logo``, ``banner``.
            request: Optional request object forwarded to the audit
                logger for IP/UA capture.

        Returns:
            The newly created :class:`Brand` instance.

        Raises:
            BrandAdminServiceError: If ``name`` is missing/blank
                (``code='validation_error'``) or the supplied ``slug``
                is already in use (``code='slug_taken'``).
        """
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
        """Update a :class:`Brand` and audit the action.

        Editable fields: ``name``, ``slug``, ``description``,
        ``website``, ``is_featured``, ``is_active``, ``display_order``,
        ``logo``, ``banner``. A new ``slug`` is rejected if another
        brand already uses it.

        Args:
            actor: The :class:`CustomUser` performing the action.
            brand: The :class:`Brand` instance to update.
            data: Mapping of field names to new values.
            request: Optional request object forwarded to the audit
                logger.

        Returns:
            The updated :class:`Brand` instance.

        Raises:
            BrandAdminServiceError: If the new ``slug`` is already in
                use by another brand (``code='slug_taken'``).
        """
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
        """Soft-delete a :class:`Brand` and audit the action.

        Refuses when products still reference the brand. A missing
        products app (e.g. before migrations) is silently tolerated.

        Args:
            actor: The :class:`CustomUser` performing the action.
            brand: The :class:`Brand` instance to delete.
            request: Optional request object forwarded to the audit
                logger.

        Raises:
            BrandAdminServiceError: If any products still reference
                this brand (``code='has_products'``,
                ``http_status=400``).
        """
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
        """Restore a previously soft-deleted :class:`Brand`.

        Re-activates the row and audits the action. No-ops when the
        brand is already active.

        Args:
            actor: The :class:`CustomUser` performing the action.
            brand: The :class:`Brand` instance to restore.
            request: Optional request object forwarded to the audit
                logger.

        Returns:
            The restored :class:`Brand` instance.
        """
        if brand.is_active:
            return brand
        brand.is_active = True
        brand.save(update_fields=["is_active", "updated_at"])
        BrandAdminService._audit(actor, "brand.restore", brand, request=request)
        return brand

    @staticmethod
    def _audit(actor, action: str, target, *, request=None):
        """Best-effort audit log write (see ``AccountService._audit``).

        Args:
            actor: User performing the action (may be ``None``).
            action: Stable action code, e.g. ``"brand.create"``.
            target: Brand instance being acted upon.
            request: Optional Django request for IP / UA capture.
        """
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
