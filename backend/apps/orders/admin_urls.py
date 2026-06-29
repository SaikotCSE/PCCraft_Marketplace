"""Admin-side order URLconf.

Mounted at ``/api/v1/admin/orders/`` by ``config/urls.py`` under namespace
``"admin-orders"``. Admin return endpoints stay on the existing
``apps/orders/urls.py`` mount (``/api/v1/admin/returns/``); this router
focuses on the order-management pair added by Module 9.
"""
from __future__ import annotations

from django.urls import path

from apps.orders.views import (
    AdminOrderDetailView,
    AdminOrderListView,
)

app_name = "admin_orders"

urlpatterns: list = [
    path("", AdminOrderListView.as_view(), name="admin-order-list"),
    path(
        "<str:order_number>/",
        AdminOrderDetailView.as_view(),
        name="admin-order-detail",
    ),
]
