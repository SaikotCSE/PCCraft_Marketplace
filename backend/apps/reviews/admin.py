"""Django admin registration for the reviews app -- Module 6."""
from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from apps.reviews.models import Review, ReviewHelpful, ReviewImage


class ReviewImageInline(admin.TabularInline):
    model = ReviewImage
    extra = 0
    fields = ("image", "created_at")
    readonly_fields = ("created_at",)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "user",
        "rating",
        "is_verified_purchase",
        "is_hidden",
        "has_vendor_reply",
        "helpful_count",
        "created_at",
    )
    list_filter = ("rating", "is_hidden", "is_verified_purchase", "created_at")
    search_fields = ("title", "body", "user__email", "user__full_name", "product__name")
    raw_id_fields = ("product", "user")
    readonly_fields = (
        "helpful_count",
        "vendor_replied_at",
        "vendor_reply_edited_at",
        "created_at",
        "updated_at",
    )
    inlines = (ReviewImageInline,)
    list_select_related = ("product", "user")
    actions = ("hide_reviews", "restore_reviews")

    @admin.display(boolean=True, description="Vendor reply?")
    def has_vendor_reply(self, obj: Review) -> bool:
        return bool(obj.vendor_reply)

    @admin.action(description="Hide selected reviews")
    def hide_reviews(self, request, queryset):
        queryset.filter(is_hidden=False).update(is_hidden=True)

    @admin.action(description="Restore selected reviews")
    def restore_reviews(self, request, queryset):
        queryset.filter(is_hidden=True).update(is_hidden=False)


@admin.register(ReviewImage)
class ReviewImageAdmin(admin.ModelAdmin):
    list_display = ("id", "review", "image_preview", "created_at")
    raw_id_fields = ("review",)
    list_filter = ("created_at",)
    search_fields = ("review__product__name",)

    @admin.display(description="Image")
    def image_preview(self, obj: ReviewImage):
        if not obj.image:
            return "-"
        return format_html(
            '<img src="{}" style="height:40px;border-radius:4px;" />',
            obj.image.url,
        )


@admin.register(ReviewHelpful)
class ReviewHelpfulAdmin(admin.ModelAdmin):
    list_display = ("id", "review", "user", "created_at")
    raw_id_fields = ("review", "user")
    list_filter = ("created_at",)
    search_fields = ("user__email", "review__product__name")
