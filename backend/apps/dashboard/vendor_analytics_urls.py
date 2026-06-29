"""Vendor dashboard URLconf -- Module 10.

Mounted at ``/api/v1/vendor/dashboard/`` (see ``config/urls.py``).
"""
from __future__ import annotations

from django.urls import path

from apps.dashboard import vendor_views

app_name = "vendor_dashboard"

urlpatterns: list = [
    path("overview/", vendor_views.VendorOverviewView.as_view(), name="overview"),
    path(
        "revenue-over-time/",
        vendor_views.VendorRevenueOverTimeView.as_view(),
        name="revenue-over-time",
    ),
    path(
        "top-products/",
        vendor_views.VendorTopProductsView.as_view(),
        name="top-products",
    ),
    path(
        "low-stock/",
        vendor_views.VendorLowStockView.as_view(),
        name="low-stock",
    ),
]