"""Serializers for the products app."""
from __future__ import annotations

from rest_framework import serializers

from apps.brands.models import Brand
from apps.brands.serializers import BrandListSerializer
from apps.categories.models import Category
from apps.categories.serializers import CategoryListSerializer
from apps.products.models import Product, ProductImage, ProductStatus


class VendorInlineSerializer(serializers.Serializer):
    """Minimal public vendor shape — appears on every product card."""

    id = serializers.CharField()
    store_name = serializers.CharField()
    store_slug = serializers.CharField()
    store_logo = serializers.SerializerMethodField()

    def get_store_logo(self, obj):
        logo = getattr(obj, "store_logo", None)
        if not logo:
            return None
        request = self.context.get("request")
        url = logo.url
        return request.build_absolute_uri(url) if request else url


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "display_order", "is_primary")
        read_only_fields = ("id",)


class ProductListSerializer(serializers.ModelSerializer):
    """Used for grid/card views in the catalog."""

    brand = BrandListSerializer(read_only=True)
    category = CategoryListSerializer(read_only=True)
    primary_image = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    discount_percent = serializers.IntegerField(read_only=True)
    stock_status = serializers.CharField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "brand",
            "category",
            "short_description",
            "base_price",
            "discounted_price",
            "effective_price",
            "discount_percent",
            "stock_quantity",
            "stock_status",
            "in_stock",
            "average_rating",
            "review_count",
            "total_sold",
            "is_featured",
            "status",
            "primary_image",
        )

    def get_primary_image(self, obj: Product):
        img = obj.images.filter(is_active=True, is_primary=True).first()
        if img is None:
            img = obj.images.filter(is_active=True).order_by("display_order").first()
        if img is None:
            return None
        request = self.context.get("request")
        url = img.image.url
        return request.build_absolute_uri(url) if request else url

    def get_effective_price(self, obj: Product):
        # Prefer the DB-annotated value when present (avoids re-evaluating
        # the discount window in Python for every list row).
        annotated = getattr(obj, "effective_price_db", None)
        return str(annotated) if annotated is not None else str(obj.effective_price)


class ProductDetailSerializer(ProductListSerializer):
    """Used for the public product page; superset of the list shape."""

    images = ProductImageSerializer(many=True, read_only=True)
    vendor = VendorInlineSerializer(read_only=True)
    description = serializers.CharField(read_only=True)
    specs = serializers.JSONField(read_only=True)
    dimensions_cm = serializers.JSONField(read_only=True)
    sku = serializers.CharField(read_only=True)
    warranty_months = serializers.IntegerField(read_only=True)
    weight_kg = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + (
            "description",
            "specs",
            "dimensions_cm",
            "sku",
            "warranty_months",
            "weight_kg",
            "stock_quantity",
            "low_stock_threshold",
            "vendor",
            "images",
            "discount_start",
            "discount_end",
            "created_at",
            "updated_at",
        )

    def get_weight_kg(self, obj: Product):
        return str(obj.weight_kg) if obj.weight_kg is not None else None


# --------------------------------------------------------------------
# Writes
# --------------------------------------------------------------------
class _ForeignBySlugField(serializers.SlugRelatedField):
    """A ``SlugRelatedField`` that raises a clean validation error
    when the slug doesn't exist."""

    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except (KeyError, TypeError) as exc:
            raise serializers.ValidationError("Not found: %s" % data) from exc


