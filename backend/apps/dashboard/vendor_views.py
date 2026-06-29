"""Vendor dashboard analytics views -- Module 10.

Each view is gated by ``IsApprovedVendor`` and scopes every query to
``request.user.vendor_profile``. The math lives in
``apps.dashboard.vendor_services``; the views here are thin wrappers
that parse query params and wrap results in ``api_response``.
"""
from __future__ import annotations

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.permissions import IsApprovedVendor
from apps.common.response import api_response
from apps.dashboard import vendor_services


class _VendorAnalyticsView(APIView):
    """Shared base for every vendor dashboard endpoint."""

    permission_classes = [IsAuthenticated, IsApprovedVendor]

    def _vendor_profile(self, request):
        """Resolve the approved vendor profile for the requesting user."""
        return request.user.vendor_profile


class VendorOverviewView(_VendorAnalyticsView):
    """``GET /api/v1/vendor/dashboard/overview/`` -- KPI bundle."""

    def get(self, request, *args, **kwargs):
        vendor = self._vendor_profile(request)
        payload = vendor_services.build_overview(vendor)
        return api_response(data=payload, message="Vendor dashboard overview loaded.")


class VendorRevenueOverTimeView(_VendorAnalyticsView):
    """``GET /api/v1/vendor/dashboard/revenue-over-time/?range=7d|30d|90d``"""

    def get(self, request, *args, **kwargs):
        window = vendor_services.parse_range(request)
        payload = vendor_services.build_revenue_over_time(
            self._vendor_profile(request), window
        )
        return api_response(data=payload)


class VendorTopProductsView(_VendorAnalyticsView):
    """``GET /api/v1/vendor/dashboard/top-products/?limit=5``"""

    def get(self, request, *args, **kwargs):
        limit = vendor_services.parse_limit(request, default=5, ceiling=20)
        payload = vendor_services.build_top_products(
            self._vendor_profile(request), limit
        )
        return api_response(data=payload)


class VendorLowStockView(_VendorAnalyticsView):
    """``GET /api/v1/vendor/dashboard/low-stock/``"""

    def get(self, request, *args, **kwargs):
        payload = vendor_services.build_low_stock(self._vendor_profile(request))
        return api_response(data=payload)