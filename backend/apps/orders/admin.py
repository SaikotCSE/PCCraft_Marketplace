"""Django admin registration for the orders app -- Module 4."""
from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from apps.orders.models import Order, OrderItem, ShippingAddress


@admin.register(ShippingAddress)
class ShippingAddressAdmin(admin.ModelAdmin):
    list_display = (
        "id", "user", "full_name", "phone",
        "city", "district", "country",
        "is_default", "updated_at",
    )
    list_filter = ("is_default", "country", "city", "district")
    search_fields = (
        "full_name", "phone", "street_address",
        "city", "district", "postal_code",
        "user__email", "user__full_name",
    )
    raw_id_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
    list_select_related = ("user",)


class OrderItemInline(admin.TabularInline):
    """Read-only inline listing items inside an Order admin page."""

    model = OrderItem
    extra = 0
    fields = (
        "product", "vendor", "product_name_snapshot",
        "unit_price", "quantity", "line_total_display",
        "item_status", "shipped_at", "delivered_at",
    )
    readonly_fields = fields
    raw_id_fields = ("product", "vendor")
    show_change_link = True

    def line_total_display(self, obj: OrderItem) -> str:
        return "৳ %s" % obj.line_total

    line_total_display.short_description = "Line total"  # type: ignore[attr-defined]
    # `total` is also a property of OrderAdmin below; alias to avoid clash.
    line_total_display = line_total_display


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number", "user", "status_badge",
        "payment_status", "payment_method",
        "total_display", "item_count_display",
        "created_at",
    )
    list_filter = ("status", "payment_status", "payment_method")
    search_fields = (
        "order_number", "user__email", "user__full_name",
        "tracking_number",
    )
    raw_id_fields = ("user",)
    readonly_fields = (
        "order_number", "shipping_address_snapshot",
        "created_at", "updated_at",
        "cancelled_at", "confirmed_at", "shipped_at", "delivered_at",
    )
    inlines = (OrderItemInline,)
    date_hierarchy = "created_at"
    list_select_related = ("user",)

    def status_badge(self, obj: Order) -> str:
        color = {
            Order.PENDING_PAYMENT: "#facc15",
            Order.CONFIRMED: "#22c55e",
            Order.PROCESSING: "#3b82f6",
            Order.SHIPPED: "#0ea5e9",
            Order.OUT_FOR_DELIVERY: "#6366f1",
            Order.DELIVERED: "#16a34a",
            Order.CANCELLED: "#ef4444",
            Order.RETURN_REQUESTED: "#f97316",
            Order.RETURNED: "#a855f7",
        }.get(obj.status, "#6b7280")
        return format_html(
            '<span style="background:{};color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;">{}</span>',
            color, obj.get_status_display(),
        )

    status_badge.short_description = "Status"  # type: ignore[attr-defined]

    def total_display(self, obj: Order) -> str:
        return "৳ %s" % obj.total

    total_display.short_description = "Total"  # type: ignore[attr-defined]

    def item_count_display(self, obj: Order) -> int:
        return obj.item_count

    item_count_display.short_description = "Items"  # type: ignore[attr-defined]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = (
        "id", "order", "product_name_snapshot", "vendor",
        "quantity", "unit_price", "line_total_display",
        "item_status", "created_at",
    )
    list_filter = ("item_status",)
    search_fields = (
        "order__order_number", "product_name_snapshot",
        "vendor__store_name",
    )
    raw_id_fields = ("order", "product", "vendor")
    readonly_fields = (
        "product_name_snapshot", "product_slug_snapshot",
        "primary_image_url", "unit_price", "discount_snapshot",
        "shipped_at", "delivered_at", "created_at", "updated_at",
    )

    def line_total_display(self, obj: OrderItem) -> str:
        return "৳ %s" % obj.line_total

    line_total_display.short_description = "Line total"  # type: ignore[attr-defined]