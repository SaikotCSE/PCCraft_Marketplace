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


# ====================================================================
# Admin user & vendor moderation — Module 9
# ====================================================================
class UserAdminServiceError(Exception):
    """Typed error for admin user moderation.

    Views read ``exc.http_status`` to map a failure to a DRF response.
    """

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


class VendorAdminServiceError(Exception):
    """Typed error for admin vendor moderation."""

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


class UserAdminService:
    """Business-logic for admin user moderation.

    Per spec §Module 9 (lines 3119-3162):

    * Admins can list users across roles.
    * Suspend / activate / unlock / soft-delete / change-role all
      require a ``reason`` (or ``role`` for change-role) and record an
      audit entry.
    * Admins cannot operate on themselves — self-action is refused
      with ``code='self_action_forbidden'``.
    """

    @staticmethod
    def list_users(*, search: str | None = None, role: str | None = None, status: str | None = None):
        """Return a queryset of :class:`CustomUser`. Uses ``all_objects``
        so admins see suspended / soft-deleted accounts too."""
        qs = CustomUser.all_objects.all()
        if role:
            qs = qs.filter(role=role)
        if status == "active":
            qs = qs.filter(is_active=True)
        elif status == "suspended":
            qs = qs.filter(is_active=False)
        if search:
            term = search.strip()
            if term:
                qs = qs.filter(email__icontains=term)
        return qs.order_by("-created_at")

    @staticmethod
    def get_user(user_id) -> CustomUser:
        try:
            return CustomUser.all_objects.get(pk=user_id)
        except CustomUser.DoesNotExist as exc:
            raise UserAdminServiceError(
                "not_found",
                "User not found.",
                fields={"user_id": "No user with that id."},
                http_status=404,
            ) from exc

    @staticmethod
    def _ensure_not_self(actor, target):
        if actor is not None and target.pk == actor.pk:
            raise UserAdminServiceError(
                "self_action_forbidden",
                "You cannot perform this action on your own account.",
                http_status=403,
            )

    @staticmethod
    def _ensure_can_manage(actor, target):
        """Refuse to demote or suspend a fellow admin unless the actor
        is a superuser. Suspending another admin via this path is the
        classic privilege-escalation mistake."""
        UserAdminService._ensure_not_self(actor, target)
        if target.role == UserRole.ADMIN and not getattr(actor, "is_superuser", False):
            raise UserAdminServiceError(
                "insufficient_privilege",
                "Only a superuser can manage another admin account.",
                http_status=403,
            )

    @staticmethod
    @transaction.atomic
    def suspend(*, actor, user_id, reason: str | None = None) -> CustomUser:
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_can_manage(actor, user)
        if user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active", "updated_at"])
        UserAdminService._audit(actor, "user.suspend", user, reason)
        return user

    @staticmethod
    @transaction.atomic
    def activate(*, actor, user_id, reason: str | None = None) -> CustomUser:
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_not_self(actor, user)
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active", "updated_at"])
        UserAdminService._audit(actor, "user.activate", user, reason)
        return user

    @staticmethod
    @transaction.atomic
    def unlock(*, actor, user_id, reason: str | None = None) -> CustomUser:
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_not_self(actor, user)
        user.is_locked = False
        user.failed_login_attempts = 0
        user.save(update_fields=[
            "is_locked", "failed_login_attempts", "updated_at",
        ])
        UserAdminService._audit(actor, "user.unlock", user, reason)
        return user

    @staticmethod
    @transaction.atomic
    def change_role(*, actor, user_id, new_role: str, reason: str | None = None) -> CustomUser:
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_can_manage(actor, user)
        valid = {choice.value for choice in UserRole}
        if new_role not in valid:
            raise UserAdminServiceError(
                "invalid_role",
                "Unknown role: %s" % new_role,
                fields={"role": "Invalid choice."},
                http_status=400,
            )
        previous = user.role
        if previous == new_role:
            return user
        user.role = new_role
        user.save(update_fields=["role", "updated_at"])
        UserAdminService._audit(
            actor, "user.change_role", user, reason,
            metadata={"from": previous, "to": new_role},
        )
        return user

    @staticmethod
    @transaction.atomic
    def soft_delete(*, actor, user_id, reason: str | None = None) -> CustomUser:
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_can_manage(actor, user)
        if user.is_active:
            user.soft_delete()
        UserAdminService._audit(actor, "user.soft_delete", user, reason)
        return user

    @staticmethod
    def _audit(actor, action: str, target, reason: str | None = None, metadata=None):
        try:
            from apps.common.audit import log_action  # type: ignore
        except Exception:  # pragma: no cover
            logger.warning("apps.common.audit not available; skipping audit for %s", action)
            return
        try:
            log_action(
                actor=actor,
                action=action,
                target=target,
                reason=reason,
                metadata=metadata,
            )
        except Exception:  # pragma: no cover
            logger.exception("audit log failed for %s", action)


