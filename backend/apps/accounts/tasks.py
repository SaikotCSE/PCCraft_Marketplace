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


@shared_task(
    name="apps.accounts.tasks.send_verification_email",
    autoretry_for=(),
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def send_verification_email(user_id: str, code: str, purpose: str, code_id: str | None = None) -> dict:
    """Email a 6-digit OTP to ``user.email``.

    Best-effort like the other accounts tasks: failures are logged, never
    re-raised. The CODE is passed in the payload rather than re-fetched from
    the DB because only a salted hash is persisted.

    Parameters
    ----------
    user_id:
        UUID-string of the ``CustomUser``.
    code:
        Plaintext 6-digit code (e.g. ``"482910"``). Will be embedded
        verbatim in the email body.
    purpose:
        ``EmailVerificationCode.Purpose`` value. Currently only
        ``"signup"`` is wired; the parameter exists so password reset
        can reuse this task without modifying the worker contract.
    code_id:
        Optional ``EmailVerificationCode.pk`` for correlation in logs.
    """
    # Imports inside the task body so the worker never crashes at boot.
    from django.conf import settings
    from django.core.mail import send_mail

    from apps.accounts.models import CustomUser, EmailVerificationCode

    try:
        user = CustomUser.all_objects.get(pk=user_id)
    except CustomUser.DoesNotExist:
        logger.warning(
            "accounts.send_verification_email user_id=%s not found",
            user_id,
        )
        return {"user_id": user_id, "purpose": purpose, "skipped": True}

    display_name = user.full_name or user.email.split("@")[0]
    subject = "[PCCraft] Your verification code"
    if purpose == EmailVerificationCode.Purpose.PASSWORD_RESET:
        subject = "[PCCraft] Your password reset code"
    body = (
        f"Hi {display_name},\n\n"
        f"Your PCCraft verification code is: {code}\n\n"
        "This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.\n\n"
        f"— The PCCraft team"
    )
    sent = send_mail(
        subject,
        body,
        getattr(settings, "DEFAULT_FROM_EMAIL", None),
        [user.email],
        fail_silently=True,
    )
    logger.info(
        "accounts.send_verification_email user_id=%s purpose=%s code_id=%s notified=%d",
        user_id,
        purpose,
        code_id or "?",
        int(sent or 0),
    )
    return {
        "user_id": user_id,
        "purpose": purpose,
        "notified": int(sent or 0),
        "skipped": False,
    }
