"""Brand models for Module 2."""
from __future__ import annotations

import uuid

from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel
from apps.common.validators import ImageValidator


def _brand_logo_path(instance: "Brand", filename: str) -> str:
    return "brands/logos/%s/%s" % (uuid.uuid4().hex, filename)


def _brand_banner_path(instance: "Brand", filename: str) -> str:
    return "brands/banners/%s/%s" % (uuid.uuid4().hex, filename)


class Brand(TimeStampedModel):
    """Product brand (manufacturer).

    Soft-delete via ``is_active``. Admin marks ``is_featured`` to drive
    a homepage carousel; vendors cannot toggle that flag.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    name = models.CharField(_("name"), max_length=120)
    slug = models.SlugField(
        _("slug"),
        max_length=140,
        db_index=True,
    )

    logo = models.ImageField(
        _("logo"),
        upload_to=_brand_logo_path,
        null=True,
        blank=True,
        validators=[ImageValidator(max_size_mb=2)],
    )
    banner = models.ImageField(
        _("banner"),
        upload_to=_brand_banner_path,
        null=True,
        blank=True,
        validators=[ImageValidator(max_size_mb=8)],
    )

    description = models.TextField(_("description"), blank=True)
    website = models.URLField(_("website"), blank=True)

    is_featured = models.BooleanField(_("is featured"), default=False, db_index=True)
    display_order = models.PositiveSmallIntegerField(default=0, db_index=True)

    # Denormalised counters (updated by reviews / sales signals in
    # later modules — keep them on the row for fast reads).
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_products = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = _("Brand")
        verbose_name_plural = _("Brands")
        ordering = ("display_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("slug",),
                condition=models.Q(is_active=True),
                name="uniq_brand_slug_active",
            ),
        ] 

    def __str__(self) -> str:  # pragma: no cover
        return self.name

    # ------------------------------------------------------------------
    # Slug auto-gen with collision handling.
    # ------------------------------------------------------------------
    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            base = slugify(self.name) or "brand"
            slug = base
            i = 1
            while (
                Brand.all_objects.filter(slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                i += 1
                slug = "%s-%d" % (base, i)
            self.slug = slug
        super().save(*args, **kwargs)
