"""Serializers for the reviews app -- Module 6.

Per spec (``MODULE 6 -- Reviews & Ratings``), every field exposed below
matches the contract exactly.  Validation rules:

* ``rating`` -- int 1..5, immutable once set (service-layer enforced).
* ``title``  -- required, 3..200 chars.
* ``body``   -- required, 10..2000 chars.
* ``images`` -- at most 4 files per review (service-layer enforced).
"""
from __future__ import annotations

from rest_framework import serializers

from apps.accounts.serializers import UserInlineSerializer
from apps.products.serializers import ProductInlineSerializer
from apps.reviews.models import Review, ReviewHelpful, ReviewImage


# ---------------------------------------------------------------------------
# Read shape
# ---------------------------------------------------------------------------
class ReviewImageSerializer(serializers.ModelSerializer):
    """Read shape for a single review image.  Returns an absolute URL."""

    image = serializers.SerializerMethodField()

    class Meta:
        model = ReviewImage
        fields = ("id", "image")
        read_only_fields = fields

    def get_image(self, obj: ReviewImage):
        if not obj.image:
            return None
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class ReviewListSerializer(serializers.ModelSerializer):
    """Public listing / detail shape."""

    user = serializers.SerializerMethodField()
    images = ReviewImageSerializer(many=True, read_only=True)
    # Spec token: ``is_helpful_by_me`` -- true iff the requesting user
    # has voted this review as helpful.
    is_helpful_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = (
            "id",
            "user",
            "rating",
            "title",
            "body",
            "is_verified_purchase",
            "helpful_count",
            "images",
            "vendor_reply",
            "vendor_replied_at",
            "vendor_reply_edited_at",
            "created_at",
            "updated_at",
            "is_helpful_by_me",
        )
        read_only_fields = fields

    def get_user(self, obj: Review):
        # Drop the user's email unless the requester is the author or an admin.
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_owner = bool(user and user.is_authenticated and obj.user_id == user.pk)
        is_admin = bool(user and user.is_authenticated and getattr(user, "is_staff", False))
        if is_owner or is_admin:
            return UserInlineSerializer(obj.user, context=self.context).data
        # Minimal public profile.
        return {
            "id": str(obj.user_id),
            "full_name": getattr(obj.user, "full_name", None) or "Anonymous",
            "avatar": _safe_avatar_url(obj.user, request),
        }

    def get_is_helpful_by_me(self, obj: Review) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return ReviewHelpful.objects.filter(review=obj, user=user).exists()


class ReviewDetailSerializer(ReviewListSerializer):
    """Detail shape is identical to the list shape (kept for clarity)."""

    product = ProductInlineSerializer(read_only=True)

    class Meta(ReviewListSerializer.Meta):
        fields = ReviewListSerializer.Meta.fields + ("product",)


class AdminReviewListSerializer(ReviewListSerializer):
    """Admin moderation listing shape.

    Adds the moderation flag (``is_hidden``) and the product reference
    so the admin table can render its columns without a second round
    trip. ``is_hidden`` is the chip that decides row styling.
    """

    product = ProductInlineSerializer(read_only=True)
    # ``vendor`` is denormalised into the row so the admin filter (text
    # search by vendor store name) and the "Reviewed product of store X"
    # badge don't need an extra lookup. The select_related on the
    # service queryset guarantees the join is free.
    vendor = serializers.SerializerMethodField()
    helpful_count = serializers.IntegerField(read_only=True)

    class Meta(ReviewListSerializer.Meta):
        fields = ReviewListSerializer.Meta.fields + (
            "product",
            "is_hidden",
            "vendor",
        )
        read_only_fields = fields

    def get_vendor(self, obj: Review):
        product = getattr(obj, "product", None)
        if product is None:
            return None
        vendor = getattr(product, "vendor", None)
        if vendor is None:
            return None
        return {
            "id": str(vendor.pk),
            "store_name": getattr(vendor, "store_name", None) or "",
            "store_slug": getattr(vendor, "store_slug", None) or "",
        }


class _InlineUser(serializers.Serializer):
    """Tiny admin-list row shape for the ``reviewer`` column."""

    id = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.EmailField()
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        return _safe_avatar_url(obj, self.context.get("request"))


# ---------------------------------------------------------------------------
# Write shapes
# ---------------------------------------------------------------------------
class ReviewCreateSerializer(serializers.Serializer):
    """Body shape for POST /api/v1/products/{slug}/reviews/."""

    rating = serializers.IntegerField(min_value=1, max_value=5)
    # Spec: title min 5 chars, body min 30 chars.
    title = serializers.CharField(min_length=5, max_length=200, trim_whitespace=True)
    body = serializers.CharField(min_length=30, max_length=2000, trim_whitespace=True)


class ReviewUpdateSerializer(serializers.Serializer):
    """Body shape for PATCH /api/v1/reviews/{id}/.

    Rating is omitted on purpose -- the spec makes it immutable after
    submission; the service layer rejects attempts to change it.
    """

    title = serializers.CharField(
        min_length=5, max_length=200, trim_whitespace=True, required=False
    )
    body = serializers.CharField(
        min_length=30, max_length=2000, trim_whitespace=True, required=False
    )


class VendorReplySerializer(serializers.Serializer):
    """Body shape for POST /api/v1/vendor/reviews/{id}/reply/."""

    reply_text = serializers.CharField(
        min_length=10, max_length=1000, trim_whitespace=True
    )


class ReviewModerationSerializer(serializers.Serializer):
    """Body shape for ``PATCH /api/v1/admin/reviews/{id}/moderate/``.

    Spec: ``{is_hidden: true|false}`` -- a single endpoint that toggles
    the admin moderation flag.
    """

    is_hidden = serializers.BooleanField(required=True)


class AdminReviewActionSerializer(serializers.Serializer):
    """Legacy body shape retained for any tooling still calling the
    POST ``/admin/reviews/{id}/hide/`` and ``/restore/`` shortcuts.  New
    callers should prefer ``ReviewModerationSerializer`` via the
    ``/moderate/`` endpoint."""

    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=500, default=""
    )


# ---------------------------------------------------------------------------
# Listing / aggregate shapes
# ---------------------------------------------------------------------------
class ReviewRatingBreakdownSerializer(serializers.Serializer):
    """Public histogram for a product's reviews."""

    product_id = serializers.CharField()
    total = serializers.IntegerField()
    average = serializers.FloatField()
    breakdown = serializers.DictField(child=serializers.IntegerField())


class CanReviewResponseSerializer(serializers.Serializer):
    """Response shape for /products/{slug}/can-review/."""

    can_review = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True, required=False)


class HelpfulToggleResponseSerializer(serializers.Serializer):
    helpful = serializers.BooleanField()
    count = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _safe_avatar_url(user, request):
    avatar = getattr(user, "avatar", None)
    if not avatar:
        return None
    try:
        url = avatar.url
    except ValueError:
        return None
    return request.build_absolute_uri(url) if request else url
