"""Dashboard analytics views -- Module 9.

All endpoints are admin-only (``IsAdmin``) and read-only. The heavy
lifting lives in ``apps.dashboard.services``; the views below are
thin wrappers that parse query params, call the right service, and
wrap the result in ``api_response``.
"""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.permissions import IsAdmin
from apps.common.response import api_response
from apps.dashboard import services


class _AdminAnalyticsView(APIView):
    """Shared base -- every dashboard endpoint requires admin auth."""

    permission_classes = [IsAuthenticated, IsAdmin]


class DashboardOverviewView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/overview/`` -- single-shot KPI bundle."""

    def get(self, request, *args, **kwargs):
        payload = services.build_overview()
        return api_response(data=payload, message="Dashboard overview loaded.")


class OrdersOverTimeView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/orders-over-time/?range=7d|30d|90d``

    Accepts ``?range=`` (preferred, per spec §Module 9) and ``?days=``
    (legacy escape hatch for custom windows). Response echoes the
    resolved range under ``meta.range`` so the React filter chips can
    highlight the active window without re-parsing the URL.
    """

    def get(self, request, *args, **kwargs):
        days, label = services._parse_range(request)  # noqa: SLF001
        payload = services.build_orders_over_time(days)
        payload["range"] = label
        return api_response(data=payload)


class RevenueOverTimeView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/revenue-over-time/?range=7d|30d|90d``"""

    def get(self, request, *args, **kwargs):
        days, label = services._parse_range(request)  # noqa: SLF001
        payload = services.build_revenue_over_time(days)
        payload["range"] = label
        return api_response(data=payload)


class TopProductsView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/top-products/?limit=10``"""

    def get(self, request, *args, **kwargs):
        limit = services._parse_limit(request)  # noqa: SLF001
        payload = services.build_top_products(limit)
        return api_response(data=payload)


class TopVendorsView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/top-vendors/?limit=10``"""

    def get(self, request, *args, **kwargs):
        limit = services._parse_limit(request)  # noqa: SLF001
        payload = services.build_top_vendors(limit)
        return api_response(data=payload)


class CategoryDistributionView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/category-distribution/``"""

    def get(self, request, *args, **kwargs):
        payload = services.build_category_distribution()
        return api_response(data=payload)


class UserGrowthView(_AdminAnalyticsView):
    """``GET /api/v1/dashboard/user-growth/?range=7d|30d|90d``"""

    def get(self, request, *args, **kwargs):
        days, label = services._parse_range(request)  # noqa: SLF001
        payload = services.build_user_growth(days)
        payload["range"] = label
        return api_response(data=payload)
