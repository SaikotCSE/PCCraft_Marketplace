"""Order views -- Module 4.

All endpoints listed in the spec are implemented here.  Views are
intentionally thin: every business rule lives in
``apps.orders.services``.  Views translate HTTP <-> service calls and
wrap results in the standard ``APIResponse`` envelope.

Endpoint summary (mounted by ``apps/orders/urls.py``):

    GET    /api/v1/addresses/                 -> AddressListCreateView
    POST   /api/v1/addresses/                 -> AddressListCreateView
    GET    /api/v1/addresses/{id}/            -> AddressDetailView
    PATCH  /api/v1/addresses/{id}/            -> AddressDetailView
    DELETE /api/v1/addresses/{id}/            -> AddressDetailView
    POST   /api/v1/addresses/{id}/set-default/ -> AddressSetDefaultView

    POST   /api/v1/orders/                    -> OrderCreateView
    GET    /api/v1/orders/                    -> OrderListView
    GET    /api/v1/orders/{order_number}/     -> OrderDetailView
    POST   /api/v1/orders/{order_number}/cancel/ -> OrderCancelView

    GET    /api/v1/vendor/orders/             -> VendorOrderListView
    GET    /api/v1/vendor/orders/{order_number}/ -> VendorOrderDetailView
    PATCH  /api/v1/vendor/orders/items/{id}/status/ -> VendorOrderItemStatusView

    POST   /api/v1/orders/items/{id}/return/        -> ReturnInitiateView
    GET    /api/v1/returns/                         -> CustomerReturnListView
    GET    /api/v1/returns/{id}/                    -> CustomerReturnDetailView
    POST   /api/v1/returns/{id}/ship-back/          -> CustomerShipBackView

    GET    /api/v1/vendor/returns/                  -> VendorReturnListView
    PATCH  /api/v1/vendor/returns/{id}/review/      -> VendorReturnReviewView
    PATCH  /api/v1/vendor/returns/{id}/mark-received/ -> VendorReturnMarkReceivedView

    GET    /api/v1/admin/returns/                   -> AdminReturnListView
    PATCH  /api/v1/admin/returns/{id}/process-refund/  -> AdminReturnProcessRefundView
    PATCH  /api/v1/admin/returns/{id}/confirm-refund/  -> AdminReturnConfirmRefundView
"""
from __future__ import annotations

import logging

from django.core.exceptions import ValidationError
from rest_framework import status as drf_status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin, IsApprovedVendor, IsCustomer
from apps.common.response import api_response
from apps.orders.models import (
    Order,
    OrderItem,
    ReturnRequest,
    ShippingAddress,
)
from apps.orders.serializers import (
    AdminReturnActionSerializer,
    CustomerShipBackSerializer,
    OrderCreateSerializer,
    OrderItemStatusUpdateSerializer,
    OrderSerializer,
    ReturnRequestCreateSerializer,
    ReturnRequestSerializer,
    ShippingAddressSerializer,
    VendorReturnReviewSerializer,
)
from apps.orders.services import (
    AddressService,
    MAX_RETURN_EVIDENCE,
    OrderAdminService,
    OrderAdminServiceError,
    OrderService,
    ReturnAdminService,
    ReturnService,
)

logger = logging.getLogger(__name__)


def _bad_request(
    code: str,
    message: str,
    fields: dict | None = None,
    *,
    status: int = drf_status.HTTP_400_BAD_REQUEST,
) -> "Response":
    """Return a typed-error envelope.

    ``status`` defaults to 400 for validation errors but callers may pass
    404 (resource missing) or 409 (conflict) etc. -- keeping the
    overload option visible at the call site keeps the helper generic.
    """
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return api_response(status=status, error=error)


def _service_error(exc: ValidationError):
    """Translate a ``ValidationError`` raised in services into our envelope."""
    message = exc.message if hasattr(exc, "message") else str(exc)
    if hasattr(exc, "messages"):
        try:
            message = "; ".join(exc.messages)
        except Exception:  # pragma: no cover
            pass
    return api_response(
        status=drf_status.HTTP_400_BAD_REQUEST,
        error={"code": "validation_error", "message": message},
    )


