"""Shared abstract models and managers.

Every domain model inherits from ``TimeStampedModel`` so we get
``created_at``/``updated_at`` (and an ``is_active`` toggle for soft
delete) for free. Use ``ActiveManager`` as the default manager to
auto-filter soft-deleted rows; fall back to ``AllObjectsManager`` when
you really need everything (admin, background jobs).

Also hosts the cross-cutting ``AuditLog`` and ``LoginAttempt`` concrete
models used by the Module 9 admin panel + security layer.
"""
from __future__ import annotations

import uuid

from django.conf import settings
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


# =====================================================================
# Module 9 — cross-cutting concrete models: AuditLog + LoginAttempt
# =====================================================================
class AuditLog(models.Model):
    """A record of an admin (or system) action taken on a target row.

    Captured by ``apps.common.audit.AuditService.log`` from every
    moderation endpoint in Module 9. Stored as raw text rather than a
    FK so we can log actions on any model (including ones that may
    later be removed) and so the table can grow without migration
    churn. ``metadata`` is free-form JSON for endpoint-specific
    context (e.g. ``{"reason": "..."}`` for a vendor reject).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        help_text="The user (usually an admin) who performed the action. "
                  "Null for system-triggered actions (e.g. auto-lockout).",
    )
    action = models.CharField(
        max_length=80,
        db_index=True,
        help_text="Stable machine token, e.g. 'user.suspend', 'vendor.approve'.",
    )
    target_type = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Lowercase model name, e.g. 'user', 'vendor', 'product'.",
    )
    target_id = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="String form of the target's PK (UUIDs, ints, slugs all supported).",
    )
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Audit log entry"
        verbose_name_plural = "Audit log entries"
        ordering = ("-timestamp",)
        indexes = [
            models.Index(fields=("action", "-timestamp")),
            models.Index(fields=("target_type", "target_id")),
            models.Index(fields=("actor", "-timestamp")),
        ]

    def __str__(self) -> str:  # pragma: no cover -- debug aid
        return "AuditLog<%s %s target=%s:%s>" % (
            self.action,
            self.timestamp.isoformat(timespec="seconds"),
            self.target_type,
            self.target_id,
        )


class LoginAttempt(models.Model):
    """One row per login attempt (success or failure).

    Backs the admin "Login attempts" page and the rate-limit/lockout
    layer. Captured by ``apps.common.services.SecurityService.record_login_attempt``
    which is wired into ``apps.accounts.services.AuthService``.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.CharField(
        max_length=254,
        db_index=True,
        help_text="Submitted email (lowercased). Always recorded even for "
                  "non-existent accounts so attackers can't probe via timing.",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    success = models.BooleanField(default=False, db_index=True)
    failure_reason = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Stable code: bad_credentials, account_disabled, account_locked, role_mismatch.",
    )
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "Login attempt"
        verbose_name_plural = "Login attempts"
        ordering = ("-timestamp",)
        indexes = [
            models.Index(fields=("email", "-timestamp")),
            models.Index(fields=("ip_address", "-timestamp")),
            models.Index(fields=("success", "-timestamp")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        status = "ok" if self.success else "fail"
        return "LoginAttempt<%s %s %s>" % (status, self.email, self.timestamp.isoformat(timespec="seconds"))