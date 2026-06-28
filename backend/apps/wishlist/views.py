"""Wishlist views -- Module 3.

Endpoints (all require an authenticated CUSTOMER)::

    GET    /api/v1/wishlist/                       - full wishlist
    POST   /api/v1/wishlist/items/                 - add a product
    DELETE /api/v1/wishlist/items/<id>/            - remove a single row
    POST   /api/v1/wishlist/items/<id>/move-to-cart/
                                                  - move into cart
    DELETE /api/v1/wishlist/clear/                 - empty the wishlist
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.cart.serializers import CartItemSerializer
from apps.common.permissions import IsCustomer
from apps.common.response import api_response
from apps.wishlist.models import WishlistItem
from apps.wishlist.serializers import (
    WishlistItemCreateSerializer,
    WishlistItemSerializer,
    WishlistSerializer,
)
from apps.wishlist.services import WishlistService

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# /wishlist/  +  /wishlist/clear/
# ----------------------------------------------------------------------
class WishlistDetailView(APIView):
    permission_classes = (IsAuthenticated, IsCustomer)

    def get(self, request, *args, **kwargs):
        wishlist = WishlistService.get_or_create_wishlist(request.user)
        return api_response(
            data=WishlistSerializer(wishlist).data,
            status=status.HTTP_200_OK,
        )


class WishlistClearView(APIView):
    permission_classes = (IsAuthenticated, IsCustomer)

    def delete(self, request, *args, **kwargs):
        wishlist = WishlistService.get_or_create_wishlist(request.user)
        removed = WishlistService.clear_wishlist(wishlist)
        return api_response(
            data={"removed": removed, "message": "Wishlist cleared."},
            status=status.HTTP_200_OK,
        )


# ----------------------------------------------------------------------
# /wishlist/items/
# ----------------------------------------------------------------------
class WishlistItemListCreateView(APIView):
    permission_classes = (IsAuthenticated, IsCustomer)

    def post(self, request, *args, **kwargs):
        serializer = WishlistItemCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )

        wishlist = WishlistService.get_or_create_wishlist(request.user)
        item = WishlistService.add_item(
            wishlist=wishlist,
            product_id=serializer.validated_data["product"].pk,
        )
        return api_response(
            data=WishlistItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ----------------------------------------------------------------------
# /wishlist/items/<id>/  +  /wishlist/items/<id>/move-to-cart/
# ----------------------------------------------------------------------
class _WishlistItemLookupMixin:
    permission_classes = (IsAuthenticated, IsCustomer)

    def _get_item(self, request, item_id) -> WishlistItem:
        try:
            return WishlistItem.objects.select_related("product", "wishlist").get(
                pk=item_id,
                wishlist__user=request.user,
            )
        except WishlistItem.DoesNotExist as exc:
            raise NotFound("Wishlist item not found.") from exc


class WishlistItemDetailView(_WishlistItemLookupMixin, APIView):
    def delete(self, request, item_id, *args, **kwargs):
        item = self._get_item(request, item_id)
        WishlistService.remove_item(item)
        return api_response(
            data={"message": "Wishlist item removed.", "id": str(item_id)},
            status=status.HTTP_200_OK,
        )


class WishlistItemMoveToCartView(_WishlistItemLookupMixin, APIView):
    """``POST /wishlist/items/<id>/move-to-cart/`` -- move line into cart.

    Body (optional)::

        { "quantity": 2 }

    Defaults to ``quantity=1`` per the spec.
    """

    def post(self, request, item_id, *args, **kwargs):
        item = self._get_item(request, item_id)
        quantity = int(request.data.get("quantity", 1))
        if quantity < 1:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "quantity must be >= 1.",
                },
            )

        try:
            cart_item = WishlistService.move_to_cart(item, quantity=quantity)
        except Exception as exc:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={"code": "wishlist_error", "message": str(exc)},
            )

        return api_response(
            data=CartItemSerializer(cart_item, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
