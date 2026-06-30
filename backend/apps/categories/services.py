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
        """Create a new :class:`Category`.

        Resolves ``parent`` (string pk or model instance) and auto-
        generates the slug from ``name`` when not supplied. Refuses
        creation if the resulting slug is already taken.

        Args:
            data: Validated category fields. May include ``parent``
                (string pk or :class:`Category` instance) and
                ``slug``; both are popped from the mapping before
                being passed to the model constructor.

        Returns:
            The newly created :class:`Category` instance.

        Raises:
            CategoryServiceError: If the supplied ``parent`` does not
                exist (``code='invalid_parent'``), or the slug is
                already in use (``code='duplicate_slug'``).
        """
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
        """Update an existing :class:`Category`.

        Supports changing the ``parent`` (with self-parent guard and
        non-existent parent guard), the ``slug`` (with duplicate
        check), and editable attributes: ``name``, ``description``,
        ``display_order``, ``spec_template``, ``is_active``,
        ``icon``, and ``image``.

        Args:
            category: The :class:`Category` instance to update.
            data: Mapping of field names to new values. Unknown
                fields are ignored. ``parent`` may be a string pk,
                a :class:`Category` instance, or ``None`` to detach.

        Returns:
            The updated :class:`Category` instance.

        Raises:
            CategoryServiceError: If ``parent`` does not exist
                (``code='invalid_parent'``), the category would
                become its own parent (``code='invalid_parent'``),
                or the new ``slug`` is already in use by another
                category (``code='duplicate_slug'``).
        """
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


# ====================================================================
# CategoryAdminService — Module 9 admin category CRUD
# ====================================================================
class CategoryAdminServiceError(Exception):
    """Typed error for admin-category operations. Views read ``exc.http_status``."""

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