# ===========================================================================
# Address endpoints
# ===========================================================================
class AddressListCreateView(APIView):
    """``GET / POST /api/v1/addresses/``."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        rows = AddressService.list_for_user(request.user)
        data = ShippingAddressSerializer(rows, many=True).data
        return api_response(data=data, status=drf_status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        serializer = ShippingAddressSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            address = AddressService.create_address(request.user, serializer.validated_data)
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ShippingAddressSerializer(address).data,
            status=drf_status.HTTP_201_CREATED,
        )


class AddressDetailView(APIView):
    """``GET/PATCH/DELETE /api/v1/addresses/{id}/``."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def _get_address(self, request, address_id) -> ShippingAddress:
        try:
            return ShippingAddress.objects.get(pk=address_id, user=request.user)
        except ShippingAddress.DoesNotExist as exc:
            raise NotFound("Address not found.") from exc

    def get(self, request, address_id, *args, **kwargs):
        address = self._get_address(request, address_id)
        return api_response(
            data=ShippingAddressSerializer(address).data,
            status=drf_status.HTTP_200_OK,
        )

    def patch(self, request, address_id, *args, **kwargs):
        address = self._get_address(request, address_id)
        serializer = ShippingAddressSerializer(address, data=request.data, partial=True)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            address = AddressService.update_address(address, serializer.validated_data)
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ShippingAddressSerializer(address).data,
            status=drf_status.HTTP_200_OK,
        )

    def delete(self, request, address_id, *args, **kwargs):
        address = self._get_address(request, address_id)
        try:
            AddressService.delete_address(address)
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data={"message": "Address deleted.", "id": str(address_id)},
            status=drf_status.HTTP_200_OK,
        )


class AddressSetDefaultView(APIView):
    """``POST /api/v1/addresses/{id}/set-default/``."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, address_id, *args, **kwargs):
        try:
            address = AddressService.set_default(request.user, address_id)
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ShippingAddressSerializer(address).data,
            status=drf_status.HTTP_200_OK,
        )


# ===========================================================================
# Order endpoints (customer-facing)
# ===========================================================================
class OrderListView(APIView):
    """``GET /api/v1/orders/`` -- the customer's order history."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        qs = (
            Order.objects
            .filter(user=request.user)
            .prefetch_related("items", "items__vendor", "items__product")
            .order_by("-created_at")
        )

        # Optional filters: status=, date_from=, date_to=
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            data = OrderSerializer(page, many=True).data
            return paginator.get_paginated_response(data)

        data = OrderSerializer(qs, many=True).data
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class OrderListCreateView(APIView):
    """``GET/POST /api/v1/orders/`` -- single endpoint for customer orders.

    * ``GET``  -> paginated order history (status / date_from / date_to filters)
    * ``POST`` -> place an order from the current cart
    """

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        return OrderListView().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return OrderCreateView().post(request, *args, **kwargs)


class OrderCreateView(APIView):
    """``POST /api/v1/orders/`` -- place an order from the current cart."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            order = OrderService.create_order_from_cart(
                user=request.user,
                address_id=serializer.validated_data["address_id"].pk,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValidationError as exc:
            return _service_error(exc)
        # Eager-load items so the serializer can render them.
        order = (
            Order.objects
            .prefetch_related("items", "items__vendor", "items__product")
            .get(pk=order.pk)
        )
        return api_response(
            data=OrderSerializer(order).data,
            status=drf_status.HTTP_201_CREATED,
        )


class OrderDetailView(APIView):
    """``GET /api/v1/orders/{order_number}/`` -- one order."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, order_number, *args, **kwargs):
        try:
            order = (
                Order.objects
                .select_related("user")
                .prefetch_related("items", "items__vendor", "items__product")
                .get(order_number=order_number, user=request.user)
            )
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        return api_response(
            data=OrderSerializer(order).data,
            status=drf_status.HTTP_200_OK,
        )


