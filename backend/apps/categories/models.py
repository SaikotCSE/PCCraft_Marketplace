"""Category tree models for Module 2.

A self-referential tree (``parent`` FK → ``Category``) backs the
hierarchical product taxonomy described in spec §2.7:

    CPUs → Gaming CPUs, Server CPUs, Workstation CPUs
    GPU  → NVIDIA, AMD
    ...

Soft-delete via ``TimeStampedModel.is_active``; admin can hide a node
without losing products that already reference it (foreign keys use
``on_delete=PROTECT`` so the link stays intact).
"""
from __future__ import annotations

import uuid

from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


def _category_icon_path(instance: "Category", filename: str) -> str:
    """Upload path: ``categories/icons/<uuid4>/<file>``."""
    return "categories/icons/%s/%s" % (uuid.uuid4().hex, filename)


def _category_image_path(instance: "Category", filename: str) -> str:
    """Upload path: ``categories/banners/<uuid4>/<file>``."""
    return "categories/banners/%s/%s" % (uuid.uuid4().hex, filename)


class Category(TimeStampedModel):
    """Hierarchical product category.

    ``spec_template`` is a JSON blob describing the per-category spec
    fields the vendor form should render (mirrors spec §2.7). Keeping it
    on the category means frontend and backend can stay in sync without
    a separate schema table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(_("name"), max_length=120)
    slug = models.SlugField(
        _("slug"),
        max_length=140,
        db_index=True,
    )

    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        related_name="children",
        null=True,
        blank=True,
        limit_choices_to={"parent__isnull": True},  # max depth = 2 for the v1
    )

    description = models.TextField(_("description"), blank=True)

    icon = models.ImageField(
        _("icon"),
        upload_to=_category_icon_path,
        null=True,
        blank=True,
    )
    image = models.ImageField(
        _("banner image"),
        upload_to=_category_image_path,
        null=True,
        blank=True,
    )

    # Display ordering inside the parent (lower = first). Default 0 so
    # we can sort child lists with no extra work.
    display_order = models.PositiveSmallIntegerField(default=0, db_index=True)

    # Spec schema template for products in this category. Shape::
    #
    #   [
    #     {"key": "socket",      "label": "Socket",      "type": "str"},
    #     {"key": "cores",       "label": "Cores",       "type": "int"},
    #     {"key": "tdp_w",       "label": "TDP (W)",     "type": "int"},
    #     {"key": "igpu",        "label": "Integrated GPU", "type": "bool"},
    #     {"key": "ram_type",    "label": "Memory Type", "type": "list[str]"},
    #     ...
    #   ]
    #
    # Used by the vendor product form and the compatibility module.
    spec_template = models.JSONField(
        _("spec template"),
        default=list,
        blank=True,
        help_text=_("Per-category spec field definitions (see spec §2.7)."),
    )

    class Meta:
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")
        ordering = ("display_order", "name")
        indexes = [
            models.Index(fields=("parent", "display_order")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("slug",),
                condition=models.Q(is_active=True),
                name="uniq_category_slug_active",
            ),
        ]
    # Convenience helpers
    # ------------------------------------------------------------------
    @property
    def depth(self) -> int:
        """0 = root, 1 = first-level child. The v1 tree caps at depth=1."""
        depth = 0
        node = self
        while node.parent_id is not None:
            depth += 1
            node = node.parent
        return depth

    def get_ancestors(self) -> list["Category"]:
        """Return parent → grandparent → ... → root."""
        chain: list[Category] = []
        node = self.parent
        while node is not None:
            chain.append(node)
            node = node.parent
        return list(reversed(chain))

    def get_descendants(self) -> models.QuerySet["Category"]:
        """Immediate children only (one level deep)."""
        return Category.objects.filter(parent=self)

    def get_full_slug_path(self) -> str:
        """``"cpus/gaming-cpus"``-style path. Used for breadcrumbs."""
        slugs = [c.slug for c in self.get_ancestors()]
        slugs.append(self.slug)
        return "/".join(slugs)

    # ------------------------------------------------------------------
    # Slug auto-gen with collision handling
    # ------------------------------------------------------------------
    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = slugify(self.name) or "category"
            slug = base
            i = 1
            # Use ``all_objects`` so a soft-deleted row with the same
            # slug still counts as taken.
            while (
                Category.all_objects.filter(slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                i += 1
                slug = "%s-%d" % (base, i)
            self.slug = slug
        # Guard the depth invariant: a category whose parent already has
        # a parent becomes a flat-level row (depth stays 1). We do this
        # rather than rejecting so admins can flatten a tree during
        # restructuring without an IntegrityError.
        if self.parent_id is not None:
            grandparent = self.parent.parent_id
            if grandparent is not None:
                self.parent_id = grandparent
        super().save(*args, **kwargs)
