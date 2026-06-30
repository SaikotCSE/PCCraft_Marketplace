"""Module 9 admin-only user routes.

Kept in a separate URLconf so ``config/urls.py`` can mount them under
``/api/v1/admin/users/`` without colliding with the public auth
namespace.
"""
from __future__ import annotations

from django.urls import path

from apps.accounts.views import (
    AdminUserActivateView,
    AdminUserChangeRoleView,
    AdminUserDeleteView,
    AdminUserHardDeleteView,
    AdminUserListView,
    AdminUserSuspendView,
    AdminUserUnlockView,
)

app_name = "admin_users"

urlpatterns: list = [
    path("", AdminUserListView.as_view(), name="list"),
    path(
        "<uuid:user_id>/suspend/",
        AdminUserSuspendView.as_view(),
        name="suspend",
    ),
    path(
        "<uuid:user_id>/activate/",
        AdminUserActivateView.as_view(),
        name="activate",
    ),
    path(
        "<uuid:user_id>/change-role/",
        AdminUserChangeRoleView.as_view(),
        name="change-role",
    ),
    path(
        "<uuid:user_id>/unlock/",
        AdminUserUnlockView.as_view(),
        name="unlock",
    ),
    # Permanent removal -- listed before the UUID-only catch-all so
    # the trailing-slash variant can't ever shadow it.
    path(
        "<uuid:user_id>/hard-delete/",
        AdminUserHardDeleteView.as_view(),
        name="hard-delete",
    ),
    path(
        "<uuid:user_id>/",
        AdminUserDeleteView.as_view(),
        name="delete",
    ),
]