class OrderCancelView(APIView):
    """``POST /api/v1/orders/{order_number}/cancel/``."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, order_number, *args, **kwargs):
        try:
            order = Order.objects.get(order_number=order_number, user=request.user)
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        try:
            order = OrderService.cancel_order(order.pk, request.user)
        except ValidationError as exc:
            return _service_error(exc)
        order = (
            Order.objects
            .prefetch_related("items", "items__vendor", "items__product")
            .get(pk=order.pk)
        )
        return api_response(
            data=OrderSerializer(order).data,
            status=drf_status.HTTP_200_OK,
        )


# ===========================================================================
# Vendor order endpoints
# ===========================================================================
class VendorOrderListView(APIView):
    """``GET /api/v1/vendor/orders/`` -- order items for this vendor.

    Optional filters: ``status`` (item status), ``order_status`` (parent
    order status), ``date_from`` / ``date_to``.
    """

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def get(self, request, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied", "message": "Vendor profile missing."},
            )

        qs = OrderService.list_for_vendor(vendor_profile)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(item_status=status_filter)
        order_status = request.query_params.get("order_status")
        if order_status:
            qs = qs.filter(order__status=order_status)
        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__lte=date_to)

        # Build a slim per-row shape so the vendor table is one request.
        from apps.orders.serializers import OrderItemSerializer

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        items_data = OrderItemSerializer(page if page is not None else qs, many=True).data

        # Attach order summary to each row for the vendor's table view.
        items = list(page if page is not None else qs)
        for row in items:
            pass  # placeholder to keep IDE quiet
        # OrderSerializer is heavy; for vendor list we expose a minimal block.
        rows_out = []
        for it, raw in zip(items, items_data):
            order = it.order
            customer = order.user
            rows_out.append({
                "id": raw["id"],
                "order_number": order.order_number,
                "order_status": order.status,
                "product_id": raw["product_id"],
                "product_name": raw["product_name_snapshot"],
                "primary_image_url": raw["primary_image_url"],
                "quantity": raw["quantity"],
                "unit_price": raw["unit_price"],
                "line_total": raw["line_total"],
                "item_status": raw["item_status"],
                "shipped_at": raw["shipped_at"],
                "delivered_at": raw["delivered_at"],
                "customer_name": (customer.full_name or "").strip() if customer else "",
                "customer_first_name": (
                    (customer.full_name or "").split(" ")[0] if customer and customer.full_name else ""
                ),
                "order_date": order.created_at.isoformat() if order.created_at else None,
                "tracking_number": order.tracking_number,
            })

        if page is not None:
            return paginator.get_paginated_response(rows_out)
        return api_response(data=rows_out, status=drf_status.HTTP_200_OK)


class VendorOrderDetailView(APIView):
    """``GET /api/v1/vendor/orders/{order_number}/`` -- one order's vendor view."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def get(self, request, order_number, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied", "message": "Vendor profile missing."},
            )

        try:
            order = (
                Order.objects
                .prefetch_related("items", "items__vendor", "items__product")
                .get(order_number=order_number)
            )
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc

        items = [
            it for it in order.items.all() if it.vendor_id == vendor_profile.pk
        ]
        if not items:
            raise NotFound("No items in this order belong to your store.")

        from apps.orders.serializers import OrderItemSerializer

        data = {
            "id": str(order.pk),
            "order_number": order.order_number,
            "status": order.status,
            "payment_method": order.payment_method,
            "payment_status": order.payment_status,
            "subtotal": str(order.subtotal),
            "shipping_fee": str(order.shipping_fee),
            "tax": str(order.tax),
            "total": str(order.total),
            "shipping_address": order.shipping_address_snapshot,
            "items": OrderItemSerializer(items, many=True).data,
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class VendorOrderItemStatusView(APIView):
    """``PATCH /api/v1/vendor/orders/items/{id}/status/``."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def patch(self, request, item_id, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied", "message": "Vendor profile missing."},
            )

        serializer = OrderItemStatusUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )

        try:
            item = OrderService.update_item_status(
                item_id=item_id,
                vendor_profile=vendor_profile,
                new_status=serializer.validated_data["status"],
                tracking_number=serializer.validated_data.get("tracking_number", ""),
            )
        except ValidationError as exc:
            return _service_error(exc)

        from apps.orders.serializers import OrderItemSerializer

        return api_response(
            data=OrderItemSerializer(item).data,
            status=drf_status.HTTP_200_OK,
        )


# ===========================================================================
# Module 5 -- Returns & Refunds endpoints
# ===========================================================================
class ReturnInitiateView(APIView):
    """``POST /api/v1/orders/items/{id}/return/`` -- customer starts a return.

    Accepts ``multipart/form-data`` so the customer can attach up to
    ``MAX_RETURN_EVIDENCE`` (4) photos in the same request.
    """

    permission_classes = (IsAuthenticated, IsCustomer)
    parser_classes = None  # assigned in __init_subclass__ via DRF

    def get_parsers(self):
        # Allow multipart so evidence images can be uploaded in one shot
        # without forcing the frontend to pre-upload them somewhere.
        from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
        return [MultiPartParser(), FormParser(), JSONParser()]

    def post(self, request, item_id, *args, **kwargs):
        serializer = ReturnRequestCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )

        images = request.FILES.getlist("images")
        if len(images) > MAX_RETURN_EVIDENCE:
            return _bad_request(
                "too_many_images",
                "You can upload at most %d evidence images."
                % MAX_RETURN_EVIDENCE,
            )

        try:
            ret = ReturnService.initiate_return(
                user=request.user,
                order_item_id=item_id,
                reason=serializer.validated_data["reason"],
                description=serializer.validated_data["description"],
                images=images,
            )
        except ValidationError as exc:
            return _service_error(exc)

        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_201_CREATED,
        )


class CustomerReturnListView(APIView):
    """``GET /api/v1/returns/`` -- the customer's own returns."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        qs = ReturnService.list_for_customer(request.user)
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = ReturnRequestSerializer(
            page if page is not None else qs,
            many=True, context={"request": request},
        ).data
        if page is not None:
            return paginator.get_paginated_response(data)
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class CustomerReturnDetailView(APIView):
    """``GET /api/v1/returns/{id}/`` -- single return detail."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, return_id, *args, **kwargs):
        try:
            ret = ReturnRequest.objects.select_related(
                "order_item", "order_item__order", "order_item__vendor",
                "customer",
            ).prefetch_related("evidence").get(
                pk=return_id, customer=request.user,
            )
        except ReturnRequest.DoesNotExist as exc:
            raise NotFound("Return request not found.") from exc
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


class CustomerShipBackView(APIView):
    """``POST /api/v1/returns/{id}/ship-back/`` -- customer sends it back."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, return_id, *args, **kwargs):
        serializer = CustomerShipBackSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            ret = ReturnService.ship_back(
                user=request.user,
                return_id=return_id,
                tracking_number=serializer.validated_data["tracking_number"],
            )
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


class VendorReturnListView(APIView):
    """``GET /api/v1/vendor/returns/`` -- returns for the vendor's items."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def get(self, request, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied",
                       "message": "Vendor profile missing."},
            )

        qs = ReturnService.list_for_vendor(
            vendor_profile, status=request.query_params.get("status"),
        )
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = ReturnRequestSerializer(
            page if page is not None else qs,
            many=True, context={"request": request},
        ).data
        if page is not None:
            return paginator.get_paginated_response(data)
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class VendorReturnReviewView(APIView):
    """``PATCH /api/v1/vendor/returns/{id}/review/`` -- approve / reject."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def patch(self, request, return_id, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied",
                       "message": "Vendor profile missing."},
            )

        serializer = VendorReturnReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )

        action = serializer.validated_data["action"]
        try:
            if action == "approve":
                ret = ReturnService.approve_return(
                    vendor_profile, return_id,
                    vendor_notes=serializer.validated_data.get("vendor_notes", ""),
                )
            else:  # reject
                ret = ReturnService.reject_return(
                    vendor_profile, return_id,
                    reason=serializer.validated_data.get("reason", ""),
                    vendor_notes=serializer.validated_data.get("vendor_notes", ""),
                )
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


