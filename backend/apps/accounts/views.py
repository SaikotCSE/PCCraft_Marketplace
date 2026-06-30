"""Auth views for Module 1.

Per spec: *"all views call services only -- no logic in views"*.
Every view delegates business work to ``apps.accounts.services.AuthService``
and returns the project-wide ``APIResponse`` envelope.

Endpoints
---------
* ``POST   /api/v1/auth/register/customer/``   ``CustomerRegisterView``
* ``POST   /api/v1/auth/register/vendor/``     ``VendorRegisterView``
* ``POST   /api/v1/auth/login/``               ``LoginView``
* ``POST   /api/v1/auth/logout/``              ``LogoutView``
* ``POST   /api/v1/auth/token/refresh/``       ``TokenRefreshView``  (SimpleJWT built-in)
* ``POST   /api/v1/auth/verify-email/``        ``VerifyEmailView``
* ``POST   /api/v1/auth/resend-otp/``          ``ResendOTPView``
* ``GET    /api/v1/auth/profile/``             ``ProfileView``
* ``PATCH  /api/v1/auth/profile/``             ``ProfileView``
* ``PATCH  /api/v1/auth/vendor/documents/``    ``VendorDocumentUploadView``
"""
from __future__ import annotations

import logging
from typing import Any

from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _

