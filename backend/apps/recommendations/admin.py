"""Admin registration for the recommendations app (Module 7)."""
from django.contrib import admin

from apps.recommendations.models import ProductView, SearchLog


@admin.register(ProductView)
class ProductViewAdmin(admin.ModelAdmin):
    list_display = ("id", "product", "user", "session_key", "viewed_at", "is_active")
    list_filter = ("viewed_at", "is_active")
    search_fields = ("product__name", "product__slug", "user__email", "session_key")
    readonly_fields = ("viewed_at", "created_at", "updated_at")
    date_hierarchy = "viewed_at"
    list_select_related = ("product", "user")


@admin.register(SearchLog)
class SearchLogAdmin(admin.ModelAdmin):
    """Search analytics (Module 11)."""

    list_display = ("id", "query", "results_count", "user", "timestamp")
    list_filter = ("timestamp",)
    search_fields = ("query", "user__email")
    readonly_fields = ("timestamp",)
    date_hierarchy = "timestamp"
    list_select_related = ("user",)
