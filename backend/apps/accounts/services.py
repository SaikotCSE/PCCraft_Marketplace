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
import secrets
from datetime import timedelta
from typing import Any, Mapping

from django.contrib.auth import authenticate
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import (
    CustomerProfile,
    CustomUser,
    EmailVerificationCode,
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

        Re-registration semantics: if a row with this email already
        exists but is **unverified**, treat the new POST as an upsert --
        reset the password, refresh the profile fields, keep the same
        primary key, deactivate the row again, and issue a fresh OTP.
        This lets a customer resubmit the form as many times as they
        want before they verify. Once the row is verified the email is
        permanently taken and a duplicate POST returns ``email_taken``.
        """
        password = data.get("password")
        if not password:
            raise AuthServiceError("Password is required.", code="missing_password")

        email = CustomUser.objects.normalize_email(data["email"]).lower()
        existing = (
            CustomUser.all_objects.filter(email__iexact=email).first()
        )
        if existing is not None:
            if existing.is_verified:
                raise AuthServiceError(
                    "An account with this email already exists.",
                    code="email_taken",
                    fields={"email": "Email already registered."},
                )
            # ── upsert path: re-activate the half-provisioned row ──
            existing.set_password(password)
            existing.full_name = data.get("full_name", existing.full_name)
            existing.phone = data.get("phone", existing.phone)
            existing.role = UserRole.CUSTOMER
            existing.date_of_birth = data.get("date_of_birth", existing.date_of_birth)
            existing.gender = data.get("gender", existing.gender)
            avatar = data.get("avatar")
            if avatar:
                existing.avatar = avatar
            # Reset verification state so the new OTP is the only one
            # in play. ``is_active`` stays False until the OTP is consumed
            # -- this is what blocks login attempts during registration.
            existing.is_verified = False
            existing.is_active = False
            existing.failed_login_attempts = 0
            existing.is_locked = False
            existing.last_failed_login = None
            existing.save()
            profile, _ = CustomerProfile.objects.get_or_create(user=existing)
            AuthService.issue_verification_code(
                user=existing,
                purpose=EmailVerificationCode.Purpose.SIGNUP,
            )
            logger.info(
                "accounts.register_customer re-issue ok user_id=%s", existing.pk
            )
            return existing, profile

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
        # Issue a fresh 6-digit OTP and email it to the user. Failure
        # to dispatch the email must not break registration — the user
        # can always resend via /auth/resend-otp/.
        AuthService.issue_verification_code(
            user=user,
            purpose=EmailVerificationCode.Purpose.SIGNUP,
        )
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

    # ───────────────────────── email OTP (verification) ─────────────────────────
    # These three methods back ``VerifyEmailView`` and ``ResendOTPView``:
    #
    # * ``issue_verification_code``   — create + send a new OTP (used by
    #     ``register_customer`` and ``resend_verification_code``).
    # * ``verify_email``              — atomically consume a code, flip
    #     ``user.is_verified=True``, mint a JWT pair.
    # * ``resend_verification_code``  — invalidate any pending codes and
    #     issue a fresh one. Silently no-ops when the email is unknown or
    #     already verified (so callers can't enumerate accounts).
    #
    # OTP tunables live as constants here; moving them to ``settings`` is
    # out of scope until we prove we need per-environment overrides.
    OTP_CODE_LENGTH = 6
    OTP_EXPIRY_MINUTES = 15
    OTP_RESEND_COOLDOWN_SECONDS = 60
    OTP_MAX_ATTEMPTS = 5

    @staticmethod
    def _generate_otp_code(length: int = 6) -> str:
        """Return a zero-padded random numeric OTP of ``length`` digits."""
        # ``secrets.randbelow`` is the canonical secure-source; we keep
        # the digit count in a known range so leading zeros are preserved.
        upper = 10 ** length
        return f"{secrets.randbelow(upper):0{length}d}"

    @staticmethod
    def issue_verification_code(
        *,
        user: CustomUser,
        purpose: str = EmailVerificationCode.Purpose.SIGNUP,
    ) -> tuple[EmailVerificationCode, str]:
        """Create a fresh OTP row for ``user`` and email the plaintext.

        Any *unused, unexpired* row for this user + purpose is invalidated
        first (we mark them ``is_active=False``) so only the latest code
        is in play. The plaintext code is hashed before persistence.

        Returns the new :class:`EmailVerificationCode` row and the
        plaintext code (the latter is what we ship off via the Celery
        task — the worker must NOT re-fetch from DB).
        """
        now = timezone.now()
        EmailVerificationCode.objects.filter(
            user=user,
            purpose=purpose,
            is_active=True,
            used_at__isnull=True,
            expires_at__gt=now,
        ).update(is_active=False)
        code = AuthService._generate_otp_code(AuthService.OTP_CODE_LENGTH)
        # ``created_at`` is the salt prefix in ``EmailVerificationCode.compute_hash``.
        # We must (a) create the row with ``created_at`` set, (b) save, then
        # (c) compute the hash using the *persisted* ``created_at`` -- the
        # in-memory value can drift by a microsecond on ``auto_now_add`` and
        # the round-trip then fails to match. We then save ``code_hash`` in
        # a second pass to keep the salt and the hash in lock-step.
        row = EmailVerificationCode(
            user=user,
            purpose=purpose,
            expires_at=now + timedelta(minutes=AuthService.OTP_EXPIRY_MINUTES),
            created_at=now,
        )
        row.save()
        # ``created_at`` is now exactly what the DB persisted. Compute
        # the hash against that, then write it back.
        row.code_hash = row.compute_hash(code)
        row.save(update_fields=["code_hash", "updated_at"])
        # Best-effort dispatch: broker problems must not break the caller.
        try:
            from apps.accounts.tasks import send_verification_email

            send_verification_email.delay(
                str(user.pk), code, purpose, str(row.pk)
            )
        except Exception:  # pragma: no cover
            logger.exception(
                "accounts.issue_verification_code -- celery dispatch failed user_id=%s",
                user.pk,
            )
        logger.info(
            "accounts.issue_verification_code ok user_id=%s purpose=%s code_id=%s",
            user.pk, purpose, row.pk,
        )
        return row, code

    @staticmethod
    @transaction.atomic
    def verify_email(
        *,
        email: str,
        code: str,
        ip_address: str | None = None,
        purpose: str = EmailVerificationCode.Purpose.SIGNUP,
    ) -> tuple[CustomUser, dict[str, str]]:
        """Consume the latest matching OTP and return ``(user, tokens)``.

        Atomically validates the code, marks the row used, flips
        ``user.is_verified=True``, and mints access+refresh JWTs so the
        caller can return them straight to the frontend (mirrors the
        login response envelope — frontend doesn't need a follow-up
        ``POST /auth/login/`` round-trip).

        Raises ``AuthServiceError`` with distinct ``code`` values for
        every failure mode; views surface them without modification.
        """
        email_norm = (email or "").strip().lower()
        if not email_norm:
            raise AuthServiceError("Email is required.", code="invalid_email")
        code_norm = (code or "").strip()
        if not code_norm:
            raise AuthServiceError("Code is required.", code="invalid_code")

        try:
            user = CustomUser.all_objects.get(email__iexact=email_norm)
        except CustomUser.DoesNotExist as exc:
            raise AuthServiceError(
                "Invalid code or email.",
                code="not_found",
            ) from exc

        if user.is_verified:
            raise AuthServiceError(
                "This email is already verified.",
                code="already_verified",
            )

        # Lock the latest active row for this user+purpose so concurrent
        # verifies can't double-consume the same code.
        row = (
            EmailVerificationCode.objects
            .select_for_update()
            .filter(
                user=user,
                purpose=purpose,
                is_active=True,
                used_at__isnull=True,
            )
            .order_by("-created_at")
            .first()
        )
        if row is None:
            raise AuthServiceError(
                "No active verification code. Please request a new one.",
                code="no_active_code",
            )
        if row.is_expired:
            row.is_active = False
            row.save(update_fields=["is_active", "updated_at"])
            raise AuthServiceError(
                "The verification code has expired. Please request a new one.",
                code="code_expired",
            )
        if row.attempts >= AuthService.OTP_MAX_ATTEMPTS:
            row.is_active = False
            row.save(update_fields=["is_active", "updated_at"])
            raise AuthServiceError(
                "Too many failed attempts. Please request a new code.",
                code="too_many_attempts",
            )
        if not row.matches(code_norm):
            row.attempts += 1
            row.last_attempt_ip = ip_address or row.last_attempt_ip
            update_fields = ["attempts", "updated_at"]
            if ip_address:
                update_fields.append("last_attempt_ip")
            row.save(update_fields=update_fields)
            raise AuthServiceError(
                "The code you entered is incorrect.",
                code="invalid_code",
            )

        # Success: flip flags on both the row and the user.
        row.used_at = timezone.now()
        row.is_active = False
        row.attempts += 1
        row.save(update_fields=["used_at", "is_active", "attempts", "updated_at"])

        update_user = []
        if not user.is_verified:
            user.is_verified = True
            update_user.append("is_verified")
        if not user.is_active:
            user.is_active = True
            update_user.append("is_active")
        if update_user:
            update_user.append("updated_at")
            user.save(update_fields=update_user)

        tokens = AuthService.issue_tokens(user)
        logger.info(
            "accounts.verify_email ok user_id=%s purpose=%s code_id=%s",
            user.pk, purpose, row.pk,
        )
        return user, tokens

    @staticmethod
    def resend_verification_code(
        *,
        email: str,
        purpose: str = EmailVerificationCode.Purpose.SIGNUP,
    ) -> None:
        """Issue a fresh OTP, respecting a per-user cooldown.

        Error codes (raised as :class:`AuthServiceError`)::

        * ``"not_found"``        — no user with that email.
        * ``"already_verified"`` — user is already verified, no work.
        * ``"resend_too_soon"``  — a code was issued less than
          ``OTP_RESEND_COOLDOWN_SECONDS`` ago. The view collapses the
          first two to a generic 200 (enumeration prevention); only
          ``resend_too_soon`` propagates with HTTP 429 so the user can
          see the cooldown text in the toast.

        Silently catches broker errors so the resend endpoint remains a
        success envelope even when the SMTP backend is down.
        """
        email_norm = (email or "").strip().lower()
        if not email_norm:
            raise AuthServiceError(
                "Email is required.",
                code="invalid_email",
                fields={"email": "This field is required."},
            )
        try:
            user = CustomUser.all_objects.get(email__iexact=email_norm)
        except CustomUser.DoesNotExist as exc:
            raise AuthServiceError(
                "No account matches that email.",
                code="not_found",
            ) from exc
        if user.is_verified:
            raise AuthServiceError(
                "This email is already verified.",
                code="already_verified",
            )
        # Cooldown is enforced against the most recent issued row,
        # regardless of whether it has expired (sending a second code
        # during cooldown wastes an email and makes brute-forcing trivial).
        latest = (
            EmailVerificationCode.objects.filter(user=user, purpose=purpose)
            .order_by("-created_at")
            .first()
        )
        if latest is not None:
            elapsed = (timezone.now() - latest.created_at).total_seconds()
            if elapsed < AuthService.OTP_RESEND_COOLDOWN_SECONDS:
                raise AuthServiceError(
                    "Please wait a moment before requesting a new code.",
                    code="resend_too_soon",
                    fields={"email": (
                        f"Try again in {int(AuthService.OTP_RESEND_COOLDOWN_SECONDS - elapsed)}s."
                    )},
                )
        # Failure to dispatch is logged-only; we *don't* surface it as
        # a user-visible error because the very next call to resend will
        # still be inside the cooldown window anyway.
        try:
            AuthService.issue_verification_code(user=user, purpose=purpose)
        except Exception:  # pragma: no cover
            logger.exception(
                "accounts.resend_verification_code -- issue failed user_id=%s",
                user.pk,
            )

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
        # Admin / superuser accounts never go through the OTP sign-up
        # flow (``manage.py createsuperuser`` and the Django admin do
        # not issue a code), so exempt them from the is_verified gate.
        # For customers and vendors, ``is_verified`` flips to ``True``
        # only when the signup OTP is consumed.
        is_admin_user = (
            getattr(user, "is_superuser", False)
            or user.role == UserRole.ADMIN
        )
        if not is_admin_user and not user.is_verified:
            # Module 1 hardening: a customer/vendor who has not yet
            # consumed their signup OTP is **never** allowed to sign in,
            # even with the correct password. They must verify first;
            # re-registering with the same email (until verified) issues
            # a fresh OTP, so there's no dead-end.
            raise AuthServiceError(
                "Please verify your email before signing in. "
                "Check your inbox for the 6-digit code, or re-register "
                "to receive a new one.",
                code="email_not_verified",
            )
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
        """Fetch a user by primary key (including soft-deleted).

        Args:
            user_id: Primary key of the user.

        Returns:
            CustomUser instance (uses ``all_objects`` so soft-deleted
            users are still findable for admin views).

        Raises:
            UserAdminServiceError: With ``code="not_found"`` and HTTP
                status 404 if no user matches ``user_id``.
        """
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
        """Reject self-targeted admin actions.

        Args:
            actor: The authenticated admin performing the action
                (may be ``None`` in tests).
            target: The user instance being acted upon.

        Raises:
            UserAdminServiceError: With ``code="self_action_forbidden"``
                and HTTP 403 if the actor targets their own account.
        """
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
        """Suspend a user account by setting ``is_active=False``.

        Records an audit entry of action ``user.suspend`` with the actor,
        target user, and reason. Refuses if the actor lacks privilege
        (acting on another admin or on themselves).

        Args:
            actor: The :class:`CustomUser` performing the action (must
                be an admin; superuser required to act on another admin).
            user_id: Primary key of the target user.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The suspended :class:`CustomUser` instance (refreshed).

        Raises:
            UserAdminServiceError: If the user is not found, the actor
                is the target (self-action), or the actor lacks
                privilege to manage another admin.
        """
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
        """Activate a previously suspended user account.

        Sets ``is_active=True`` and records an audit entry of action
        ``user.activate``. Refuses self-action.

        Args:
            actor: The :class:`CustomUser` performing the action.
            user_id: Primary key of the target user.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The activated :class:`CustomUser` instance (refreshed).

        Raises:
            UserAdminServiceError: If the user is not found, or the
                actor is the target (self-action).
        """
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
        """Clear a user's account lock state.

        Sets ``is_locked=False`` and resets ``failed_login_attempts``
        to 0, then records an audit entry of action ``user.unlock``.
        Refuses self-action.

        Args:
            actor: The :class:`CustomUser` performing the action.
            user_id: Primary key of the target user.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The unlocked :class:`CustomUser` instance.

        Raises:
            UserAdminServiceError: If the user is not found, or the
                actor is the target (self-action).
        """
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
        """Change a user's role and audit the transition.

        No-ops if the user already has the requested role. Records
        audit metadata ``{"from": previous, "to": new_role}``. Refuses
        self-action and insufficient privilege.

        Args:
            actor: The :class:`CustomUser` performing the action (must
                be an admin; superuser required to act on another admin).
            user_id: Primary key of the target user.
            new_role: New role value; must be one of
                ``{choice.value for choice in UserRole}``.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The :class:`CustomUser` instance with the updated role.

        Raises:
            UserAdminServiceError: If the user is not found, the
                ``new_role`` value is invalid, the actor is the target
                (self-action), or the actor lacks privilege to manage
                another admin.
        """
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
        """Soft-delete a user account.

        Calls the model's ``soft_delete`` (marks the row as deleted
        without removing it) and records an audit entry of action
        ``user.soft_delete``. Refuses self-action and insufficient
        privilege.

        Args:
            actor: The :class:`CustomUser` performing the action (must
                be an admin; superuser required to act on another admin).
            user_id: Primary key of the target user.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The soft-deleted :class:`CustomUser` instance.

        Raises:
            UserAdminServiceError: If the user is not found, the actor
                is the target (self-action), or the actor lacks
                privilege to manage another admin.
        """
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_can_manage(actor, user)
        if user.is_active:
            user.soft_delete()
        UserAdminService._audit(actor, "user.soft_delete", user, reason)
        return user

    @staticmethod
    @transaction.atomic
    def hard_delete(*, actor, user_id, reason: str | None = None) -> dict:
        """Permanently remove a user account from the database.

        Distinct from :meth:`soft_delete` -- the row is removed via
        ``Model.delete()`` and *cannot* be recovered. Related
        ``CustomerProfile`` / ``VendorProfile`` rows (CASCADE) and
        ``LoginAttempt`` / ``EmailVerificationCode`` rows also go
        away; ``SearchLog`` and ``approved_by`` references are
        ``SET_NULL`` and survive as ``NULL`` pointers. After this
        call the email becomes available for fresh registrations.

        We snapshot the email + id before ``delete()`` so the audit
        log still has something meaningful to record (the row no
        longer exists after the call).

        Args:
            actor: The :class:`CustomUser` performing the action
                (must be an admin; superuser required to act on
                another admin).
            user_id: Primary key of the target user.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            ``{"id": "...", "email": "..."}`` -- the snapshot of
            what was deleted, for the response body.

        Raises:
            UserAdminServiceError: If the user is not found, the
                actor is the target (self-action), or the actor lacks
                privilege to manage another admin.
        """
        user = UserAdminService.get_user(user_id)
        UserAdminService._ensure_can_manage(actor, user)
        snapshot = {
            "id": str(user.pk),
            "email": user.email,
            "role": user.role,
        }
        user.delete()
        UserAdminService._audit(
            actor, "user.hard_delete", target=None,
            reason=reason, metadata=snapshot,
        )
        return snapshot

    @staticmethod
    def _audit(actor, action: str, target, reason: str | None = None, metadata=None):
        """Best-effort audit log write.

        Failures are logged but never re-raised: a broken audit trail
        must not block a real user-state change. The ``import`` is
        inside the function so a missing ``apps.common.audit`` module
        during early bootstraps does not crash the service.

        Args:
            actor: User performing the action (may be ``None`` for
                system-initiated flows).
            action: Stable action code, e.g. ``"user.suspend"``.
            target: Object the action targets (usually a ``CustomUser``).
            reason: Optional human-readable reason.
            metadata: Optional dict of extra structured context.
        """
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
        """Return a queryset of :class:`VendorProfile`, optionally filtered by status.

        Uses ``all_objects`` so admins see soft-deleted vendor
        applications too.

        Args:
            status: Optional :class:`VendorStatus` value to filter by.

        Returns:
            A queryset of :class:`VendorProfile` rows ordered by
            ``-created_at``.
        """
        qs = VendorProfile.all_objects.select_related("user").all()
        if status:
            qs = qs.filter(status=status)
        return qs.order_by("-created_at")

    @staticmethod
    def list_pending():
        """Return a queryset of vendors whose status is ``PENDING``.

        Returns:
            A queryset of :class:`VendorProfile` rows with status
            ``PENDING`` ordered by ``-created_at``.
        """
        return VendorAdminService.list_vendors(status=VendorStatus.PENDING)

    @staticmethod
    def get_vendor(vendor_id) -> VendorProfile:
        """Fetch a single :class:`VendorProfile` by primary key.

        Args:
            vendor_id: Primary key of the target vendor.

        Returns:
            The :class:`VendorProfile` row with the related user
            joined.

        Raises:
            VendorAdminServiceError: If no vendor with ``vendor_id``
                exists (``code='not_found'``, ``http_status=404``).
        """
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
        """Approve a vendor application and activate the underlying user.

        Flips ``status`` to ``APPROVED``, sets ``approved_at`` to now,
        sets ``approved_by`` to ``actor``, clears ``rejection_reason``,
        and activates the linked :class:`CustomUser` so they can sign
        in. Also flips ``user.is_verified=True`` because vendors never
        go through the customer OTP sign-up flow -- admin approval IS
        the verification step for them, otherwise the email-verified
        gate would 403 them at login. Records an audit entry of action
        ``vendor.approve``. No-ops when the vendor is already ``APPROVED``.

        Args:
            actor: The :class:`CustomUser` performing the action.
            vendor_id: Primary key of the target vendor.
            reason: Optional free-text justification recorded in the
                audit log.

        Returns:
            The approved :class:`VendorProfile` instance (refreshed).

        Raises:
            VendorAdminServiceError: If the vendor is not found, or if
                the vendor's current status is ``REJECTED`` (a
                rejected vendor must re-submit).
        """
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
        # Vendors never go through the customer OTP sign-up flow, so
        # the admin's approval is what flips their ``is_verified``
        # bit -- otherwise the email_verified gate (Module 1 hardening)
        # would 403 them at login even though they were approved.
        user = vendor.user
        update_fields = []
        if not user.is_active:
            user.is_active = True
            update_fields.append("is_active")
        if not user.is_verified:
            user.is_verified = True
            update_fields.append("is_verified")
        if update_fields:
            update_fields.append("updated_at")
            user.save(update_fields=update_fields)
        UserAdminService._audit(
            actor, "vendor.approve", vendor, reason,
        )
        return vendor

    @staticmethod
    @transaction.atomic
    def reject(*, actor, vendor_id, reason: str | None = None) -> VendorProfile:
        """Reject a vendor application with a written reason.

        Flips ``status`` to ``REJECTED``, stores the trimmed reason in
        ``rejection_reason``, and clears ``approved_at``/``approved_by``.
        Records an audit entry of action ``vendor.reject``. No-ops when
        the vendor is already ``REJECTED``.

        Args:
            actor: The :class:`CustomUser` performing the action.
            vendor_id: Primary key of the target vendor.
            reason: Required free-text rejection reason. Must be a
                non-blank string.

        Returns:
            The rejected :class:`VendorProfile` instance (refreshed).

        Raises:
            VendorAdminServiceError: If the vendor is not found, or if
                ``reason`` is missing/blank
                (``code='reason_required'``, ``http_status=400``).
        """
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
        """Request more information from a pending vendor.

        Flips ``status`` to ``INFO_REQUESTED`` and stores the message
        in ``rejection_reason``. Records an audit entry of action
        ``vendor.request_info``.

        Args:
            actor: The :class:`CustomUser` performing the action.
            vendor_id: Primary key of the target vendor.
            message: Required free-text message to send to the vendor.
                Must be a non-blank string.

        Returns:
            The :class:`VendorProfile` instance with status
            ``INFO_REQUESTED``.

        Raises:
            VendorAdminServiceError: If the vendor is not found, the
                ``message`` is missing/blank
                (``code='message_required'``), or the vendor is already
                ``APPROVED`` (``code='invalid_status'``).
        """
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