class VendorReturnMarkReceivedView(APIView):
    """``PATCH /api/v1/vendor/returns/{id}/mark-received/``."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)

    def patch(self, request, return_id, *args, **kwargs):
        vendor_profile = getattr(request.user, "vendor_profile", None)
        if vendor_profile is None:
            return api_response(
                status=drf_status.HTTP_403_FORBIDDEN,
                error={"code": "permission_denied",
                       "message": "Vendor profile missing."},
            )

        serializer = VendorReturnReviewSerializer(data=request.data)
        # Reuse the review serializer to surface optional vendor_notes.
        # Only vendor_notes is read here; ``action`` is ignored.
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            ret = ReturnService.mark_received(
                vendor_profile, return_id,
                vendor_notes=serializer.validated_data.get("vendor_notes", ""),
            )
        except ValidationError as exc:
            return _service_error(exc)
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


class AdminReturnListView(APIView):
    """``GET /api/v1/admin/returns/`` -- all returns (filterable by status)."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def get(self, request, *args, **kwargs):
        qs = ReturnService.list_for_admin(
            status=request.query_params.get("status"),
        )
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = ReturnRequestSerializer(
            page if page is not None else qs,
            many=True, context={"request": request},
        ).data
        if page is not None:
            return paginator.get_paginated_response(data)
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class AdminReturnProcessRefundView(APIView):
    """``PATCH /api/v1/admin/returns/{id}/process-refund/``."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def patch(self, request, return_id, *args, **kwargs):
        serializer = AdminReturnActionSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            ret = ReturnAdminService.process_refund(
                actor=request.user,
                return_id=return_id,
                admin_notes=serializer.validated_data.get("admin_notes", ""),
            )
        except OrderAdminServiceError as exc:
            return _bad_request(exc.code, exc.message, exc.fields or None)
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


class AdminReturnConfirmRefundView(APIView):
    """``PATCH /api/v1/admin/returns/{id}/confirm-refund/``."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def patch(self, request, return_id, *args, **kwargs):
        serializer = AdminReturnActionSerializer(data=request.data)
        if not serializer.is_valid():
            return _bad_request(
                "validation_error",
                "One or more fields failed validation.",
                serializer.errors,
            )
        try:
            ret = ReturnAdminService.confirm_refund(
                actor=request.user,
                return_id=return_id,
                admin_notes=serializer.validated_data.get("admin_notes", ""),
            )
        except OrderAdminServiceError as exc:
            return _bad_request(exc.code, exc.message, exc.fields or None)
        return api_response(
            data=ReturnRequestSerializer(ret, context={"request": request}).data,
            status=drf_status.HTTP_200_OK,
        )


