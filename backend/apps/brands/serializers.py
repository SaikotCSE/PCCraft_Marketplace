"""Serializers for the brands app."""
from __future__ import annotations

from rest_framework import serializers

from apps.brands.models import Brand


class BrandListSerializer(serializers.ModelSerializer):
    """Compact representation used in dropdowns and pickers."""

    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Brand
        fields = (
            "id",
            "name",
            "slug",
            "logo",
            "is_featured",
            "is_active",
            "product_count",
        )

    def get_product_count(self, obj: Brand) -> int:
        try:
            return obj.products.filter(is_active=True).count()  # type: ignore[attr-defined]
        except Exception:
            return 0


class BrandDetailSerializer(serializers.ModelSerializer):
    """Single-brand response."""

    class Meta:
        model = Brand
        fields = (
            "id",
            "name",
            "slug",
            "logo",
            "banner",
            "description",
            "website",
            "is_featured",
            "is_active",
            "display_order",
            "average_rating",
            "total_products",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "average_rating", "total_products",
                            "created_at", "updated_at")


class BrandWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = (
            "id",
            "name",
            "slug",
            "logo",
            "banner",
            "description",
            "website",
            "is_featured",
            "is_active",
            "display_order",
        )
        read_only_fields = ("id",)
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
        }