from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from apps.accounts.models import CustomUser, UserRole, VendorStatus
from apps.accounts.serializers import (
    AdminUserRoleChangeSerializer,
    AdminUserSerializer,
    AdminVendorApplicationSerializer,
    AdminVendorRejectSerializer,
    ChangePasswordSerializer,
    CustomerRegisterSerializer,
    LoginSerializer,
    RequestOTPResendSerializer,
    TokenResponseSerializer,
    UserProfileSerializer,
    VendorDocumentUploadSerializer,
    VendorProfileSerializer,
    VendorRegisterSerializer,
    VerifyOTPSerializer,
)
from apps.accounts.services import (
    AuthService,
    AuthServiceError,
    UserAdminService,
    UserAdminServiceError,
    VendorAdminService,
    VendorAdminServiceError,
)
from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin, IsVendor
from apps.common.response import api_response
from apps.common.security import (
    AccountLockoutPolicy,
    LoginRateThrottle,
    OTPSendRateThrottle,
    OTPVerifyRateThrottle,
    RegisterRateThrottle,
    SecurityService,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _bad_request(code: str, message: str, fields: dict | None = None, status_code: int = 400) -> Response:
    """Build a typed error envelope."""
    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return api_response(status=status_code, error=error)


def _service_error_to_response(exc: AuthServiceError) -> Response:
    """Translate an ``AuthServiceError`` into our envelope."""
    status_code = (
        status.HTTP_401_UNAUTHORIZED
        if exc.code in {"unauthenticated", "invalid_token", "missing_token", "account_disabled"}
        else status.HTTP_403_FORBIDDEN
        if exc.code in {"role_mismatch", "email_not_verified"}
        else status.HTTP_400_BAD_REQUEST
    )
    return _bad_request(exc.code, exc.message, fields=exc.fields or None, status_code=status_code)


def _admin_error_to_response(exc: UserAdminServiceError) -> Response:
    """Translate a ``UserAdminServiceError`` into our envelope."""
    if exc.code in {"self_action_forbidden", "insufficient_privilege"}:
        status_code = status.HTTP_403_FORBIDDEN
    elif exc.code == "not_found":
        status_code = status.HTTP_404_NOT_FOUND
    else:
        status_code = status.HTTP_400_BAD_REQUEST
    return _bad_request(exc.code, exc.message, fields=exc.fields or None, status_code=status_code)


# ====================================================================
# Customer + Vendor registration
# ====================================================================
class CustomerRegisterView(APIView):
    """``POST /api/v1/auth/register/customer/`` -- public."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, FormParser, MultiPartParser]
    serializer_class = CustomerRegisterSerializer
    throttle_classes = [RegisterRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        try:
            user, _profile = AuthService.register_customer(serializer.validated_data)
        except AuthServiceError as exc:
            return _service_error_to_response(exc)
        body = UserProfileSerializer(user).data
        logger.info(
            "views.customer_register ok user_id=%s requires_verification=%s",
            user.pk,
            not user.is_verified,
        )
        # Email-verification gate (Module 1 hardening). The user is created
        # with ``is_active=False`` and ``is_verified=False``; the OTP issued
        # during register must be consumed before login is allowed.
        # ``requires_verification`` lets the frontend decide whether to
        # route to the standard "please sign in" page or flip into the
        # in-line verify-OTP step.
        return api_response(
            data={
                "user": body,
                "requires_verification": not user.is_verified,
                "email": user.email,
                "message": (
                    "Account created. Check your email for a 6-digit "
                    "verification code."
                    if not user.is_verified
                    else "Account created. Please sign in."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class VendorRegisterView(APIView):
    """``POST /api/v1/auth/register/vendor/`` -- public, multipart."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    serializer_class = VendorRegisterSerializer
    throttle_classes = [RegisterRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        files = {k: request.FILES[k] for k in ("trade_license_doc", "nid_doc") if k in request.FILES}
        try:
            user, profile = AuthService.register_vendor(serializer.validated_data, files)
        except AuthServiceError as exc:
            return _service_error_to_response(exc)
        body = {
            "user": UserProfileSerializer(user).data,
            "vendor": VendorProfileSerializer(profile).data,
            "message": (
                "Application submitted. Your account is pending review; "
                "you'll receive an email once approved."
            ),
        }
        logger.info(
            "views.vendor_register ok user_id=%s profile_id=%s", user.pk, profile.pk
        )
        return api_response(data=body, status=status.HTTP_201_CREATED)


# ====================================================================
# Email verification (OTP) — Module 1 hardening
# ====================================================================
class VerifyEmailView(APIView):
    """``POST /api/v1/auth/verify-email/`` -- public.

    Body: ``{"email": "...", "code": "123456"}``.

    Success returns ``{access, refresh, user}`` mirroring the login
    envelope so the frontend can simply reuse its ``useAuthStore.setAuth``
    flow after a successful verify -- no second round-trip required.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, FormParser]
    serializer_class = VerifyOTPSerializer
    throttle_classes = [OTPVerifyRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        # Best-effort client IP for the audit field on the OTP row.
        ip = None
        try:
            ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or \
                request.META.get("REMOTE_ADDR")
        except Exception:  # pragma: no cover -- defensive
            ip = None

        try:
            user, tokens = AuthService.verify_email(
                email=serializer.validated_data["email"],
                code=serializer.validated_data["code"],
                ip_address=ip,
            )
        except AuthServiceError as exc:
            return _service_error_to_response(exc)

        body = {
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "user": UserProfileSerializer(user).data,
        }
        # Re-use the login serializer just to validate the shape; we
        # discard the instance because the response body is built above.
        TokenResponseSerializer(body)
        logger.info(
            "views.verify_email ok user_id=%s role=%s", user.pk, user.role
        )
        return api_response(data=body, status=status.HTTP_200_OK)


class ResendOTPView(APIView):
    """``POST /api/v1/auth/resend-otp/`` -- public.

    Body: ``{"email": "..."}``.

    Always returns 200 with a generic success message -- we intentionally
    do NOT disclose whether the email exists / is already verified, so
    the endpoint can be safely hit by anyone. Real success/failure
    conditions are written to the server log for the admin queue.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, FormParser]
    serializer_class = RequestOTPResendSerializer
    throttle_classes = [OTPSendRateThrottle]

    GENERIC_OK_BODY = {
        "message": (
            "If that email matches an unverified account, a new "
            "verification code is on its way."
        ),
    }

    def post(self, request: Request) -> Response:
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        try:
            AuthService.resend_verification_code(
                email=serializer.validated_data["email"],
            )
        except AuthServiceError as exc:
            # Map the security-sensitive "not_found" / "already_verified"
            # to the same generic 200 so callers cannot enumerate.
            # Genuine validation errors still propagate to keep the
            # "resend_too_soon" message visible to the user.
            if exc.code in {"not_found", "already_verified"}:
                logger.info(
                    "views.resend_otp silenced code=%s email=%s",
                    exc.code,
                    serializer.validated_data["email"],
                )
                return api_response(
                    data=self.GENERIC_OK_BODY,
                    status=status.HTTP_200_OK,
                )
            return _service_error_to_response(exc)
        logger.info(
            "views.resend_otp ok email=%s",
            serializer.validated_data["email"],
        )
        return api_response(data=self.GENERIC_OK_BODY, status=status.HTTP_200_OK)


# ====================================================================
# Login / Logout / Refresh
# ====================================================================
class LoginView(APIView):
    """``POST /api/v1/auth/login/`` -- public, role-aware.

    On success returns ``{access, refresh, user}`` so the frontend's
    ``useAuthStore.setAuth`` can be called directly.

    Module 9 adds:
      * ``LoginRateThrottle`` -- 5 attempts/min per (email, ip).
      * ``AccountLockoutPolicy`` -- 5 failures → 15-min lockout.
      * ``LoginAttempt`` row written on every attempt (success or
        failure) -- surfaced on the admin "Login attempts" page.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer
    throttle_classes = [LoginRateThrottle]

    def post(self, request: Request) -> Response:
        email_raw = (request.data.get("email") or "").strip().lower()

        # Lockout check FIRST so we never even attempt to validate the
        # password on a locked account. This is what blocks brute force
        # attempts while still being cheap.
        if email_raw:
            try:
                candidate = User.all_objects.get(email__iexact=email_raw)
            except User.DoesNotExist:
                candidate = None
            if candidate is not None and AccountLockoutPolicy.is_locked(candidate):
                SecurityService.record_login_attempt(
                    email=email_raw,
                    request=request,
                    success=False,
                    failure_reason="account_locked",
                    user=candidate,
                )
                return _bad_request(
                    "account_locked",
                    "This account is temporarily locked due to repeated "
                    "failed login attempts. Please try again in a few minutes.",
                    status_code=status.HTTP_423_LOCKED,
                )

        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            # ``LoginSerializer`` uses ``simplejwt``'s ``self.fail()`` for
            # both bad credentials ("no_active_account") and role-gate
            # failures ("role_mismatch"). Both write under
            # ``non_field_errors`` with a ``code`` attribute -- inspect
            # the code to pick the right HTTP status.
            non_field = serializer.errors.get("non_field_errors") or []
            first_code = None
            if isinstance(non_field, list) and non_field:
                first_code = getattr(non_field[0], "code", None)
            if first_code == "role_mismatch":
                msg = (
                    str(non_field[0]) if non_field else "Role mismatch."
                )
                # Bad role picks also count as a failed attempt against
                # the account if the email resolves.
                user_obj = None
                if email_raw:
                    try:
                        user_obj = User.all_objects.get(email__iexact=email_raw)
                    except User.DoesNotExist:
                        user_obj = None
                SecurityService.record_login_attempt(
                    email=email_raw,
                    request=request,
                    success=False,
                    failure_reason="role_mismatch",
                    user=user_obj,
                )
                return _bad_request(
                    "role_mismatch", msg,
                    fields=serializer.errors,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            if first_code == "email_not_verified":
                # Module 1 hardening -- account exists & password is
                # correct, but the user has not yet consumed the OTP
                # emailed at signup. Frontend must route to the OTP
                # step (and offer "resend code" / "use the same email
                # to resend"). Re-registering with the same email is
                # allowed -- the service layer upserts in place and
                # issues a fresh code.
                user_obj = None
                if email_raw:
                    try:
                        user_obj = User.all_objects.get(email__iexact=email_raw)
                    except User.DoesNotExist:
                        user_obj = None
                SecurityService.record_login_attempt(
                    email=email_raw,
                    request=request,
                    success=False,
                    failure_reason="email_not_verified",
                    user=user_obj,
                )
                return _bad_request(
                    "email_not_verified",
                    str(non_field[0]) if non_field else (
                        "Please verify your email before signing in."
                    ),
                    fields={"email": str(non_field[0])} if non_field else None,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            if first_code == "no_active_account" or non_field:
                msg = non_field[0] if non_field else "Invalid email or password."
                # Resolve the user (if exists) so the lockout counter
                # actually increments -- this is the brute-force hook.
                lockout_user = None
                if email_raw:
                    try:
                        lockout_user = User.all_objects.get(
                            email__iexact=email_raw
                        )
                    except User.DoesNotExist:
                        lockout_user = None
                SecurityService.record_login_attempt(
                    email=email_raw,
                    request=request,
                    success=False,
                    failure_reason="bad_credentials",
                    user=lockout_user,
                )
                return _bad_request(
                    "unauthenticated",
                    str(msg),
                    fields=serializer.errors,
                    status_code=status.HTTP_401_UNAUTHORIZED,
                )
            # Validation error on email/password format itself (not auth).
            SecurityService.record_login_attempt(
                email=email_raw,
                request=request,
                success=False,
                failure_reason="validation_error",
            )
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )

        # ``LoginSerializer`` is a ``TokenObtainPairSerializer`` subclass;
        # ``validate()`` returns the token dict and ``user`` lives on the
        # serializer instance itself.
        user = serializer.user
        tokens = serializer.validated_data
        body = {
            "access": tokens["access"],
            "refresh": tokens["refresh"],
            "user": UserProfileSerializer(user).data,
        }
        TokenResponseSerializer(body)  # validates shape for OpenAPI
        SecurityService.record_login_attempt(
            email=email_raw or user.email,
            request=request,
            success=True,
            user=user,
        )
        logger.info("views.login ok user_id=%s role=%s", user.pk, user.role)
        return api_response(data=body, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """``POST /api/v1/auth/logout/`` -- blacklist the refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        refresh = request.data.get("refresh")
        if not refresh:
            return _bad_request(
                "missing_token",
                "Refresh token is required.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        try:
            AuthService.blacklist_refresh(refresh)
        except AuthServiceError as exc:
            return _service_error_to_response(exc)
        logger.info("views.logout ok user_id=%s", request.user.pk)
        return api_response(
            data={"message": "Signed out."},
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """``POST /api/v1/auth/change-password/`` -- authenticated.

    Body: ``{current_password, new_password, confirm_new_password}``.
    On success the new password is hashed with Django's password hasher
    and the row is saved. With SimpleJWT there are no Django sessions to
    keep alive (JWT is self-contained), but we still call
    ``update_session_auth_hash`` defensively so DRF's request.user and
    any session-backed middleware see the new hash.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])

        # ``update_session_auth_hash`` only does work if the request has
        # a session; JWT auth does not, but calling it is harmless and
        # keeps the contract identical to Django's PasswordChangeView.
        try:
            from django.contrib.auth import update_session_auth_hash

            update_session_auth_hash(request, user)
        except Exception:  # pragma: no cover -- defensive
            pass

        logger.info("views.change_password ok user_id=%s role=%s", user.pk, user.role)
        return api_response(
            data={"message": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


class TokenRefreshView(APIView):
    """``POST /api/v1/auth/token/refresh/`` -- public.

    We don't use SimpleJWT's built-in view so the envelope stays
    consistent with the rest of the API.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        refresh = request.data.get("refresh")
        if not refresh:
            return _bad_request(
                "missing_token",
                "Refresh token is required.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh)
            user_id = token.payload.get("user_id")
            user = User.all_objects.get(pk=user_id) if user_id else None
        except TokenError as exc:
            return _bad_request(
                "invalid_token",
                "Refresh token is invalid or expired.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        except User.DoesNotExist:
            return _bad_request(
                "invalid_token",
                "Refresh token references an unknown user.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        access = str(token.access_token)
        new_refresh = str(token)
        body = {
            "access": access,
            "refresh": new_refresh,
            "user": UserProfileSerializer(user).data,
        }
        logger.info("views.token_refresh ok user_id=%s", user.pk)
        return api_response(data=body, status=status.HTTP_200_OK)


# ====================================================================
# Profile
# ====================================================================
class ProfileView(APIView):
    """``GET / PATCH /api/v1/auth/profile/``.

    Routes to the role-appropriate serializer on PATCH:
    * CUSTOMER → UserProfileSerializer (User fields)
    * VENDOR   → VendorProfileSerializer (store + business fields)
    * ADMIN    → UserProfileSerializer (admin profile edits are minimal)
    """

    permission_classes = [IsAuthenticated]

    def _vendor_profile(self, user: CustomUser):
        from apps.accounts.models import VendorProfile
        profile = getattr(user, "vendor_profile", None)
        if profile is None:
            # Should be impossible thanks to the post_save signal, but
            # the safety net keeps the API contract intact.
            profile = VendorProfile.objects.create(user=user)
        return profile

    def get(self, request: Request) -> Response:
        user = request.user
        if user.role == UserRole.VENDOR:
            data = VendorProfileSerializer(self._vendor_profile(user)).data
        else:
            data = UserProfileSerializer(user).data
        return api_response(data=data, status=status.HTTP_200_OK)

    def patch(self, request: Request) -> Response:
        user = request.user
        if user.role == UserRole.VENDOR:
            profile = self._vendor_profile(user)
            serializer = VendorProfileSerializer(
                profile, data=request.data, partial=True
            )
        else:
            serializer = UserProfileSerializer(user, data=request.data, partial=True)

        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        serializer.save()
        logger.info("views.profile_patch ok user_id=%s role=%s", user.pk, user.role)
        return api_response(data=serializer.data, status=status.HTTP_200_OK)


# ====================================================================
# Vendor document resubmission
# ====================================================================
class VendorDocumentUploadView(APIView):
    """``PATCH /api/v1/auth/vendor/documents/`` -- vendor only."""

    permission_classes = [IsAuthenticated, IsVendor]
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request: Request) -> Response:
        serializer = VendorDocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more documents failed validation.",
                fields=serializer.errors,
            )
        from apps.accounts.models import VendorProfile, VendorStatus

        profile = self._profile_for(request.user)
        updated_fields: list[str] = []
        for field in ("trade_license_doc", "nid_doc"):
            if field in serializer.validated_data:
                setattr(profile, field, serializer.validated_data[field])
                updated_fields.append(field)
        # Reset status back to PENDING on resubmission so staff re-review.
        if profile.status in {VendorStatus.REJECTED, VendorStatus.INFO_REQUESTED}:
            profile.status = VendorStatus.PENDING
            profile.rejection_reason = ""
            updated_fields += ["status", "rejection_reason"]
        profile.save(update_fields=updated_fields or None)
        logger.info(
            "views.vendor_documents_upload ok profile_id=%s fields=%s",
            profile.pk,
            updated_fields,
        )
        return api_response(
            data=VendorProfileSerializer(profile).data,
            status=status.HTTP_200_OK,
        )

    def _profile_for(self, user: CustomUser):
        from apps.accounts.models import VendorProfile

        try:
            return user.vendor_profile
        except VendorProfile.DoesNotExist:
            return VendorProfile.objects.create(user=user)


# ====================================================================
# Module 9 — Admin user management
# ====================================================================
def _get_target_user(user_id: str) -> CustomUser:
    """Resolve a user id from the URL. Raises ``UserAdminServiceError``."""
    try:
        return CustomUser.all_objects.get(pk=user_id)
    except (CustomUser.DoesNotExist, ValueError):
        raise UserAdminServiceError(
            "not_found", "User not found.",
        )


class AdminUserListView(APIView):
    """``GET /api/v1/admin/users/`` -- filtered, paginated user list.

    Query params: ``search``, ``role``, ``status``, ``page``,
    ``page_size``. ``status`` accepts ``active`` / ``inactive`` / ``locked``.
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        users = UserAdminService.list_users(
            search=request.query_params.get("search", ""),
            role=request.query_params.get("role", ""),
            status=request.query_params.get("status", ""),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(users, request, view=self)
        data = AdminUserSerializer(page, many=True).data
        return paginator.get_paginated_response(data)


class _UserAdminActionView(APIView):
    """Shared base -- every admin user action goes through ``IsAdmin``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def _target(self, request: Request, user_id: str) -> CustomUser:
        try:
            return _get_target_user(user_id)
        except UserAdminServiceError as exc:
            # Promote to a typed 404.
            return None  # type: ignore[return-value]


class AdminUserSuspendView(_UserAdminActionView):
    """``PATCH /api/v1/admin/users/{id}/suspend/`` body ``{"reason": "..."}``."""

    def patch(self, request: Request, user_id: str) -> Response:
        try:
            target = _get_target_user(user_id)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        try:
            target = UserAdminService.suspend(actor=request.user, target=target)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        return api_response(
            data=AdminUserSerializer(target).data,
            message="User suspended.",
        )


class AdminUserActivateView(_UserAdminActionView):
    """``PATCH /api/v1/admin/users/{id}/activate/``."""

    def patch(self, request: Request, user_id: str) -> Response:
        try:
            target = _get_target_user(user_id)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        try:
            target = UserAdminService.activate(actor=request.user, target=target)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        return api_response(
            data=AdminUserSerializer(target).data,
            message="User activated.",
        )


class AdminUserChangeRoleView(_UserAdminActionView):
    """``PATCH /api/v1/admin/users/{id}/change-role/`` body ``{"role": "vendor"}``."""

    def patch(self, request: Request, user_id: str) -> Response:
        serializer = AdminUserRoleChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                fields=serializer.errors,
            )
        try:
            target = _get_target_user(user_id)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        try:
            target = UserAdminService.change_role(
                actor=request.user, target=target, new_role=serializer.validated_data["role"],
            )
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        return api_response(
            data=AdminUserSerializer(target).data,
            message="Role updated.",
        )


class AdminUserUnlockView(_UserAdminActionView):
    """``PATCH /api/v1/admin/users/{id}/unlock/`` -- clears lockout state."""

    def patch(self, request: Request, user_id: str) -> Response:
        try:
            target = _get_target_user(user_id)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        try:
            target = UserAdminService.unlock(actor=request.user, target=target)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        return api_response(
            data=AdminUserSerializer(target).data,
            message="Account unlocked.",
        )


class AdminUserDeleteView(_UserAdminActionView):
    """``DELETE /api/v1/admin/users/{id}/`` -- soft-delete only."""

    def delete(self, request: Request, user_id: str) -> Response:
        try:
            target = _get_target_user(user_id)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        try:
            target = UserAdminService.soft_delete(actor=request.user, target=target)
        except UserAdminServiceError as exc:
            return _admin_error_to_response(exc)
        return api_response(
            data=AdminUserSerializer(target).data,
            message="User deactivated.",
        )


# ====================================================================
# Module 9 — admin vendor approval queue
# ====================================================================
def _vendor_error_to_response(exc: VendorAdminServiceError) -> Response:
    """Map a :class:`VendorAdminServiceError` to the standard envelope."""
    return _bad_request(
        code=exc.code,
        message=exc.message,
        fields=exc.fields or None,
        status_code=exc.http_status,
    )


def _get_target_vendor(vendor_id: str):
    return VendorAdminService.get_vendor(vendor_id)


class AdminVendorListView(APIView):
    """``GET /api/v1/admin/vendors/`` -- paginated application list."""

    permission_classes = (IsAuthenticated, IsAdmin)
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        status_filter = request.query_params.get("status", "")
        if status_filter and status_filter not in VendorStatus.values:
            return _bad_request(
                code="validation_error",
                message=f"Unknown status '{status_filter}'. "
                f"Allowed: {', '.join(VendorStatus.values)}.",
                fields={"status": "Invalid value."},
            )
        vendors = VendorAdminService.list_vendors(status=status_filter)
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(vendors, request, view=self)
        serializer = AdminVendorApplicationSerializer(
            page if page is not None else vendors,
            many=True,
        )
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return api_response(data=serializer.data)


class AdminVendorPendingView(APIView):
    """``GET /api/v1/admin/vendors/pending/`` -- PENDING applications.

    Convenience endpoint consumed by ``adminService.pendingVendors()``
    on the frontend. Mirrors :class:`AdminVendorListView` with a
    fixed ``status=PENDING`` filter.
    """

    permission_classes = (IsAuthenticated, IsAdmin)
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        vendors = VendorAdminService.list_vendors(status=VendorStatus.PENDING)
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(vendors, request, view=self)
        serializer = AdminVendorApplicationSerializer(
            page if page is not None else vendors,
            many=True,
        )
        if page is not None:
            return paginator.get_paginated_response(serializer.data)
        return api_response(data=serializer.data)


class AdminVendorApproveView(APIView):
    """``PATCH /api/v1/admin/vendors/{id}/approve/``."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def patch(self, request: Request, vendor_id: str) -> Response:
        try:
            vendor = VendorAdminService.approve(
                actor=request.user, vendor_id=vendor_id
            )
        except VendorAdminServiceError as exc:
            return _vendor_error_to_response(exc)
        return api_response(
            data=AdminVendorApplicationSerializer(vendor).data,
            message="Vendor approved.",
        )


class AdminVendorRejectView(APIView):
    """``PATCH /api/v1/admin/vendors/{id}/reject/`` -- body ``{reason}``."""

    permission_classes = (IsAuthenticated, IsAdmin)
    parser_classes = (JSONParser, FormParser)

    def patch(self, request: Request, vendor_id: str) -> Response:
        serializer = AdminVendorRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            vendor = VendorAdminService.reject(
                actor=request.user,
                vendor_id=vendor_id,
                reason=serializer.validated_data["reason"],
            )
        except VendorAdminServiceError as exc:
            return _vendor_error_to_response(exc)
        return api_response(
            data=AdminVendorApplicationSerializer(vendor).data,
            message="Vendor rejected.",
        )


class AdminVendorRequestInfoView(APIView):
    """``PATCH /api/v1/admin/vendors/{id}/request-info/`` -- body ``{message}``."""

    permission_classes = (IsAuthenticated, IsAdmin)
    parser_classes = (JSONParser, FormParser)

    def patch(self, request: Request, vendor_id: str) -> Response:
        message = (request.data or {}).get("message", "")
        try:
            vendor = VendorAdminService.request_info(
                actor=request.user,
                vendor_id=vendor_id,
                message=message,
            )
        except VendorAdminServiceError as exc:
            return _vendor_error_to_response(exc)
        return api_response(
            data=AdminVendorApplicationSerializer(vendor).data,
            message="Info request sent.",
        )
