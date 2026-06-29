"""Auth URL routes for Module 1.

Mounted by ``config/urls.py`` at ``/api/v1/auth/``.

The Module 9 admin-user routes live in ``apps.accounts.admin_urls`` so
the public auth namespace stays isolated from the admin namespace.
"""
from __future__ import annotations

from django.urls import path

from apps.accounts.views import (
    ChangePasswordView,
    CustomerRegisterView,
    LoginView,
    LogoutView,
    ProfileView,
    ResendOTPView,
    TokenRefreshView,
    VendorDocumentUploadView,
    VendorRegisterView,
    VerifyEmailView,
)

app_name = "accounts"

urlpatterns: list = [
    path(
        "register/customer/",
        CustomerRegisterView.as_view(),
        name="register-customer",
    ),
    path(
        "register/vendor/",
        VendorRegisterView.as_view(),
        name="register-vendor",
    ),
    path(
        "login/",
        LoginView.as_view(),
        name="login",
    ),
    path(
        "logout/",
        LogoutView.as_view(),
        name="logout",
    ),
    path(
        "change-password/",
        ChangePasswordView.as_view(),
        name="change-password",
    ),
    path(
        "token/refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),
    # ---- email verification (OTP) ----
    path(
        "verify-email/",
        VerifyEmailView.as_view(),
        name="verify-email",
    ),
    path(
        "resend-otp/",
        ResendOTPView.as_view(),
        name="resend-otp",
    ),
    path(
        "profile/",
        ProfileView.as_view(),
        name="profile",
    ),
    path(
        "vendor/documents/",
        VendorDocumentUploadView.as_view(),
        name="vendor-documents",
    ),
]
