"""Wishlist serializers -- Module 3.

The frontend's ``useWishlistStore`` expects ``GET /wishlist/`` to return
``{items, item_count}`` where each item carries the embedded product
payload, exactly the same shape as the cart uses.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.products.models import Product
from apps.products.serializers import ProductListSerializer
from apps.wishlist.models import Wishlist, WishlistItem


class WishlistItemSerializer(serializers.ModelSerializer):
    """Read representation of a wishlist line."""

    product = ProductListSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.filter(is_active=True),
        write_only=True,
    )

    class Meta:
        model = WishlistItem
        fields = ("id", "product", "product_id", "created_at", "updated_at")
        read_only_fields = ("id", "product", "created_at", "updated_at")


class WishlistItemCreateSerializer(serializers.Serializer):
    """Body of ``POST /wishlist/items/`` -- accepts ``product_id`` or ``product``.

    The frontend's ``wishlistService.add`` posts ``{product: <id>}``;
    older callers and the canonical REST shape use ``{product_id: <id>}``.
    Both keys resolve to the same ``Product`` instance.
    """

    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        required=False,
    )
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        required=False,
    )

    def validate(self, attrs):
        product = attrs.get("product") or attrs.get("product_id")
        if product is None:
            raise serializers.ValidationError(
                {"product_id": "Provide either 'product' or 'product_id'."}
            )
        attrs["product"] = product
        return attrs


class WishlistSerializer(serializers.Serializer):
    """Read representation of the user's whole wishlist."""

    items = WishlistItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance: Wishlist) -> dict:
        items_qs = (
            instance.items.select_related("product")
            .order_by("-updated_at")
        )
        items_data = WishlistItemSerializer(items_qs, many=True).data
        return {
            "items": items_data,
            "item_count": items_data.__len__(),
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
        }