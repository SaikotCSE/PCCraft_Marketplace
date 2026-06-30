"""Service layer for the reviews app -- Module 6.

All write paths live here so the views stay thin and the business rules
hardened by the spec (``can_review`` hard-gate, immutable rating,
race-free helpful counter, single-vendor-reply, Redis cache
invalidation, etc.) are testable in isolation.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

from django.core.exceptions import PermissionDenied
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, F, Q
from django.utils import timezone

from django.core.cache import cache as _redis_cache

from apps.accounts.models import VendorProfile
from apps.products.models import Product
from apps.reviews.models import Review, ReviewHelpful, ReviewImage


# ---------------------------------------------------------------------------
# Cache keys / helpers
# ---------------------------------------------------------------------------
# Module 6 doesn't define an explicit cache key in the spec, but the spec
# mentions "Product average_rating" as denormalized data; we expose a
# small helper so the recompute path invalidates the product-detail
# response cache used by ``apps.products.services``.
PRODUCT_DETAIL_CACHE_KEY = "product:detail:slug:%s"
VENDOR_REVIEWS_CACHE_KEY = "vendor:reviews:%s"


def invalidate_product_avg_rating_cache(product_id) -> None:
    """Best-effort cache invalidation for the product-detail payload.

    ``apps.products.services.get_product`` builds the cache key as
    ``product:detail:<pk>`` and the slug variant ``product:detail:slug:<slug>``.
    We blow both away when a review changes, plus the vendor store-front
    aggregate key, so users never see a stale average.
    """
    try:
        product = Product.objects.only("slug").get(pk=product_id)
    except Product.DoesNotExist:
        return
    _redis_cache.delete_many(
        [
            "product:detail:%s" % product.pk,
            PRODUCT_DETAIL_CACHE_KEY % product.slug,
        ]
    )
    _redis_cache.delete(VENDOR_REVIEWS_CACHE_KEY % product.vendor_id)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class ReviewServiceError(Exception):
    """All review-service failures flow through this one exception type.

    ``code`` is a stable machine-readable token so the view layer can map
    it to a specific HTTP status (see ``apps.reviews.views``).
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        fields: dict | None = None,
        status: int = 400,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.status = status


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_REVIEW_IMAGES = 4
"""Spec: ``ReviewImage`` -- max 4 per review."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _has_delivered_item(user, product_id) -> bool:
    """True iff the user has at least one DELIVERED OrderItem for the product.

    Imported lazily so the ``orders`` app stays optional in test setups.
    """
    try:
        from apps.orders.models import OrderItem, OrderItemStatus
    except ImportError:  # pragma: no cover -- orders app missing
        return False
    return OrderItem.objects.filter(
        order__user=user,
        product_id=product_id,
        item_status=OrderItemStatus.DELIVERED,
    ).exists()


def _recompute_product_aggregates(product: Product) -> None:
    """Refresh the denormalised ``average_rating`` and ``review_count``.

    Hidden reviews (``is_hidden=True``) are excluded -- the spec treats
    them as admin-removed and they should not influence the public
    average.  Soft-deleted reviews (``is_active=False``) are excluded via
    the default manager.
    """
    agg = Review.objects.filter(product=product, is_hidden=False).aggregate(
        avg=Avg("rating"),
        cnt=Count("id"),
    )
    new_avg = agg["avg"] or 0
    new_count = agg["cnt"] or 0
    Product.objects.filter(pk=product.pk).update(
        average_rating=new_avg,
        review_count=new_count,
    )
    invalidate_product_avg_rating_cache(product.pk)
    # Also refresh the vendor's denormalised totals (used on storefront cards).
    try:
        vendor = product.vendor
    except VendorProfile.DoesNotExist:  # pragma: no cover -- PROTECT FK
        return
    vendor_agg = Review.objects.filter(
        product__vendor=vendor,
        is_hidden=False,
    ).aggregate(
        avg=Avg("rating"),
        cnt=Count("id"),
    )
    VendorProfile.objects.filter(pk=vendor.pk).update(
        average_rating=vendor_agg["avg"] or 0,
        total_reviews=vendor_agg["cnt"] or 0,
    )


def _apply_ordering(qs, ordering: str | None):
    """Translate the spec's ordering tokens to ORM order_by."""
    mapping = {
        "newest": "-created_at",
        "oldest": "created_at",
        "helpful": "-helpful_count",
        "rating_high": "-rating",
        "rating_low": "rating",
    }
    if not ordering:
        return qs.order_by("-created_at")
    return qs.order_by(mapping.get(ordering, "-created_at"))


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class ReviewService:
    """Stateless helper for review lifecycle operations."""

    # ------------------------------------------------------------------
    # Eligibility / lookup
    # ------------------------------------------------------------------
    @classmethod
    def can_review(cls, user, product: Product) -> tuple[bool, str | None]:
        """HARD GATE per spec: only customers with a DELIVERED OrderItem
        for the product can review.  If they've already reviewed, they
        can't post a second one.
        """
        if user is None or not user.is_authenticated:
            return False, "Authentication required."
        if Review.objects.filter(product=product, user=user).exists():
            return False, "You have already reviewed this product."
        if not _has_delivered_item(user, product.pk):
            return False, "You can only review products you have purchased and received."
        return True, None

    @classmethod
    def get_product_or_404(cls, slug: str) -> Product:
        """Resolve ``slug`` to an active :class:`Product`.

        Used by the public review endpoints, which only operate on
        products that are visible to customers.

        Args:
            slug: URL slug of the product.

        Returns:
            The matching :class:`Product` with ``vendor``, ``brand``
            and ``category`` eagerly loaded.

        Raises:
            ReviewServiceError: ``not_found`` (HTTP 404) when no
                active product has that slug.
        """
        try:
            return (
                Product.objects.select_related("vendor", "brand", "category")
                .get(slug=slug, is_active=True)
            )
        except Product.DoesNotExist:
            raise ReviewServiceError(
                "not_found",
                "Product not found.",
                status=404,
            )

    # ------------------------------------------------------------------
    # Author CRUD
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def create_review(
        cls,
        *,
        user,
        product: Product,
        data: dict[str, Any],
        images: Iterable | None = None,
    ) -> Review:
        """Create a review. Raises ``ReviewServiceError`` on any gate failure."""
        can, reason = cls.can_review(user, product)
        if not can:
            raise ReviewServiceError(
                "not_eligible",
                reason or "Not eligible to review this product.",
                status=403,
            )

        # The duplicate check is double-belt-and-braces: the model has a
        # unique constraint (uniq_review_per_product_user), but checking
        # first lets us return a clean 409 instead of an IntegrityError.
        if Review.objects.filter(product=product, user=user).exists():
            raise ReviewServiceError(
                "duplicate_review",
                "You have already reviewed this product.",
                status=409,
            )

        rating = int(data["rating"])
        if not 1 <= rating <= 5:
            raise ReviewServiceError(
                "validation_error",
                "Rating must be between 1 and 5.",
                fields={"rating": "Out of range."},
                status=400,
            )

        review = Review(
            product=product,
            user=user,
            rating=rating,
            title=data["title"].strip(),
            body=data["body"].strip(),
            is_verified_purchase=_has_delivered_item(user, product.pk),
        )
        try:
            review.save()
        except IntegrityError as exc:
            # Race between the pre-check and save() -- translate to 409.
            raise ReviewServiceError(
                "duplicate_review",
                "You have already reviewed this product.",
                status=409,
            ) from exc

        cls._set_images(review, images)

        # Refresh product aggregates + vendor totals.
        _recompute_product_aggregates(product)
        logger.info(
            "reviews.create ok review_id=%s product_id=%s user_id=%s",
            review.pk, product.pk, user.pk,
        )
        return review

    @classmethod
    @transaction.atomic
    def update_review(
        cls,
        *,
        user,
        review: Review,
        data: dict[str, Any],
        images: Iterable | None = None,
    ) -> Review:
        """Edit the title / body of ``review`` and optionally replace its images.

        Per spec the ``rating`` field is immutable after creation;
        any attempt to change it is rejected. ``images=None`` leaves
        the existing images untouched; an explicit iterable (including
        an empty one) replaces the current set.

        Args:
            user: The viewing user. Must own the review.
            review: The review to mutate.
            data: Mapping optionally containing ``title`` and
                ``body``. ``rating`` may be passed but is ignored
                unless unchanged.
            images: Optional iterable of image uploads. When
                provided, all existing images are deleted and
                ``images`` becomes the new set.

        Returns:
            The persisted :class:`Review`.

        Raises:
            ReviewServiceError: ``forbidden`` (HTTP 403) when the
                user is not the author, ``rating_immutable`` (HTTP
                400) when ``rating`` differs from the stored value.
        """
        if review.user_id != user.pk:
            raise ReviewServiceError(
                "forbidden",
                "You can only edit your own review.",
                status=403,
            )
        # Rating is immutable -- reject any attempt to change it (spec).
        if "rating" in data and int(data["rating"]) != review.rating:
            raise ReviewServiceError(
                "rating_immutable",
                "Rating cannot be changed after submission.",
                fields={"rating": "Immutable."},
                status=400,
            )
        # Body / title are editable.
        if "title" in data:
            review.title = str(data["title"]).strip()
        if "body" in data:
            review.body = str(data["body"]).strip()
        review.save()

        if images is not None:
            # Spec: "images (replace all images -- delete old, create new)"
            review.images.all().delete()
            cls._set_images(review, images)

        # Cache invalidation note: rating didn't change but the new text
        # is what the cache stored.  The cached payload itself only
        # includes the float average so we don't need to refresh.
        logger.info("reviews.update ok review_id=%s", review.pk)
        return review

    @classmethod
    @transaction.atomic
    def delete_review(cls, *, user, review: Review) -> None:
        """Hard-delete ``review`` and refresh its product aggregates.

        Spec calls for a true cascade delete (not soft) so the
        affected :class:`ReviewImage` and :class:`ReviewHelpful`
        rows are removed via FK cascades. Denormalised ratings
        on the product and vendor are recomputed afterwards.

        Args:
            user: The viewing user. Must own the review.
            review: The review to remove.

        Raises:
            ReviewServiceError: ``forbidden`` (HTTP 403) when ``user``
                is not the author of ``review``.
        """
        if review.user_id != user.pk:
            raise ReviewServiceError(
                "forbidden",
                "You can only delete your own review.",
                status=403,
            )
        product = review.product
        # Hard delete per spec -- cascades to ReviewImage + ReviewHelpful.
        review.delete()
        _recompute_product_aggregates(product)
        logger.info("reviews.delete ok review_id=%s", review.pk)

    # ------------------------------------------------------------------
    # Helpful vote (race-free)
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def toggle_helpful(
        cls,
        *,
        user,
        review_id: Any,
    ) -> dict[str, Any]:
        """Toggle the requesting user's "helpful" vote on a review.

        Uses ``select_for_update`` on the Review row so two concurrent
        toggles can't double-increment / double-decrement the counter.
        Idempotent at the row level thanks to the
        ``uniq_review_helpful_per_user`` constraint.
        """
        try:
            review = Review.objects.select_for_update().get(pk=review_id)
        except Review.DoesNotExist:
            raise ReviewServiceError("not_found", "Review not found.", status=404)

        # If a vote already exists, drop it; else create one.
        existing = (
            ReviewHelpful.objects
            .select_for_update()
            .filter(review=review, user=user)
            .first()
        )
        if existing is not None:
            existing.delete()
            Review.objects.filter(pk=review.pk).update(
                helpful_count=F("helpful_count") - 1,
            )
            helpful = False
        else:
            try:
                ReviewHelpful.objects.create(review=review, user=user)
            except IntegrityError as exc:  # pragma: no cover -- race fallback
                raise ReviewServiceError(
                    "conflict",
                    "Helpful vote could not be recorded.",
                    status=409,
                ) from exc
            Review.objects.filter(pk=review.pk).update(
                helpful_count=F("helpful_count") + 1,
            )
            helpful = True

        review.refresh_from_db(fields=["helpful_count"])
        return {"helpful": helpful, "count": review.helpful_count}

    # ------------------------------------------------------------------
    # Vendor reply
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def add_vendor_reply(
        cls,
        *,
        vendor: VendorProfile,
        review_id: Any,
        reply_text: str,
    ) -> Review:
        """Attach or update the vendor's reply on a single review.

        The reply text is bounded between 10 and 1000 characters.
        When the vendor has already replied, the existing text is
        edited in place and ``vendor_reply_edited_at`` is bumped;
        the first reply sets ``vendor_replied_at`` instead.

        Args:
            vendor: The replying vendor. Must own the reviewed product.
            review_id: Primary key of the :class:`Review`.
            reply_text: Free-form reply text (will be stripped).

        Returns:
            The updated :class:`Review`.

        Raises:
            ReviewServiceError: ``not_found`` (HTTP 404) when no
                review matches ``review_id``; ``forbidden`` (HTTP 403)
                when ``vendor`` does not own the reviewed product;
                ``validation_error`` (HTTP 400) when ``reply_text`` is
                shorter than 10 or longer than 1000 characters.
        """
        try:
            review = (
                Review.objects
                .select_for_update()
                .select_related("product", "product__vendor")
                .get(pk=review_id)
            )
        except Review.DoesNotExist:
            raise ReviewServiceError("not_found", "Review not found.", status=404)

        if review.product.vendor_id != vendor.pk:
            raise ReviewServiceError(
                "forbidden",
                "You can only reply to reviews of your own products.",
                status=403,
            )

        text = (reply_text or "").strip()
        if len(text) < 10:
            raise ReviewServiceError(
                "validation_error",
                "Reply must be at least 10 characters.",
                fields={"reply_text": "Too short."},
                status=400,
            )
        if len(text) > 1000:
            raise ReviewServiceError(
                "validation_error",
                "Reply must be at most 1000 characters.",
                fields={"reply_text": "Too long."},
                status=400,
            )

        now = timezone.now()
        if review.vendor_reply:
            # Edit in place.
            review.vendor_reply = text
            review.vendor_reply_edited_at = now
        else:
            # First reply.
            review.vendor_reply = text
            review.vendor_replied_at = now
        review.save(update_fields=[
            "vendor_reply",
            "vendor_replied_at",
            "vendor_reply_edited_at",
            "updated_at",
        ])
        logger.info(
            "reviews.vendor_reply ok review_id=%s vendor_id=%s edited=%s",
            review.pk, vendor.pk, bool(review.vendor_reply_edited_at),
        )
        return review

    # ------------------------------------------------------------------
    # Admin moderation
    # ------------------------------------------------------------------
    @classmethod
    @transaction.atomic
    def hide_review(cls, *, review_id: Any) -> Review:
        """Mark a review as admin-hidden and recompute product aggregates.

        Hidden reviews are excluded from the public average rating
        and review count (see :func:`_recompute_product_aggregates`).

        Args:
            review_id: Primary key of the review.

        Returns:
            The updated :class:`Review` (unchanged if already hidden).

        Raises:
            ReviewServiceError: ``not_found`` (HTTP 404) when no
                review matches ``review_id``.
        """
        try:
            review = Review.objects.select_for_update().get(pk=review_id)
        except Review.DoesNotExist:
            raise ReviewServiceError("not_found", "Review not found.", status=404)
        if not review.is_hidden:
            review.is_hidden = True
            review.save(update_fields=["is_hidden", "updated_at"])
            _recompute_product_aggregates(review.product)
            logger.info("reviews.hide ok review_id=%s", review.pk)
        return review

    @classmethod
    @transaction.atomic
    def restore_review(cls, *, review_id: Any) -> Review:
        """Un-hide a previously hidden review and recompute aggregates.

        Restoring a review re-includes it in the public average and
        review count displayed on the product detail page.

        Args:
            review_id: Primary key of the review.

        Returns:
            The updated :class:`Review` (unchanged if not currently
            hidden).

        Raises:
            ReviewServiceError: ``not_found`` (HTTP 404) when no
                review matches ``review_id``.
        """
        try:
            review = Review.objects.select_for_update().get(pk=review_id)
        except Review.DoesNotExist:
            raise ReviewServiceError("not_found", "Review not found.", status=404)
        if review.is_hidden:
            review.is_hidden = False
            review.save(update_fields=["is_hidden", "updated_at"])
            _recompute_product_aggregates(review.product)
            logger.info("reviews.restore ok review_id=%s", review.pk)
        return review

    @classmethod
    @transaction.atomic
    def remove_vendor_reply(cls, *, review_id: Any) -> Review:
        """Strip the vendor reply (and timestamps) from a review.

        Used by both vendors (when they want to withdraw their reply)
        and admins (moderation). No-op if no reply is currently set.

        Args:
            review_id: Primary key of the review.

        Returns:
            The updated :class:`Review` (unchanged if no reply was
            attached).

        Raises:
            ReviewServiceError: ``not_found`` (HTTP 404) when no
                review matches ``review_id``.
        """
        try:
            review = Review.objects.select_for_update().get(pk=review_id)
        except Review.DoesNotExist:
            raise ReviewServiceError("not_found", "Review not found.", status=404)
        if review.vendor_reply:
            review.vendor_reply = ""
            review.vendor_replied_at = None
            review.vendor_reply_edited_at = None
            review.save(update_fields=[
                "vendor_reply",
                "vendor_replied_at",
                "vendor_reply_edited_at",
                "updated_at",
            ])
            logger.info("reviews.remove_vendor_reply ok review_id=%s", review.pk)
        return review

    # ------------------------------------------------------------------
    # Listings
    # ------------------------------------------------------------------
    @classmethod
    def list_for_product(
        cls,
        *,
        product: Product,
        ordering: str | None = None,
        rating: int | None = None,
    ):
        """Build a queryset of public reviews for ``product``.

        Hidden reviews are excluded so admin-moderated rows stay
        out of the public list.

        Args:
            product: The product whose reviews are listed.
            ordering: Token from the spec (e.g. ``newest``,
                ``helpful``); defaults to ``-created_at``.
            rating: Optional star-rating filter (1-5).

        Returns:
            An ordered, filtered queryset of :class:`Review` rows
            with ``user`` and ``images`` preloaded.
        """
        qs = (
            Review.objects
            .filter(product=product, is_hidden=False)
            .select_related("user")
            .prefetch_related("images")
        )
        if rating is not None:
            qs = qs.filter(rating=rating)
        return _apply_ordering(qs, ordering)

    @classmethod
    def list_for_vendor(
        cls,
        *,
        vendor: VendorProfile,
        ordering: str | None = None,
        rating: int | None = None,
        replied: bool | None = None,
    ):
        """Build a queryset of reviews for products owned by ``vendor``.

        Includes both hidden and visible rows; vendor dashboards need
        to see moderation state. The optional ``replied`` filter
        narrows the list to reviews with or without a vendor reply.

        Args:
            vendor: Vendor whose reviews are listed.
            ordering: Token from the spec; defaults to ``-created_at``.
            rating: Optional star-rating filter.
            replied: ``True`` for reviews with a vendor reply,
                ``False`` for those without, ``None`` for both.

        Returns:
            An ordered, filtered queryset of :class:`Review` rows
            with ``user`` and ``product`` eagerly loaded.
        """
        qs = (
            Review.objects
            .filter(product__vendor=vendor)
            .select_related("user", "product")
            .prefetch_related("images")
        )
        if rating is not None:
            qs = qs.filter(rating=rating)
        if replied is True:
            qs = qs.exclude(Q(vendor_reply="") | Q(vendor_reply=None))
        elif replied is False:
            qs = qs.filter(Q(vendor_reply="") | Q(vendor_reply=None))
        return _apply_ordering(qs, ordering)

    @classmethod
    def list_for_admin(
        cls,
        *,
        ordering: str | None = None,
        is_hidden: bool | None = None,
        rating: int | None = None,
        product_id: Any | None = None,
        vendor_id: Any | None = None,
        search: str | None = None,
    ):
        """Build an admin-facing queryset with rich filtering.

        Includes hidden and visible rows so moderation UI can pivot
        by status. ``search`` matches the review title / body /
        author name / email / product name so moderators can pivot
        by user quickly.

        Args:
            ordering: Token from the spec; defaults to ``-created_at``.
            is_hidden: When set, filters to hidden or visible rows.
            rating: Optional star-rating filter.
            product_id: Optional product primary key.
            vendor_id: Optional vendor primary key.
            search: Free-text filter applied with ``icontains``.

        Returns:
            An ordered, filtered queryset of :class:`Review` rows
            with related ``user``, ``product`` and ``vendor``
            eagerly loaded.
        """
        qs = (
            Review.objects
            .filter()
            .select_related("user", "product", "product__vendor")
            .prefetch_related("images")
        )
        if is_hidden is not None:
            qs = qs.filter(is_hidden=is_hidden)
        if rating is not None:
            qs = qs.filter(rating=rating)
        if product_id:
            qs = qs.filter(product_id=product_id)
        if vendor_id:
            qs = qs.filter(product__vendor_id=vendor_id)
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(body__icontains=search)
                | Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(product__name__icontains=search)
            )
        return _apply_ordering(qs, ordering)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    @classmethod
    def _set_images(cls, review: Review, images: Iterable | None) -> list[ReviewImage]:
        """Replace-or-create the gallery for a review.

        Skips falsy entries so the validator can pass optional
        attachments through untouched, enforces ``MAX_REVIEW_IMAGES``,
        and creates ``ReviewImage`` rows in the order provided.

        Args:
            review: Parent ``Review`` instance.
            images: Optional iterable of upload-file objects.

        Returns:
            List of newly created ``ReviewImage`` rows (empty if
            ``images`` was falsy).

        Raises:
            ReviewServiceError: ``"too_many_images"`` when the
                resulting count would exceed ``MAX_REVIEW_IMAGES``.
        """
        if not images:
            return []
        files = [f for f in images if f]
        if len(files) > MAX_REVIEW_IMAGES:
            raise ReviewServiceError(
                "too_many_images",
                "A review can have at most %d images." % MAX_REVIEW_IMAGES,
                fields={"images": "Limit reached."},
                status=400,
            )
        created: list[ReviewImage] = []
        for f in files:
            created.append(ReviewImage.objects.create(review=review, image=f))
        return created