class ProductWriteSerializer(serializers.ModelSerializer):
    brand = _ForeignBySlugField(slug_field="slug", queryset=Brand.objects.all())
    category = _ForeignBySlugField(slug_field="slug", queryset=Category.objects.all())

    class Meta:
        model = Product
        fields = (
            "name",
            "brand",
            "category",
            "description",
            "short_description",
            "base_price",
            "discounted_price",
            "discount_start",
            "discount_end",
            "sku",
            "stock_quantity",
            "low_stock_threshold",
            "status",
            "is_featured",
            "weight_kg",
            "dimensions_cm",
            "warranty_months",
            "specs",
        )
        extra_kwargs = {
            "discounted_price": {"required": False, "allow_null": True},
            "discount_start": {"required": False, "allow_null": True},
            "discount_end": {"required": False, "allow_null": True},
            "is_featured": {"required": False},
        }

    def validate_status(self, value):
        if value not in ProductStatus.values:
            raise serializers.ValidationError("Invalid status.")
        return value

    def validate(self, attrs):
        bp = attrs.get("base_price")
        dp = attrs.get("discounted_price")
        if dp is not None and bp is not None and dp >= bp:
            raise serializers.ValidationError({
                "discounted_price": "Must be strictly less than base_price.",
            })
        return attrs


class ProductUpdateSerializer(ProductWriteSerializer):
    """For PATCH; all fields optional."""

    class Meta(ProductWriteSerializer.Meta):
        fields = ProductWriteSerializer.Meta.fields
        extra_kwargs = {
            field: {"required": False, "allow_null": True}
            for field in ProductWriteSerializer.Meta.fields
        }


class ProductImageWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ("id", "image", "alt_text", "display_order", "is_primary")
        read_only_fields = ("id",)

class ProductInlineSerializer(serializers.ModelSerializer):
    """Smallest possible product shape -- used when a foreign key to
    Product is embedded in another resource (reviews, cart items,
    order items, etc.)."""

    primary_image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "base_price",
            "discounted_price",
            "average_rating",
            "review_count",
            "primary_image",
        )
        read_only_fields = fields

    def get_primary_image(self, obj: Product):
        img = (
            obj.images.filter(is_active=True, is_primary=True).first()
            or obj.images.filter(is_active=True).order_by("display_order").first()
        )
        if img is None:
            return None
        request = self.context.get("request")
        url = img.image.url
        return request.build_absolute_uri(url) if request else url


# ====================================================================
# Module 9 — admin product moderation
# ====================================================================
class AdminProductListSerializer(serializers.ModelSerializer):
    """Admin-side product row.

    Adds vendor info, moderation timestamps, and price snapshot
    fields needed by the moderation queue. Read-only.
    """

    brand = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    vendor_id = serializers.UUIDField(read_only=True)
    vendor_name = serializers.SerializerMethodField()
    primary_image = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "slug",
            "sku",
            "status",
            "vendor_id",
            "vendor_name",
            "brand",
            "category",
            "base_price",
            "discounted_price",
            "effective_price",
            "stock_quantity",
            "stock_status",
            "average_rating",
            "review_count",
            "total_sold",
            "is_featured",
            "created_at",
            "updated_at",
            "primary_image",
        )
        read_only_fields = fields

    def _brand(self, obj: Product):
        return obj.brand.name if obj.brand_id else None

    def _category(self, obj: Product):
        return obj.category.name if obj.category_id else None

    def get_brand(self, obj: Product):
        return self._brand(obj)

    def get_category(self, obj: Product):
        return self._category(obj)

    def get_vendor_name(self, obj: Product):
        if obj.vendor_id is None:
            return None
        return getattr(obj.vendor, "store_name", None)

    def get_primary_image(self, obj: Product):
        img = (
            obj.images.filter(is_active=True, is_primary=True).first()
            or obj.images.filter(is_active=True).order_by("display_order").first()
        )
        if img is None:
            return None
        request = self.context.get("request")
        url = img.image.url
        return request.build_absolute_uri(url) if request else url

    def get_effective_price(self, obj: Product):
        annotated = getattr(obj, "effective_price_db", None)
        return str(annotated) if annotated is not None else str(obj.effective_price)


class AdminProductModerateSerializer(serializers.Serializer):
    """Body for ``POST /admin/products/{id}/moderate/``."""

    status = serializers.ChoiceField(choices=ProductStatus.choices)
    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=2000
    )
