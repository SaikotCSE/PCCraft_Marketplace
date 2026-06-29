"""Admin vendor approval URL configuration.

Mounted at ``/api/v1/admin/vendors/`` (see ``config/urls.py``)."""
from __future__ import annotations

from django.urls import path

from apps.accounts.views import (
    AdminVendorApproveView,
    AdminVendorListView,
    AdminVendorPendingView,
    AdminVendorRejectView,
    AdminVendorRequestInfoView,
)

app_name = "admin_vendors"

urlpatterns = [
    path("", AdminVendorListView.as_view(), name="list"),
    path("pending/", AdminVendorPendingView.as_view(), name="pending"),
    path("<int:vendor_id>/approve/", AdminVendorApproveView.as_view(), name="approve"),
    path("<int:vendor_id>/reject/", AdminVendorRejectView.as_view(), name="reject"),
    path("<int:vendor_id>/request-info/", AdminVendorRequestInfoView.as_view(), name="request-info"),
]