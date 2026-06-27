"""Auth views for Module 1.

Per spec: *"all views call services only -- no logic in views"*.
Every view delegates business work to ``apps.accounts.services.AuthService``
and returns the project-wide ``APIResponse`` envelope.

Endpoints
---------
* ``POST   /api/v1/auth/register/customer/``  ``CustomerRegisterView``
* ``POST   /api/v1/auth/register/vendor/``    ``VendorRegisterView``
* ``POST   /api/v1/auth/login/``              ``LoginView``
* ``POST   /api/v1/auth/logout/``             ``LogoutView``
* ``POST   /api/v1/auth/token/refresh/``     ``TokenRefreshView``  (SimpleJWT built-in)
* ``GET    /api/v1/auth/profile/``            ``ProfileView``
* ``PATCH  /api/v1/auth/profile/``            ``ProfileView``
* ``PATCH  /api/v1/auth/vendor/documents/``   ``VendorDocumentUploadView``
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

from apps.accounts.models import CustomUser, UserRole
from apps.accounts.serializers import (
    CustomerRegisterSerializer,
    LoginSerializer,
    TokenResponseSerializer,
    UserProfileSerializer,
    VendorDocumentUploadSerializer,
    VendorProfileSerializer,
    VendorRegisterSerializer,
)
from apps.accounts.services import AuthService, AuthServiceError
from apps.common.permissions import IsVendor
from apps.common.response import api_response

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
        if exc.code == "role_mismatch"
        else status.HTTP_400_BAD_REQUEST
    )
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
        logger.info("views.customer_register ok user_id=%s", user.pk)
        return api_response(
            data={"user": body, "message": "Account created. Please sign in."},
            status=status.HTTP_201_CREATED,
        )


class VendorRegisterView(APIView):
    """``POST /api/v1/auth/register/vendor/`` -- public, multipart."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    serializer_class = VendorRegisterSerializer

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
# Login / Logout / Refresh
# ====================================================================
class LoginView(APIView):
    """``POST /api/v1/auth/login/`` -- public, role-aware.

    On success returns ``{access, refresh, user}`` so the frontend's
    ``useAuthStore.setAuth`` can be called directly.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    serializer_class = LoginSerializer

    def post(self, request: Request) -> Response:
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
                return _bad_request(
                    "role_mismatch", msg,
                    fields=serializer.errors,
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            if first_code == "no_active_account" or non_field:
                msg = non_field[0] if non_field else "Invalid email or password."
                return _bad_request(
                    "unauthenticated",
                    str(msg),
                    fields=serializer.errors,
                    status_code=status.HTTP_401_UNAUTHORIZED,
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
