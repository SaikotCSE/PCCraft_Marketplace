"""Serializers for the categories app."""
from __future__ import annotations

from rest_framework import serializers

from apps.categories.models import Category


# ====================================================================
# Read serializers
# ====================================================================
class CategoryListSerializer(serializers.ModelSerializer):
    """Compact representation used in dropdowns / breadcrumbs."""

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
        )

    def get_product_count(self, obj: Category) -> int:
        # Avoid a hard import cycle — products app registers the
        # ``product`` related_name on Category FK.
        rel = getattr(obj, "product_count", None)
        if rel is not None:
            return int(rel)
        # Fallback: count active products. Tolerates the products app
        # not yet being migrated.
        try:
            return obj.products.filter(is_active=True).count()  # type: ignore[attr-defined]
        except Exception:
            return 0


class CategoryDetailSerializer(serializers.ModelSerializer):
    """Single-category response with spec template + parent meta."""

    parent = CategoryListSerializer(read_only=True)

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


class CategoryTreeSerializer(serializers.Serializer):
    """Output serializer for ``GET /categories/`` (tree action).

    Mirrors ``CategoryService.tree``'s nested dict. Declared as a plain
    ``Serializer`` (not ``ModelSerializer``) because the payload is
    pre-shaped by the service layer.
    """

    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.SlugField()
    description = serializers.CharField()
    icon = serializers.URLField(allow_null=True, required=False)
    image = serializers.URLField(allow_null=True, required=False)
    display_order = serializers.IntegerField()
    is_active = serializers.BooleanField()
    spec_template = serializers.ListField(child=serializers.DictField())
    children = serializers.ListField(child=serializers.DictField())


# ====================================================================
# Write serializers (admin only)
# ====================================================================
class CategoryWriteSerializer(serializers.ModelSerializer):
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
            "slug": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        parent = attrs.get("parent") or (self.instance.parent if self.instance else None)
        if parent is not None and self.instance is not None and parent.id == self.instance.id:
            raise serializers.ValidationError(
                {"parent": "A category cannot be its own parent."},
                code="self_parent",
            )
        # Disallow 3-level nesting: re-parent any incoming grandchild
        # to the existing parent (matches ``Category.save`` behaviour).
        if parent is not None and parent.parent_id is not None:
            raise serializers.ValidationError(
                {"parent": "Categories may only be nested one level deep."},
                code="too_deep",
            )
        return attrs
