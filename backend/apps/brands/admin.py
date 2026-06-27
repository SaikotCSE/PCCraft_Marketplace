"""Django admin registration for the brands app."""
from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from apps.brands.models import Brand


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "logo_thumb",
        "is_featured",
        "is_active",
        "display_order",
        "total_products",
        "updated_at",
    )
    list_filter = ("is_active", "is_featured")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("id", "average_rating", "total_products",
                       "created_at", "updated_at")
    ordering = ("display_order", "name")

    fieldsets = (
        (None, {"fields": ("name", "slug", "description", "website")}),
        ("Display", {"fields": ("logo", "banner", "display_order",
                                "is_active", "is_featured")}),
        ("Counters", {
            "classes": ("collapse",),
            "fields": ("average_rating", "total_products"),
        }),
        ("Audit", {
            "classes": ("collapse",),
            "fields": ("id", "created_at", "updated_at"),
        }),
    )

    @admin.display(description="Logo")
    def logo_thumb(self, obj: Brand) -> str:
        if not obj.logo:
            return "—"
        return format_html(
            '<img src="{}" style="height:24px;width:auto;'
            'max-width:80px;border-radius:4px;" />',
            obj.logo.url,
        )