class CategoryAdminService:
    """Business-logic for admin category CRUD (Module 9 §9.4).

    Differences from :class:`CategoryService`:

    * admin actions write an audit-log entry,
    * admin can soft-delete a category that still has children ONLY if
      they re-parent or hard-delete the children (we refuse by default
      and surface ``has_children``).
    * the admin tree endpoint exposes inactive rows too.
    """

    @staticmethod
    def list_categories(*, search: str = "", is_active: str = "", parent: str = "", ordering: str = "display_order"):
        """Return a queryset of :class:`Category` with optional filters.

        Filters by ``name__icontains`` (case-insensitive) when
        ``search`` is provided, by ``is_active`` when ``is_active``
        is one of ``"true"|"1"|"yes"`` or ``"false"|"0"|"no"``, and
        by the parent category's slug when ``parent`` is given.
        ``ordering`` is restricted to an allow-list; anything else
        falls back to ``("display_order", "name")``.

        Args:
            search: Substring to match against ``name`` (whitespace
                trimmed).
            is_active: Tri-state string filter. ``"true"``, ``"1"``,
                ``"yes"`` filter to active; ``"false"``, ``"0"``,
                ``"no"`` filter to inactive; any other value is
                ignored.
            parent: Optional parent category slug to filter by.
            ordering: One of the allowed orderings: ``display_order``,
                ``-display_order``, ``name``, ``-name``,
                ``created_at``, ``-created_at``.

        Returns:
            A queryset of :class:`Category` rows.
        """
        qs = Category.all_objects.all()
        if search:
            qs = qs.filter(name__icontains=search.strip())
        if is_active in {"true", "1", "yes"}:
            qs = qs.filter(is_active=True)
        elif is_active in {"false", "0", "no"}:
            qs = qs.filter(is_active=False)
        if parent:
            qs = qs.filter(parent__slug=parent)
        allowed = {"display_order", "-display_order", "name", "-name",
                   "created_at", "-created_at"}
        if ordering in allowed:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("display_order", "name")
        return qs

    @staticmethod
    def get_category_by_slug(slug: str) -> Category:
        """Fetch a single :class:`Category` by its slug.

        Args:
            slug: The unique slug of the category.

        Returns:
            The matching :class:`Category` instance.

        Raises:
            CategoryAdminServiceError: If no category with ``slug``
                exists (``code='not_found'``, ``http_status=404``).
        """
        try:
            return Category.all_objects.get(slug=slug)
        except Category.DoesNotExist as exc:
            raise CategoryAdminServiceError(
                "not_found",
                "Category not found.",
                fields={"slug": "No category with that slug."},
                http_status=404,
            ) from exc

    @staticmethod
    def tree(*, include_inactive: bool = True):
        """Return a nested list of categories for the admin tree page.

        Output shape::

            [
              {
                "id": ..., "slug": ..., "name": ..., "is_active": ...,
                "children": [
                    {"id": ..., "slug": ..., "name": ..., "is_active": ...},
                    ...
                ],
              },
              ...
            ]
        """
        qs = Category.all_objects.select_related("parent").order_by(
            "display_order", "name",
        )
        if not include_inactive:
            qs = qs.filter(is_active=True)

        by_parent: dict = {}
        for cat in qs:
            key = cat.parent_id or "_root"
            by_parent.setdefault(key, []).append(cat)

        def _node(cat: Category) -> dict:
            return {
                "id": str(cat.id),
                "slug": cat.slug,
                "name": cat.name,
                "is_active": cat.is_active,
                "display_order": cat.display_order,
                "parent": cat.parent_id and str(cat.parent_id),
                "children": [
                    _node(child) for child in by_parent.get(cat.id, [])
                ],
            }

        return [_node(root) for root in by_parent.get("_root", [])]

    @staticmethod
    @transaction.atomic
    def create(*, actor, data: dict, request=None) -> Category:
        """Create a :class:`Category` and audit the action.

        Enforces a single-level nesting: a category whose
        ``parent`` is itself a child of another category is
        rejected with ``code='too_deep'``.

        Args:
            actor: The :class:`CustomUser` performing the action.
            data: Validated category fields. Requires ``name``;
                ``slug`` is optional. Other supported keys:
                ``description``, ``display_order``, ``is_active``,
                ``spec_template``, ``parent``, ``icon``, ``image``.
            request: Optional request object forwarded to the audit
                logger for IP/UA capture.

        Returns:
            The newly created :class:`Category` instance.

        Raises:
            CategoryAdminServiceError: If ``name`` is missing/blank
                (``code='validation_error'``), the supplied ``slug``
                is already in use (``code='slug_taken'``), or the
                new category would exceed the one-level nesting
                limit (``code='too_deep'``).
        """
        name = (data.get("name") or "").strip()
        if not name:
            raise CategoryAdminServiceError(
                "validation_error",
                "Name is required.",
                fields={"name": "This field is required."},
                http_status=400,
            )
        slug = (data.get("slug") or "").strip()
        if slug and Category.all_objects.filter(slug=slug).exists():
            raise CategoryAdminServiceError(
                "slug_taken",
                "Slug already in use.",
                fields={"slug": "Slug already in use."},
                http_status=400,
            )
        parent = data.get("parent")
        if parent is not None and parent.parent_id is not None:
            raise CategoryAdminServiceError(
                "too_deep",
                "Categories may only be nested one level deep.",
                fields={"parent": "Categories may only be nested one level deep."},
                http_status=400,
            )
        category = Category(
            name=name,
            slug=slug,
            description=data.get("description", "") or "",
            display_order=int(data.get("display_order") or 0),
            is_active=bool(data.get("is_active", True)),
            spec_template=data.get("spec_template") or [],
            parent=parent,
            icon=data.get("icon"),
            image=data.get("image"),
        )
        category.save()
        CategoryAdminService._audit(actor, "category.create", category, request=request)
        return category

    @staticmethod
    @transaction.atomic
    def update(*, actor, category: Category, data: dict, request=None) -> Category:
        """Update a :class:`Category` and audit the action.

        Editable fields: ``name``, ``slug``, ``description``,
        ``display_order``, ``is_active``, ``spec_template``,
        ``parent``, ``icon``, ``image``. Enforces single-level
        nesting on the new parent and refuses self-parenting.

        Args:
            actor: The :class:`CustomUser` performing the action.
            category: The :class:`Category` instance to update.
            data: Mapping of field names to new values.
            request: Optional request object forwarded to the audit
                logger.

        Returns:
            The updated :class:`Category` instance.

        Raises:
            CategoryAdminServiceError: If the new ``slug`` is
                already in use by another category
                (``code='slug_taken'``), the new parent is the
                category itself (``code='self_parent'``), or the
                nesting would exceed one level
                (``code='too_deep'``).
        """
        editable = {
            "name", "slug", "description", "display_order",
            "is_active", "spec_template", "parent", "icon", "image",
        }
        if "slug" in data and data["slug"]:
            new_slug = data["slug"].strip()
            if (
                new_slug != category.slug
                and Category.all_objects.filter(slug=new_slug).exists()
            ):
                raise CategoryAdminServiceError(
                    "slug_taken",
                    "Slug already in use.",
                    fields={"slug": "Slug already in use."},
                    http_status=400,
                )
            category.slug = new_slug
        if "parent" in data:
            new_parent = data["parent"]
            if new_parent is not None:
                if new_parent.id == category.id:
                    raise CategoryAdminServiceError(
                        "self_parent",
                        "A category cannot be its own parent.",
                        fields={"parent": "A category cannot be its own parent."},
                        http_status=400,
                    )
                if new_parent.parent_id is not None:
                    raise CategoryAdminServiceError(
                        "too_deep",
                        "Categories may only be nested one level deep.",
                        fields={"parent": "Categories may only be nested one level deep."},
                        http_status=400,
                    )
            category.parent = new_parent
        for field in editable - {"slug", "parent"}:
            if field in data:
                setattr(category, field, data[field])
        category.save()
        CategoryAdminService._audit(actor, "category.update", category, request=request)
        return category

    @staticmethod
    @transaction.atomic
    def soft_delete(*, actor, category: Category, request=None) -> None:
        """Soft-delete a :class:`Category` and audit the action.

        Refuses to delete a category that still has any children;
        the admin must re-parent or remove them first.

        Args:
            actor: The :class:`CustomUser` performing the action.
            category: The :class:`Category` instance to delete.
            request: Optional request object forwarded to the audit
                logger.

        Raises:
            CategoryAdminServiceError: If the category still has
                children (``code='has_children'``,
                ``http_status=400``).
        """
        if Category.all_objects.filter(parent=category).exists():
            raise CategoryAdminServiceError(
                "has_children",
                "Remove or re-parent child categories before deleting this one.",
                http_status=400,
            )
        category.soft_delete()
        CategoryAdminService._audit(actor, "category.soft_delete", category, request=request)

    @staticmethod
    @transaction.atomic
    def restore(*, actor, category: Category, request=None) -> Category:
        """Restore a previously soft-deleted :class:`Category`.

        Re-activates the row and audits the action. No-ops when
        the category is already active.

        Args:
            actor: The :class:`CustomUser` performing the action.
            category: The :class:`Category` instance to restore.
            request: Optional request object forwarded to the audit
                logger.

        Returns:
            The restored :class:`Category` instance.
        """
        if category.is_active:
            return category
        category.is_active = True
        category.save(update_fields=["is_active", "updated_at"])
        CategoryAdminService._audit(actor, "category.restore", category, request=request)
        return category

    @staticmethod
    def _audit(actor, action: str, target, *, request=None):
        """Best-effort audit log write for category actions.

        Args:
            actor: Admin user performing the action (may be ``None``).
            action: Stable action code, e.g. ``"category.create"``.
            target: Category instance being acted upon.
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
