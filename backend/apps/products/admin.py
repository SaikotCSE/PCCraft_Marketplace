"""Django admin registration for the products app."""
from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from apps.products.models import PriceHistory, Product, ProductImage


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ("image", "alt_text", "display_order", "is_primary", "is_active")
    readonly_fields = ()


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "vendor",
        "brand",
        "category",
        "base_price",
        "effective_price",
        "stock_quantity",
        "status",
        "is_featured",
        "is_active",
        "average_rating",
        "updated_at",
    )
    list_filter = ("status", "is_active", "is_featured", "brand", "category")
    search_fields = ("name", "slug", "sku", "vendor__store_name")
    autocomplete_fields = ("brand", "category", "vendor")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("id", "average_rating", "review_count", "total_sold",
                       "created_at", "updated_at")
    inlines = [ProductImageInline]

    fieldsets = (
        ("Identity", {"fields": ("name", "slug", "brand", "category", "vendor")}),
        ("Copy", {"fields": ("short_description", "description")}),
        ("Pricing", {
            "fields": ("base_price", "discounted_price",
                       "discount_start", "discount_end"),
        }),
        ("Inventory", {
            "fields": ("sku", "stock_quantity", "low_stock_threshold"),
        }),
        ("Specs", {
            "classes": ("collapse",),
            "fields": ("specs", "weight_kg", "dimensions_cm", "warranty_months"),
        }),
        ("Lifecycle", {
            "fields": ("status", "is_featured", "is_active"),
        }),
        ("Counters", {
            "classes": ("collapse",),
            "fields": ("average_rating", "review_count", "total_sold"),
        }),
        ("Audit", {
            "classes": ("collapse",),
            "fields": ("id", "created_at", "updated_at"),
        }),
    )

    @admin.display(description="Effective")
    def effective_price(self, obj: Product) -> str:
        return format_html("%.2f" % obj.effective_price)


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ("product", "display_order", "is_primary", "image_thumb", "is_active")
    list_filter = ("is_primary", "is_active")
    search_fields = ("product__name", "alt_text")

    @admin.display(description="Thumbnail")
    def image_thumb(self, obj: ProductImage) -> str:
        if not obj.image:
            return "—"
        return format_html(
            '<img src="{}" style="height:32px;width:auto;'
            'max-width:80px;border-radius:4px;" />',
            obj.image.url,
        )


@admin.register(PriceHistory)
class PriceHistoryAdmin(admin.ModelAdmin):
    list_display = ("product", "price", "recorded_at")
    list_filter = ("recorded_at",)
    search_fields = ("product__name",)
    readonly_fields = ("product", "price", "recorded_at", "created_at", "updated_at")
    date_hierarchy = "recorded_at"

    def has_add_permission(self, request):  # noqa: D401
        return False