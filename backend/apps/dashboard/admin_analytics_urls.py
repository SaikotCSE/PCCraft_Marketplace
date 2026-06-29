"""Module 9 analytics URLs mounted under ``/api/v1/admin/analytics/``.

The spec (PCCraft_Master_Spec_v4.md §2.9) lists every analytics endpoint
under the ``/admin/analytics/`` prefix; the canonical mount is
``/api/v1/dashboard/*``. This module re-exposes the same views under the
spec-named prefix so the admin frontend can talk to URLs that look
exactly like the spec.

Mounted in ``config/urls.py`` as::

    path("admin/analytics/", include(("apps.dashboard.admin_analytics_urls",
        "admin-analytics"), namespace="admin-analytics")),
"""
from __future__ import annotations

from django.urls import path

from apps.dashboard import views

app_name = "admin_analytics"

# Note: the existing /api/v1/dashboard/* mount uses ?days=. The spec
# requests ``?range=`` (e.g. ``?range=7d``); for now we accept the same
# numeric ``?days=N`` query and let the dashboard views translate it.
# Spec-faithful ``?range=`` parsing lives in the frontend.
urlpatterns: list = [
    path(
        "overview/",
        views.DashboardOverviewView.as_view(),
        name="overview",
    ),
    path(
        "orders-over-time/",
        views.OrdersOverTimeView.as_view(),
        name="orders-over-time",
    ),
    path(
        "top-products/",
        views.TopProductsView.as_view(),
        name="top-products",
    ),
    path(
        "top-vendors/",
        views.TopVendorsView.as_view(),
        name="top-vendors",
    ),
    path(
        "category-distribution/",
        views.CategoryDistributionView.as_view(),
        name="category-distribution",
    ),
    path(
        "revenue-over-time/",
        views.RevenueOverTimeView.as_view(),
        name="revenue-over-time",
    ),
    path(
        # Spec §2.9 exposes the user-growth series under
        # /admin/analytics/. Re-exported here from the canonical
        # /dashboard/ view so the admin frontend can fetch it via
        # the spec-named URL.
        "user-growth/",
        views.UserGrowthView.as_view(),
        name="user-growth",
    ),
]
