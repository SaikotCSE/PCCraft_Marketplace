"""Django admin registration for the categories app."""
from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from apps.categories.models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "slug",
        "parent",
        "display_order",
        "is_active",
        "icon_thumb",
        "updated_at",
    )
    list_filter = ("is_active", "parent")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("id", "created_at", "updated_at")
    ordering = ("display_order", "name")
    list_select_related = ("parent",)

    fieldsets = (
        (None, {
            "fields": ("name", "slug", "parent", "description"),
        }),
        ("Display", {
            "fields": ("display_order", "is_active", "icon", "image"),
        }),
        ("Schema", {
            "fields": ("spec_template",),
            "description": (
                "JSON list of {key, label, type} entries that drive the "
                "vendor product form. See spec §2.7 for canonical keys."
            ),
        }),
        ("Audit", {
            "classes": ("collapse",),
            "fields": ("id", "created_at", "updated_at"),
        }),
    )

    @admin.display(description="Icon")
    def icon_thumb(self, obj: Category) -> str:
        if not obj.icon:
            return "—"
        return format_html(
            '<img src="{}" style="height:28px;width:28px;object-fit:cover;'
            'border-radius:6px;border:1px solid #e2e8f0;" />',
            obj.icon.url,
        )
