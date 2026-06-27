"""Auth URL routes for Module 1.

Mounted by ``config/urls.py`` at ``/api/v1/auth/``.
"""
from __future__ import annotations

from django.urls import path

from apps.accounts.views import (
    CustomerRegisterView,
    LoginView,
    LogoutView,
    ProfileView,
    TokenRefreshView,
    VendorDocumentUploadView,
    VendorRegisterView,
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
        "token/refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
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