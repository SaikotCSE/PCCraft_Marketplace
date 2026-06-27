"""Auth business-logic layer.

Per spec §Module 1: *"all views call services only -- no logic in views"*.
``AuthService`` is a class-with-static-methods -- there is no instance
state to preserve, and the call sites read like:

    AuthService.register_customer(serializer.validated_data)

If we ever need per-request state (rate limiting, audit hooks), add a
``__init__`` and inject via DRF's view init.
"""
from __future__ import annotations

import logging
from typing import Any, Mapping

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import (
    CustomerProfile,
    CustomUser,
    UserRole,
    VendorProfile,
    VendorStatus,
)

logger = logging.getLogger(__name__)


class AuthServiceError(Exception):
    """Raised by AuthService for *expected* user-facing failures.

    Views translate this into a 400/401 envelope response -- never a 500.
    """

    def __init__(self, message: str, *, code: str = "auth_error", fields: Mapping[str, str] | None = None):
        super().__init__(message)
        self.message = str(message)
        self.code = code
        self.fields = dict(fields or {})


class AuthService:
    """Stateless facade over registration + login + token logic."""

    # ───────────────────────── registration ─────────────────────────
    @staticmethod
    @transaction.atomic
    def register_customer(data: Mapping[str, Any]) -> tuple[CustomUser, CustomerProfile]:
        """Create the user + customer profile in a single transaction.

        ``data`` keys:
            email, password, full_name, phone,
            date_of_birth (optional), gender (optional), avatar (optional)
        """
        password = data.get("password")
        if not password:
            raise AuthServiceError("Password is required.", code="missing_password")

        email = CustomUser.objects.normalize_email(data["email"]).lower()
        if CustomUser.all_objects.filter(email__iexact=email).exists():
            raise AuthServiceError(
                "An account with this email already exists.",
                code="email_taken",
                fields={"email": "Email already registered."},
            )

        user = CustomUser.objects.create_user(
            email=email,
            password=password,
            full_name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            role=UserRole.CUSTOMER,
            date_of_birth=data.get("date_of_birth"),
            gender=data.get("gender", ""),
            avatar=data.get("avatar"),
        )
        # The post_save signal may have already created the profile;
        # ``get_or_create`` is the idempotent contract.
        profile, _ = CustomerProfile.objects.get_or_create(user=user)
        logger.info("accounts.register_customer ok user_id=%s", user.pk)
        return user, profile

    @staticmethod
    @transaction.atomic
    def register_vendor(data: Mapping[str, Any], files: Mapping[str, Any] | None = None) -> tuple[CustomUser, VendorProfile]:
        """Create the user + vendor profile (status=PENDING) + notify staff.

        ``data`` is the validated multipart body minus files. ``files``
        is ``request.FILES`` (or None for tests calling directly).

        Required files: ``trade_license_doc``, ``nid_doc``.
        """
        files = files or {}
        password = data.get("password")
        if not password:
            raise AuthServiceError("Password is required.", code="missing_password")

        email = CustomUser.objects.normalize_email(data["email"]).lower()
        if CustomUser.all_objects.filter(email__iexact=email).exists():
            raise AuthServiceError(
                "An account with this email already exists.",
                code="email_taken",
                fields={"email": "Email already registered."},
            )

        user = CustomUser.objects.create_user(
            email=email,
            password=password,
            full_name=data.get("owner_name") or data.get("full_name", ""),
            phone=data.get("phone", ""),
            role=UserRole.VENDOR,
        )

        trade_license_doc = files.get("trade_license_doc")
        nid_doc = files.get("nid_doc")
        if not trade_license_doc or not nid_doc:
            raise AuthServiceError(
                "Trade license document and NID document are required.",
                code="missing_documents",
            )

        profile, created = VendorProfile.objects.get_or_create(
            user=user,
            defaults={
                "business_name": data.get("business_name", ""),
                "owner_name": data.get("owner_name", ""),
                "business_type": data.get("business_type", VendorProfile._meta.get_field("business_type").default),
                "business_phone": data.get("business_phone", ""),
                "trade_license_number": data.get("trade_license_number", ""),
                "trade_license_doc": trade_license_doc,
                "nid_number": data.get("nid_number", ""),
                "nid_doc": nid_doc,
                "business_address": data.get("business_address", {}),
                "store_name": data.get("store_name", data.get("business_name", "")),
                "store_description": data.get("store_description", ""),
                "store_contact_email": data.get("store_contact_email", ""),
                "store_logo": files.get("store_logo"),
                "store_banner": files.get("store_banner"),
                "vendor_return_policy": data.get("vendor_return_policy", ""),
                "low_stock_threshold": data.get("low_stock_threshold", 5),
                "status": VendorStatus.PENDING,
            },
        )
        if not created:
            # Signal-created profile (shouldn't happen now that the
            # signal doesn't auto-create vendor profiles, but keep the
            # safety net for any historical rows). Fill the fields.
            profile.business_name = data.get("business_name", profile.business_name)
            profile.owner_name = data.get("owner_name", profile.owner_name)
            profile.business_type = data.get(
                "business_type", profile.business_type
            )
            profile.business_phone = data.get("business_phone", profile.business_phone)
            profile.trade_license_number = data.get(
                "trade_license_number", profile.trade_license_number
            )
            profile.trade_license_doc = trade_license_doc or profile.trade_license_doc
            profile.nid_number = data.get("nid_number", profile.nid_number)
            profile.nid_doc = nid_doc or profile.nid_doc
            profile.business_address = data.get(
                "business_address", profile.business_address
            )
            profile.store_name = data.get(
                "store_name", data.get("business_name", profile.store_name)
            )
            profile.store_description = data.get(
                "store_description", profile.store_description
            )
            profile.store_contact_email = data.get(
                "store_contact_email", profile.store_contact_email
            )
            if files.get("store_logo"):
                profile.store_logo = files["store_logo"]
            if files.get("store_banner"):
                profile.store_banner = files["store_banner"]
            profile.vendor_return_policy = data.get(
                "vendor_return_policy", profile.vendor_return_policy
            )
            profile.low_stock_threshold = data.get(
                "low_stock_threshold", profile.low_stock_threshold
            )
            profile.status = VendorStatus.PENDING
            # Full save so ``VendorProfile.save()`` runs and generates
            # the slug if it was missing.
            profile.save()
        # Notify staff asynchronously. The task body lives in
        # ``apps/accounts/tasks.py`` (CLAUDE.md: every Celery task goes
        # in its app's ``tasks.py`` as ``@shared_task``). We swallow
        # broker errors so a missing Redis never blocks registration --
        # the user still gets a successful response and the profile is
        # marked PENDING for the staff to discover via the admin queue.
        try:
            from apps.accounts.tasks import notify_admins_new_vendor

            notify_admins_new_vendor.delay(profile.pk)
        except Exception:  # pragma: no cover -- broker down / EAGER mode off
            logger.exception(
                "accounts.register_vendor -- celery dispatch failed for profile_id=%s",
                profile.pk,
            )
        logger.info("accounts.register_vendor ok user_id=%s store=%s", user.pk, profile.store_slug)
        return user, profile

    # ───────────────────────── login / logout ─────────────────────────
    @staticmethod
    def authenticate_login(email: str, password: str, expected_role: str) -> CustomUser:
        """Validate credentials AND that the user's role matches ``expected_role``.

        Raises ``AuthServiceError`` with ``code='unauthenticated'`` for
        bad creds and ``code='role_mismatch'`` for the role gate.
        """
        if expected_role not in {choice for choice, _ in UserRole.choices}:
            raise AuthServiceError("Invalid role.", code="invalid_role")

        user = authenticate(username=email, password=password)
        if user is None:
            raise AuthServiceError("Invalid email or password.", code="unauthenticated")
        if not user.is_active:
            raise AuthServiceError("This account is disabled.", code="account_disabled")
        if user.role != expected_role:
            raise AuthServiceError(
                "This account cannot sign in via this portal.",
                code="role_mismatch",
            )
        return user

    @staticmethod
    def issue_tokens(user: CustomUser) -> dict[str, str]:
        """Mint a fresh access+refresh JWT pair (with role embedded)."""
        refresh = RefreshToken.for_user(user)
        # Mirror the custom claims injected by ``LoginSerializer``.
        refresh["role"] = user.role
        refresh["full_name"] = user.full_name
        refresh["is_verified"] = user.is_verified
        return {"access": str(refresh.access_token), "refresh": str(refresh)}

    @staticmethod
    def blacklist_refresh(refresh_token: str) -> None:
        """Best-effort blacklist -- log and re-raise as ``AuthServiceError``."""
        if not refresh_token:
            raise AuthServiceError("Refresh token missing.", code="missing_token")
        try:
            RefreshToken(refresh_token).blacklist()
        except Exception as exc:  # noqa: BLE001 -- surface as auth_error
            logger.warning("accounts.blacklist_refresh failed: %s", exc)
            raise AuthServiceError(
                "Refresh token is invalid or already revoked.",
                code="invalid_token",
            ) from exc

    # ───────────────────────── notifications ─────────────────────────
    # The Celery task ``apps.accounts.tasks.notify_admins_new_vendor`` is
    # dispatched inline in ``register_vendor`` above. We keep the import
    # there lazy so module import stays cheap (and so a missing broker
    # never breaks registration -- the profile still goes to PENDING).