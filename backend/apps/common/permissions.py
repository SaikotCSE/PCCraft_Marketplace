"""Role-based permissions.

``CustomUser.role`` is an enum: ``customer`` / ``vendor`` / ``admin``.
A vendor additionally tracks ``vendor_profile.is_approved`` which
``IsApprovedVendor`` checks via the related profile.
"""
from __future__ import annotations

from rest_framework.permissions import BasePermission, SAFE_METHODS


def _role(user) -> str | None:
    return getattr(user, "role", None)


class IsCustomer(BasePermission):
    """Allow only authenticated customers."""

    message = "Only customers may access this resource."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and _role(user) == "customer")


class IsVendor(BasePermission):
    """Allow only authenticated vendors (any approval status)."""

    message = "Only vendors may access this resource."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and _role(user) == "vendor")


class IsApprovedVendor(BasePermission):
    """Vendor with an approved vendor profile."""

    message = "Your vendor account is pending approval."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and _role(user) == "vendor"):
            return False
        profile = getattr(user, "vendor_profile", None)
        return bool(profile and getattr(profile, "is_approved", False))


class IsAdmin(BasePermission):
    """Staff/superuser (Django's built-in admin flag)."""

    message = "Administrator privileges required."

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


class ReadOnlyOrAuthenticated(BasePermission):
    """Convenience mix -- GET/HEAD/OPTIONS open to anyone, writes need auth."""

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)