"""Django admin registration for the cart app."""
from __future__ import annotations

from django.contrib import admin

from apps.cart.models import Cart, CartItem


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    raw_id_fields = ("product",)
    readonly_fields = ("is_unavailable", "created_at", "updated_at")


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "updated_at", "created_at")
    search_fields = ("user__email",)
    raw_id_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (CartItemInline,)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("id", "cart", "product", "quantity", "is_unavailable", "updated_at")
    list_filter = ("is_unavailable",)
    search_fields = ("cart__user__email", "product__name")
    raw_id_fields = ("cart", "product")
    readonly_fields = ("created_at", "updated_at")