# ===========================================================================
# Module 9 -- Admin order endpoints (read-only list + detail)
# ===========================================================================
class AdminOrderListView(APIView):
    """``GET /api/v1/admin/orders/`` -- paginated order list with filters.

    Filters per spec: ``status``, ``date_from``, ``date_to``, ``vendor``
    (vendor profile id), ``search`` (order_number or customer email).
    """

    permission_classes = (IsAuthenticated, IsAdmin)

    def get(self, request, *args, **kwargs):
        try:
            qs = OrderAdminService.list_orders(
                status=request.query_params.get("status", ""),
                date_from=request.query_params.get("date_from", ""),
                date_to=request.query_params.get("date_to", ""),
                vendor=request.query_params.get("vendor", ""),
                search=request.query_params.get("search", ""),
                ordering=request.query_params.get("ordering", "-created_at"),
            )
        except (ValueError, TypeError) as exc:
            return _bad_request(
                "validation_error",
                "One or more filter values are invalid.",
                fields={"detail": str(exc)},
            )

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = OrderSerializer(page if page is not None else qs, many=True).data
        if page is not None:
            return paginator.get_paginated_response(data)
        return api_response(data=data, status=drf_status.HTTP_200_OK)


class AdminOrderDetailView(APIView):
    """``GET /api/v1/admin/orders/{order_number}/`` -- full read-only detail."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def get(self, request, order_number, *args, **kwargs):
        try:
            order = OrderAdminService.get_order_by_number(order_number)
        except OrderAdminServiceError as exc:
            # 404 (resource missing) must surface as 404, not 400.
            return _bad_request(
                exc.code, exc.message, exc.fields or None,
                status=exc.http_status,
            )
        return api_response(
            data=OrderSerializer(order).data,
            status=drf_status.HTTP_200_OK,
        )