class VendorAdminService:
    """Business-logic for admin vendor moderation.

    Per spec §Module 9 (lines 3119-3162): the workflow is::

        PENDING -> APPROVED   (admin approves)
        PENDING -> REJECTED   (admin rejects with a written reason)
        PENDING -> INFO_REQUESTED  (admin asks for more info)

    Approving flips ``approved_at`` + ``approved_by`` and activates the
    vendor account so they can sign in.
    """

    @staticmethod
    def list_vendors(*, status: str | None = None):
        qs = VendorProfile.all_objects.select_related("user").all()
        if status:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at")

    @staticmethod
    def list_pending():
        return VendorAdminService.list_vendors(status=VendorStatus.PENDING)

    @staticmethod
    def get_vendor(vendor_id) -> VendorProfile:
        try:
            return VendorProfile.all_objects.select_related("user").get(pk=vendor_id)
        except VendorProfile.DoesNotExist as exc:
            raise VendorAdminServiceError(
                "not_found",
                "Vendor application not found.",
                fields={"vendor_id": "No vendor with that id."},
                http_status=404,
            ) from exc

    @staticmethod
    @transaction.atomic
    def approve(*, actor, vendor_id, reason: str | None = None) -> VendorProfile:
        vendor = VendorAdminService.get_vendor(vendor_id)
        if vendor.status == VendorStatus.APPROVED:
            return vendor
        if vendor.status == VendorStatus.REJECTED:
            raise VendorAdminServiceError(
                "invalid_status",
                "A rejected vendor must re-submit before being approved again.",
                http_status=400,
            )
        from django.utils import timezone
        vendor.status = VendorStatus.APPROVED
        vendor.approved_at = timezone.now()
        vendor.approved_by = actor
        vendor.rejection_reason = ""
        vendor.save(update_fields=[
            "status", "approved_at", "approved_by",
            "rejection_reason", "updated_at",
        ])
        # Activate the underlying user so the vendor can sign in.
        user = vendor.user
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active", "updated_at"])
        UserAdminService._audit(
            actor, "vendor.approve", vendor, reason,
        )
        return vendor

    @staticmethod
    @transaction.atomic
    def reject(*, actor, vendor_id, reason: str | None = None) -> VendorProfile:
        vendor = VendorAdminService.get_vendor(vendor_id)
        if not reason or not reason.strip():
            raise VendorAdminServiceError(
                "reason_required",
                "A rejection reason is required.",
                fields={"reason": "This field is required."},
                http_status=400,
            )
        if vendor.status == VendorStatus.REJECTED:
            return vendor
        vendor.status = VendorStatus.REJECTED
        vendor.rejection_reason = reason.strip()
        vendor.approved_at = None
        vendor.approved_by = None
        vendor.save(update_fields=[
            "status", "rejection_reason",
            "approved_at", "approved_by", "updated_at",
        ])
        UserAdminService._audit(
            actor, "vendor.reject", vendor, reason,
        )
        return vendor

    @staticmethod
    @transaction.atomic
    def request_info(*, actor, vendor_id, message: str | None = None) -> VendorProfile:
        vendor = VendorAdminService.get_vendor(vendor_id)
        if not message or not message.strip():
            raise VendorAdminServiceError(
                "message_required",
                "An info-request message is required.",
                fields={"message": "This field is required."},
                http_status=400,
            )
        if vendor.status == VendorStatus.APPROVED:
            raise VendorAdminServiceError(
                "invalid_status",
                "Cannot request info from an already-approved vendor.",
                http_status=400,
            )
        vendor.status = VendorStatus.INFO_REQUESTED
        vendor.rejection_reason = message.strip()
        vendor.save(update_fields=[
            "status", "rejection_reason", "updated_at",
        ])
        UserAdminService._audit(
            actor, "vendor.request_info", vendor, message,
        )
        return vendor