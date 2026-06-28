"""Django admin registrations for the compatibility app (Module 8)."""
from __future__ import annotations

from django.contrib import admin

from apps.compatibility.models import (
    CompatibilityAttribute,
    CompatibilityRule,
    PCBuild,
    PCBuildItem,
)


# ====================================================================
# Inlines
# ====================================================================
class PCBuildItemInline(admin.TabularInline):
    """Edit the 11 slot rows inline on the build form.

    ``extra=0`` keeps the form at exactly one row per existing slot
    so the ``UniqueConstraint(build, slot)`` never trips on save.
    """

    model = PCBuildItem
    extra = 0
    raw_id_fields = ("product",)
    autocomplete_fields = ("product",)


# ====================================================================
# Model admins
# ====================================================================
@admin.register(CompatibilityAttribute)
class CompatibilityAttributeAdmin(admin.ModelAdmin):
    list_display = ("name", "data_type", "is_active", "created_at")
    list_filter = ("data_type", "is_active")
    search_fields = ("name", "description")
    ordering = ("name",)


@admin.register(CompatibilityRule)
class CompatibilityRuleAdmin(admin.ModelAdmin):
    list_display = ("rule_name", "rule_type", "severity", "category_a", "category_b", "is_active")
    list_filter = ("rule_type", "severity", "is_active")
    search_fields = ("rule_name", "description")
    autocomplete_fields = ("category_a", "category_b", "attribute_a", "attribute_b")
    ordering = ("rule_name",)


@admin.register(PCBuild)
class PCBuildAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "status", "total_price", "is_public", "share_token", "updated_at")
    list_filter = ("status", "is_public")
    search_fields = ("name", "user__email", "user__username", "share_token")
    readonly_fields = ("share_token", "total_price", "created_at", "updated_at")
    inlines = (PCBuildItemInline,)
    raw_id_fields = ("user",)


@admin.register(PCBuildItem)
class PCBuildItemAdmin(admin.ModelAdmin):
    list_display = ("build", "slot", "product", "created_at")
    list_filter = ("slot",)
    search_fields = ("build__name", "product__name")
    raw_id_fields = ("build", "product")
