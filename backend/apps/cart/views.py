"""Cart views -- Module 3.

Endpoints (all require an authenticated CUSTOMER)::

    GET    /api/v1/cart/                       - full cart summary (stock-synced)
    POST   /api/v1/cart/items/                 - add a product (body: product_id, quantity)
    PATCH  /api/v1/cart/items/{id}/            - update quantity (body: quantity)
    DELETE /api/v1/cart/items/{id}/            - remove a single line
    DELETE /api/v1/cart/clear/                 - empty the entire cart

The view layer is intentionally thin: every business rule lives in
``CartService``.  Views translate HTTP <-> service calls and wrap
results in the standard ``APIResponse`` envelope.
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cart.models import CartItem
from apps.cart.serializers import (
    CartItemCreateSerializer,
    CartItemUpdateSerializer,
    CartSerializer,
)
from apps.cart.services import CartService
from apps.common.permissions import IsCustomer
from apps.common.response import api_response

logger = logging.getLogger(__name__)


class CartDetailView(APIView):
    """``GET /api/v1/cart/`` -- fetch the current cart with stock synced.
    ``DELETE /api/v1/cart/`` -- alias for ``/cart/clear/``.
    """

    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        cart = CartService.get_or_create_cart(request.user)
        data = CartSerializer(cart).data
        return api_response(data=data, status=status.HTTP_200_OK)

    def delete(self, request, *args, **kwargs):
        cart = CartService.get_or_create_cart(request.user)
        removed = CartService.clear_cart(cart)
        return api_response(
            data={"removed": removed, "message": "Cart cleared."},
            status=status.HTTP_200_OK,
        )


class CartClearView(APIView):
    """``DELETE /api/v1/cart/clear/`` -- empty the entire cart.

    Kept as a separate route for backwards compatibility with the
    canonical path the rest of the app uses.
    """

    permission_classes = (IsAuthenticated, IsCustomer)

    def delete(self, request, *args, **kwargs):
        cart = CartService.get_or_create_cart(request.user)
        removed = CartService.clear_cart(cart)
        return api_response(
            data={"removed": removed, "message": "Cart cleared."},
            status=status.HTTP_200_OK,
        )


class CartItemListCreateView(APIView):
    """``POST /api/v1/cart/items/`` -- add a product to the cart."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, *args, **kwargs):
        serializer = CartItemCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )

        cart = CartService.get_or_create_cart(request.user)
        try:
            item = CartService.add_item(
                cart=cart,
                product_id=serializer.validated_data["product"].pk,
                quantity=serializer.validated_data["quantity"],
            )
        except Exception as exc:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={"code": "cart_error", "message": str(exc)},
            )

        from apps.cart.serializers import CartItemSerializer

        return api_response(
            data=CartItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CartItemDetailView(APIView):
    """``PATCH/DELETE /api/v1/cart/items/{id}/`` -- modify a single line."""

    permission_classes = (IsAuthenticated, IsCustomer)

    def _get_item(self, request, item_id) -> CartItem:
        try:
            return CartItem.objects.select_related("product", "cart").get(
                pk=item_id,
                cart__user=request.user,
            )
        except CartItem.DoesNotExist as exc:
            raise NotFound("Cart item not found.") from exc

    def patch(self, request, item_id, *args, **kwargs):
        item = self._get_item(request, item_id)
        serializer = CartItemUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )

        try:
            result = CartService.update_item(item, serializer.validated_data["quantity"])
        except Exception as exc:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={"code": "cart_error", "message": str(exc)},
            )

        if result is None:
            return api_response(
                data={"message": "Cart item removed."},
                status=status.HTTP_200_OK,
            )

        from apps.cart.serializers import CartItemSerializer

        return api_response(
            data=CartItemSerializer(result, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request, item_id, *args, **kwargs):
        item = self._get_item(request, item_id)
        CartService.remove_item(item)
        return api_response(
            data={"message": "Cart item removed.", "id": str(item_id)},
            status=status.HTTP_200_OK,
        )
