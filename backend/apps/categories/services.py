"""Service layer for the categories app.

Views call only these helpers — no business logic in views, per the
project-wide coding standards.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils.text import slugify

from apps.categories.models import Category


class CategoryServiceError(Exception):
    """Typed error so views can map to HTTP status codes."""

    def __init__(self, code: str, message: str, *, fields: dict | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}


class CategoryService:
    """Stateless helper — every method is a classmethod-equivalent."""

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------
    @staticmethod
    def tree(*, only_active: bool = True) -> list[dict[str, Any]]:
        """Return the entire category forest as nested dicts.

        Each top-level entry is::

            {
                "id": ..., "name": ..., "slug": ...,
                "icon": ..., "image": ..., "description": ...,
                "display_order": ..., "is_active": ...,
                "children": [<same shape>, ...],
            }
        """
        qs = Category.all_objects.all() if not only_active else Category.objects.all()
        # Order by display_order so admins control browse order.
        rows = list(qs.order_by("display_order", "name"))
        by_parent: dict[Any, list[Category]] = {}
        for row in rows:
            by_parent.setdefault(row.parent_id, []).append(row)

        def _serialize(node: Category) -> dict[str, Any]:
            return {
                "id": str(node.id),
                "name": node.name,
                "slug": node.slug,
                "description": node.description or "",
                "icon": node.icon.url if node.icon else None,
                "image": node.image.url if node.image else None,
                "display_order": node.display_order,
                "is_active": node.is_active,
                "spec_template": node.spec_template or [],
                "children": [_serialize(c) for c in by_parent.get(node.id, [])],
            }

        return [_serialize(c) for c in by_parent.get(None, [])]

    # ------------------------------------------------------------------
    # Writes (admin only — enforced at the view layer)
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def create(cls, data: dict[str, Any]) -> Category:
        parent = data.pop("parent", None)
        if isinstance(parent, str) and parent:
            try:
                parent = Category.objects.get(pk=parent)
            except Category.DoesNotExist as exc:
                raise CategoryServiceError(
                    "invalid_parent", "Parent category not found.",
                ) from exc
        elif parent is None:
            parent = None

        # Slug comes from the name when not provided.
        slug = data.pop("slug", None) or slugify(data.get("name", ""))
        if Category.objects.filter(slug=slug).exists():
            raise CategoryServiceError(
                "duplicate_slug",
                "A category with this slug already exists.",
                fields={"slug": "Already taken."},
            )

        category = Category(parent=parent, slug=slug, **data)
        category.save()
        return category

    @classmethod
    @transaction.atomic
    def update(cls, category: Category, data: dict[str, Any]) -> Category:
        if "parent" in data:
            parent = data.pop("parent")
            if isinstance(parent, str) and parent:
                try:
                    parent_obj = Category.objects.get(pk=parent)
                except Category.DoesNotExist as exc:
                    raise CategoryServiceError(
                        "invalid_parent", "Parent category not found.",
                    ) from exc
                if parent_obj.id == category.id:
                    raise CategoryServiceError(
                        "invalid_parent", "A category cannot be its own parent.",
                    )
                category.parent = parent_obj
            else:
                category.parent = None

        if "slug" in data and data["slug"]:
            new_slug = data["slug"]
            if (
                Category.objects.filter(slug=new_slug)
                .exclude(pk=category.pk)
                .exists()
            ):
                raise CategoryServiceError(
                    "duplicate_slug",
                    "A category with this slug already exists.",
                    fields={"slug": "Already taken."},
                )
            category.slug = new_slug

        for field in (
            "name",
            "description",
            "display_order",
            "spec_template",
            "is_active",
        ):
            if field in data:
                setattr(category, field, data[field])

        # Replace icon/image if a fresh file was uploaded. DRF's
        # ImageField accepts ``None`` to clear the file.
        for field in ("icon", "image"):
            if field in data:
                setattr(category, field, data[field])

        category.save()
        return category

    @classmethod
    def soft_delete(cls, category: Category) -> None:
        """Soft delete + refuse if the category still has active children
        with products (admin needs to re-parent first)."""
        # Refuse if it has any children, active or not -- safer to require
        # explicit un-parenting.
        if Category.all_objects.filter(parent=category).exists():
            raise CategoryServiceError(
                "has_children",
                "Remove or re-parent child categories before deleting this one.",
            )
        category.soft_delete()
