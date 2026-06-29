"""Admin brand serializers (Module 9).

Same shape as the public ``BrandListSerializer`` / ``BrandDetailSerializer``
but with extra admin-facing fields (``product_count``) and a write
serializer that mirrors ``BrandWriteSerializer`` so existing payload
contracts still work.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.brands.models import Brand


class BrandAdminListSerializer(serializers.ModelSerializer):
    """Row shape for the admin brands table."""

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
            "display_order",
            "product_count",
            "created_at",
            "updated_at",
        )

    def get_product_count(self, obj: Brand) -> int:
        try:
            return obj.products.filter(is_active=True).count()  # type: ignore[attr-defined]
        except Exception:
            return 0


class BrandAdminDetailSerializer(serializers.ModelSerializer):
    """Detail shape for the admin brand page (full row + metrics)."""

    product_count = serializers.SerializerMethodField()

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
            "product_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "average_rating", "total_products",
            "product_count", "created_at", "updated_at",
        )

    def get_product_count(self, obj: Brand) -> int:
        try:
            return obj.products.filter(is_active=True).count()  # type: ignore[attr-defined]
        except Exception:
            return 0


class BrandAdminWriteSerializer(serializers.ModelSerializer):
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
            "slug": {"required": False, "allow_blank": True, "validators": []},
        }
