"""Admin category serializers (Module 9)."""
from __future__ import annotations

from rest_framework import serializers

from apps.categories.models import Category


class CategoryAdminListSerializer(serializers.ModelSerializer):
    """Row shape for the admin categories table."""

    parent = serializers.SlugRelatedField(read_only=True, slug_field="slug")
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "parent",
            "icon",
            "image",
            "display_order",
            "is_active",
            "product_count",
            "created_at",
            "updated_at",
        )

    def get_product_count(self, obj: Category) -> int:
        rel = getattr(obj, "product_count", None)
        if rel is not None:
            return int(rel)
        try:
            return obj.products.filter(is_active=True).count()  # type: ignore[attr-defined]
        except Exception:
            return 0


class CategoryAdminDetailSerializer(serializers.ModelSerializer):
    """Detail shape for the admin category page (full row + spec template)."""

    parent = CategoryAdminListSerializer(read_only=True)

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "parent",
            "description",
            "icon",
            "image",
            "display_order",
            "is_active",
            "spec_template",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class CategoryAdminWriteSerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Category
        fields = (
            "id",
            "name",
            "slug",
            "parent",
            "description",
            "icon",
            "image",
            "display_order",
            "is_active",
            "spec_template",
        )
        read_only_fields = ("id",)
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True, "validators": []},
        }

    def validate(self, attrs):
        parent = attrs.get("parent") or (self.instance.parent if self.instance else None)
        if parent is not None and self.instance is not None and parent.id == self.instance.id:
            raise serializers.ValidationError(
                {"parent": "A category cannot be its own parent."},
                code="self_parent",
            )
        if parent is not None and parent.parent_id is not None:
            raise serializers.ValidationError(
                {"parent": "Categories may only be nested one level deep."},
                code="too_deep",
            )
        return attrs
