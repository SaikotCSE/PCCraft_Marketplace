"""URLconf for the orders app -- Module 4.

Mounted by ``config/urls.py`` at:
    /api/v1/addresses/                    -> address endpoints
    /api/v1/orders/                       -> customer order list / create
    /api/v1/orders/<order_number>/        -> order detail
    /api/v1/orders/<order_number>/cancel/ -> order cancel
    /api/v1/vendor/orders/                -> vendor order endpoints

``orders/`` uses a single view that dispatches GET (history) vs POST
(create) so the spec's ``POST /api/v1/orders/`` works without colliding
with the GET route.

``addresses/`` is exposed both:
  * directly at ``/api/v1/addresses/`` (per spec)
  * legacy alias at ``/api/v1/orders/addresses/`` (kept for backwards
    compatibility with the previously-wired frontend).
"""
from __future__ import annotations

from django.urls import path

from apps.orders.views import (
    AddressDetailView,
    AddressListCreateView,
    AddressSetDefaultView,
    AdminReturnConfirmRefundView,
    AdminReturnListView,
    AdminReturnProcessRefundView,
    CustomerReturnDetailView,
    CustomerReturnListView,
    CustomerShipBackView,
    OrderCancelView,
    OrderDetailView,
    OrderListCreateView,
    ReturnInitiateView,
    VendorOrderDetailView,
    VendorOrderItemStatusView,
    VendorOrderListView,
    VendorReturnListView,
    VendorReturnMarkReceivedView,
    VendorReturnReviewView,
)

app_name = "orders"

urlpatterns: list = [
    # ---- customer order endpoints ----
    # GET  /api/v1/orders/                -> customer's order history
    # POST /api/v1/orders/                -> place order from cart
    path("orders/", OrderListCreateView.as_view(), name="order-list-create"),
    path(
        "orders/<str:order_number>/",
        OrderDetailView.as_view(),
        name="order-detail",
    ),
    path(
        "orders/<str:order_number>/cancel/",
        OrderCancelView.as_view(),
        name="order-cancel",
    ),

    # ---- vendor order endpoints ----
    path("vendor/orders/", VendorOrderListView.as_view(), name="vendor-order-list"),
    path(
        "vendor/orders/<str:order_number>/",
        VendorOrderDetailView.as_view(),
        name="vendor-order-detail",
    ),
    path(
        "vendor/orders/items/<uuid:item_id>/status/",
        VendorOrderItemStatusView.as_view(),
        name="vendor-order-item-status",
    ),

    # ------------------------------------------------------------------
    # Module 5 -- Returns & Refunds endpoints
    # ------------------------------------------------------------------
    # Customer: initiate a return on a single order item
    path(
        "orders/items/<uuid:item_id>/return/",
        ReturnInitiateView.as_view(),
        name="return-initiate",
    ),
    # Customer: list / detail of own returns + ship-back
    path(
        "returns/",
        CustomerReturnListView.as_view(),
        name="customer-return-list",
    ),
    path(
        "returns/<uuid:return_id>/",
        CustomerReturnDetailView.as_view(),
        name="customer-return-detail",
    ),
    path(
        "returns/<uuid:return_id>/ship-back/",
        CustomerShipBackView.as_view(),
        name="customer-return-ship-back",
    ),

    # Vendor: list + review (approve / reject) + mark received
    path(
        "vendor/returns/",
        VendorReturnListView.as_view(),
        name="vendor-return-list",
    ),
    path(
        "vendor/returns/<uuid:return_id>/review/",
        VendorReturnReviewView.as_view(),
        name="vendor-return-review",
    ),
    path(
        "vendor/returns/<uuid:return_id>/mark-received/",
        VendorReturnMarkReceivedView.as_view(),
        name="vendor-return-mark-received",
    ),

    # Admin: list, process refund, confirm refund
    path(
        "admin/returns/",
        AdminReturnListView.as_view(),
        name="admin-return-list",
    ),
    path(
        "admin/returns/<uuid:return_id>/process-refund/",
        AdminReturnProcessRefundView.as_view(),
        name="admin-return-process-refund",
    ),
    path(
        "admin/returns/<uuid:return_id>/confirm-refund/",
        AdminReturnConfirmRefundView.as_view(),
        name="admin-return-confirm-refund",
    ),
]


# --------------------------------------------------------------------
# Address book URL patterns -- re-exported so the project can mount
# them either directly at /api/v1/addresses/ (spec path) or under the
# legacy /api/v1/orders/addresses/ alias.
# --------------------------------------------------------------------
address_urlpatterns: list = [
    path("", AddressListCreateView.as_view(), name="address-list"),
    path("<uuid:address_id>/", AddressDetailView.as_view(), name="address-detail"),
    path(
        "<uuid:address_id>/set-default/",
        AddressSetDefaultView.as_view(),
        name="address-set-default",
    ),
]


# Re-export the vendor sub-router so ``config/urls.py`` can mount it
# under ``/api/v1/vendor/orders/`` (already happens via the patterns
# above).  Kept for backwards compatibility with earlier module wiring.
vendor_router = type("VendorRouter", (), {"urls": []})