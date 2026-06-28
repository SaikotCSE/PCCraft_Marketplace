"""Serializers for the cart app -- Module 3."""
from __future__ import annotations

from rest_framework import serializers

from apps.cart.models import CartItem
from apps.products.models import Product
from apps.products.serializers import ProductListSerializer


class CartItemSerializer(serializers.ModelSerializer):
    """One line in the cart.

    ``product`` is embedded as ``ProductListSerializer`` so the frontend
    can render the row without a second request; ``item_total`` is the
    quantity * effective_price (a Decimal string for JSON safety).
    """

    product = ProductListSerializer(read_only=True)
    item_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ("id", "product", "quantity", "is_unavailable", "item_total", "updated_at")
        read_only_fields = ("id", "product", "is_unavailable", "item_total", "updated_at")

    def get_item_total(self, obj: CartItem):
        return str(obj.item_total)


class CartItemCreateSerializer(serializers.Serializer):
    """Validate the POST /cart/items/ payload."""

    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True),
        source="product",
    )
    quantity = serializers.IntegerField(min_value=1, default=1)


class CartItemUpdateSerializer(serializers.Serializer):
    """Validate the PATCH /cart/items/{id}/ payload."""

    quantity = serializers.IntegerField(min_value=0)


class CartSerializer(serializers.Serializer):
    """Cart GET response -- items + computed totals."""

    items = CartItemSerializer(many=True)
    subtotal = serializers.CharField()
    item_count = serializers.IntegerField()
    updated_at = serializers.DateTimeField()

    def to_representation(self, instance):
        # ``instance`` here is a Cart object.
        from apps.cart.services import CartService
        from django.utils import timezone

        summary = CartService.get_cart_summary(instance)
        return {
            "items": summary["items"],
            "subtotal": summary["subtotal"],
            "item_count": summary["item_count"],
            "updated_at": timezone.now().isoformat(),
        }