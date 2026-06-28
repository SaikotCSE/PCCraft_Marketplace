"""Django admin for the wishlist app."""
from __future__ import annotations

from django.contrib import admin

from apps.wishlist.models import Wishlist, WishlistItem


class WishlistItemInline(admin.TabularInline):
    model = WishlistItem
    extra = 0
    raw_id_fields = ("product",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "updated_at", "created_at")
    search_fields = ("user__email",)
    raw_id_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
    inlines = (WishlistItemInline,)


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ("id", "wishlist", "product", "updated_at")
    search_fields = ("wishlist__user__email", "product__name")
    raw_id_fields = ("wishlist", "product")
    readonly_fields = ("created_at", "updated_at")