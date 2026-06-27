"""Shared abstract models and managers.

Every domain model inherits from ``TimeStampedModel`` so we get
``created_at``/``updated_at`` (and an ``is_active`` toggle for soft
delete) for free. Use ``ActiveManager`` as the default manager to
auto-filter soft-deleted rows; fall back to ``AllObjectsManager`` when
you really need everything (admin, background jobs).
"""
from __future__ import annotations

from django.db import models
from django.utils import timezone


class ActiveManager(models.Manager):
    """Default manager -- hides rows where ``is_active=False``."""

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(is_active=True)


class AllObjectsManager(models.Manager):
    """Bypass manager -- returns every row, including soft-deleted."""

    use_for_related_fields = True


class TimeStampedModel(models.Model):
    """Abstract base providing audit + soft-delete columns."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, db_index=True)

    # Default manager hides inactive rows.
    objects = ActiveManager()
    # Bypass manager exposes everything (incl. soft-deleted).
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        ordering = ("-created_at",)

    def soft_delete(self) -> None:
        """Flip ``is_active=False`` instead of removing the row."""
        self.is_active = False
        self.save(update_fields=["is_active", "updated_at"])

    def restore(self) -> None:
        self.is_active = True
        self.save(update_fields=["is_active", "updated_at"])

    def __str__(self) -> str:  # pragma: no cover -- debug aid only
        ts = timezone.now().isoformat(timespec="seconds")
        return f"<{self.__class__.__name__} id={self.pk} updated={ts}>"