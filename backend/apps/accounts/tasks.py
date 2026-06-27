"""Celery tasks for the ``accounts`` app.

Per CLAUDE.md §"Code Quality": every Celery task goes in ``tasks.py``
in its app and is decorated with ``@shared_task``. Tasks dispatch via
``notify_admins_new_vendor.delay(vendor_profile_id)`` from
``apps.accounts.services.AuthService.register_vendor``.

The task is best-effort:
- Email is sent via ``fail_silently=True`` (development console backend
  just writes to the runserver log).
- Errors are logged, never re-raised — a failed notification must not
  roll back a successful vendor registration.
"""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.accounts.tasks.notify_admins_new_vendor",
    autoretry_for=(),
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def notify_admins_new_vendor(vendor_profile_id: int) -> dict:
    """Email every active staff member that a new vendor is awaiting review.

    Parameters
    ----------
    vendor_profile_id:
        Primary key of the :class:`apps.accounts.models.VendorProfile` that
        was just created. We re-fetch by id (rather than serialising the
        whole model) so the task body is small and re-try safe.

    Returns
    -------
    dict
        ``{"profile_id": int, "notified": int, "skipped": bool}`` -- the
        count of staff emails the backend accepted.
    """
    # Imports inside the task body so the worker doesn't crash at boot
    # if Django isn't fully ready.
    from django.conf import settings
    from django.contrib.auth import get_user_model
    from django.core.mail import send_mail

    from apps.accounts.models import VendorProfile

    try:
        profile = VendorProfile.all_objects.select_related("user").get(pk=vendor_profile_id)
    except VendorProfile.DoesNotExist:
        logger.warning(
            "accounts.notify_admins_new_vendor profile_id=%s not found",
            vendor_profile_id,
        )
        return {"profile_id": vendor_profile_id, "notified": 0, "skipped": True}

    User = get_user_model()
    staff_emails = list(
        User.objects.filter(is_staff=True, is_active=True).values_list("email", flat=True)
    )
    if not staff_emails:
        logger.info(
            "accounts.notify_admins_new_vendor profile_id=%s -- no staff emails configured",
            vendor_profile_id,
        )
        return {"profile_id": vendor_profile_id, "notified": 0, "skipped": True}

    subject = f"[PCCraft] New vendor application -- {profile.store_name}"
    body = (
        "A new vendor has registered and is awaiting review.\n\n"
        f"  Store:   {profile.store_name} ({profile.store_slug})\n"
        f"  Owner:   {profile.owner_name}\n"
        f"  Email:   {profile.user.email}\n"
        f"  License: {profile.trade_license_number}\n\n"
        f"Review at: /admin/accounts/vendorprofile/{profile.pk}/"
    )
    sent = send_mail(
        subject,
        body,
        getattr(settings, "DEFAULT_FROM_EMAIL", None),
        staff_emails,
        fail_silently=True,
    )
    logger.info(
        "accounts.notify_admins_new_vendor profile_id=%s notified=%d",
        vendor_profile_id,
        sent,
    )
    return {"profile_id": vendor_profile_id, "notified": int(sent or 0), "skipped": False}