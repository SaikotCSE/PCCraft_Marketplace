"""Views for the reviews app -- Module 6.

Endpoint summary (mounted under ``/api/v1/``):

Customer-facing (public + auth):
* ``GET    /products/{slug}/reviews/``           -- public list, hidden
  reviews excluded.
* ``POST   /products/{slug}/reviews/``           -- auth, create.
* ``GET    /products/{slug}/rating-breakdown/``  -- public histogram.
* ``GET    /products/{slug}/can-review/``        -- auth, gate check (legacy).
* ``GET    /reviews/{id}/``                      -- public/owner/admin.
* ``PATCH  /reviews/{id}/``                      -- author or admin.
* ``DELETE /reviews/{id}/``                      -- author or admin.
* ``POST   /reviews/{id}/helpful/``              -- auth, toggle.
* ``GET    /reviews/can-review/?product={slug}`` -- auth, gate check
  (spec endpoint -- used by ``WriteReviewModal``).

Vendor:
* ``GET    /vendor/reviews/``                    -- vendor's products' reviews.
* ``POST   /vendor/reviews/{id}/reply/``         -- add / edit reply.
* ``DELETE /vendor/reviews/{id}/reply/``         -- remove own reply.

Admin:
* ``GET    /admin/reviews/``                     -- list all (filterable).
* ``PATCH  /admin/reviews/{id}/moderate/``       -- spec single endpoint,
  body ``{is_hidden: bool}``.
* ``POST   /admin/reviews/{id}/hide/``           -- legacy shortcut.
* ``POST   /admin/reviews/{id}/restore/``        -- legacy shortcut.
* ``DELETE /admin/reviews/{id}/reply/``          -- remove vendor reply.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db.models import Avg, Count, Q
from rest_framework import status as drf_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models import VendorProfile
from apps.common.permissions import IsApprovedVendor, IsCustomer
from apps.common.response import api_response
from apps.reviews.models import Review
from apps.reviews.serializers import (
    AdminReviewListSerializer,
    CanReviewResponseSerializer,
    HelpfulToggleResponseSerializer,
    ReviewCreateSerializer,
    ReviewDetailSerializer,
    ReviewListSerializer,
    ReviewModerationSerializer,
    ReviewUpdateSerializer,
    VendorReplySerializer,
)
from apps.reviews.services import ReviewService, ReviewServiceError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_error_response(exc: ReviewServiceError) -> Response:
    """Translate a :class:`ReviewServiceError` into our envelope.

    Keeps the envelope shape (``success``/``data``/``meta``/``error``)
    consistent with the rest of the API. Field-level validation errors
    are surfaced under ``error.fields``.
    """
    return api_response(
        status=exc.status,
        error={
            "code": exc.code,
            "message": exc.message,
            "fields": exc.fields or {},
        },
    )


# ---------------------------------------------------------------------------
# Public product-scoped endpoints
# ---------------------------------------------------------------------------
class ProductReviewViewSet(viewsets.GenericViewSet):
    """``/api/v1/products/{slug}/reviews/`` family.

    GenericViewSet (not ModelViewSet) because the resource is nested
    under product -- we don't want a top-level list view here.
    """

    permission_classes = (AllowAny,)
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    serializer_class = ReviewListSerializer
    lookup_field = "slug"

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _get_product(self) -> Any:
        slug = self.kwargs.get(self.lookup_field or "slug")
        return ReviewService.get_product_or_404(slug)

    # ------------------------------------------------------------------
    # LIST
    # ------------------------------------------------------------------
    def list(self, request: Request, *args, **kwargs) -> Response:
        product = self._get_product()
        ordering = request.query_params.get("ordering")
        rating_raw = request.query_params.get("rating")
        try:
            rating = int(rating_raw) if rating_raw else None
        except (TypeError, ValueError):
            rating = None
        qs = ReviewService.list_for_product(
            product=product, ordering=ordering, rating=rating
        )
        page_qs = self.paginate_queryset(qs)
        if page_qs is not None:
            data = ReviewListSerializer(
                page_qs, many=True, context=self.get_serializer_context()
            ).data
            return self.get_paginated_response(data)
        data = ReviewListSerializer(
            qs, many=True, context=self.get_serializer_context()
        ).data
        return api_response(data=data, message="Reviews fetched.")

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------
    def create(self, request: Request, *args, **kwargs) -> Response:
        if not request.user or not request.user.is_authenticated:
            raise PermissionDenied("Authentication required.")
        product = self._get_product()

        # Body fields can come in as JSON, multipart, or form-data.
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        # Spec: images (multipart) -- separate from the JSON body.
        images = request.FILES.getlist("images") if request.FILES else []

        try:
            review = ReviewService.create_review(
                user=request.user, product=product, data=data, images=images
            )
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            status=drf_status.HTTP_201_CREATED,
            message="Review submitted.",
        )

    # ------------------------------------------------------------------
    # Custom actions
    # ------------------------------------------------------------------
    @action(detail=False, methods=("get",), url_path="can-review")
    def can_review(self, request: Request, *args, **kwargs) -> Response:
        product = self._get_product()
        ok, reason = ReviewService.can_review(request.user, product)
        payload = {"can_review": ok, "reason": reason}
        serializer = CanReviewResponseSerializer(payload)
        return api_response(data=serializer.data)

    @action(detail=False, methods=("get",), url_path="rating-breakdown")
    def rating_breakdown(self, request: Request, *args, **kwargs) -> Response:
        product = self._get_product()
        counts = (
            Review.objects.filter(product=product, is_hidden=False)
            .values("rating")
            .annotate(n=Count("id"))
        )
        by_rating = {r["rating"]: r["n"] for r in counts}
        breakdown = {str(r): by_rating.get(r, 0) for r in (1, 2, 3, 4, 5)}
        total = sum(breakdown.values())
        avg = (
            Review.objects.filter(product=product, is_hidden=False)
            .aggregate(a=Avg("rating"))["a"]
            or 0
        )
        payload = {
            "product_id": str(product.pk),
            "total": total,
            "average": round(float(avg), 2),
            "breakdown": breakdown,
        }
        return api_response(data=payload)


# ---------------------------------------------------------------------------
# Author CRUD + helpful toggle on individual reviews
# ---------------------------------------------------------------------------
class ReviewViewSet(viewsets.GenericViewSet):
    """``/api/v1/reviews/{id}/`` family."""

    permission_classes = (AllowAny,)
    serializer_class = ReviewListSerializer
    lookup_field = "pk"

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy", "create", "helpful"):
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        return Review.objects.select_related("user", "product").prefetch_related(
            "images", "helpful_votes"
        )

    def _get_review_or_404(self) -> Review:
        try:
            return self.get_queryset().get(pk=self.kwargs[self.lookup_field or "pk"])
        except Review.DoesNotExist:
            raise PermissionDenied("Review not found.")

    # ------------------------------------------------------------------
    # RETRIEVE
    # ------------------------------------------------------------------
    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        review = self._get_review_or_404()
        user = request.user
        is_owner = bool(user and user.is_authenticated and review.user_id == user.pk)
        is_admin = bool(user and getattr(user, "is_staff", False))
        if review.is_hidden and not (is_owner or is_admin):
            raise PermissionDenied("Review not found.")
        data = ReviewListSerializer(
            review, context=self.get_serializer_context()
        ).data
        return api_response(data=data)

    # ------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------
    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        review = self._get_review_or_404()
        user = request.user
        if not user or not user.is_authenticated:
            raise PermissionDenied("Authentication required.")
        is_owner = review.user_id == user.pk
        is_admin = getattr(user, "is_staff", False)
        if not (is_owner or is_admin):
            raise PermissionDenied("You can only edit your own review.")
        serializer = ReviewUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        images = request.FILES.getlist("images") if request.FILES else None
        try:
            review = ReviewService.update_review(
                user=user, review=review, data=data, images=images
            )
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Review updated.",
        )

    def update(self, *args, **kwargs):
        return self.partial_update(*args, **kwargs)

    # ------------------------------------------------------------------
    # DESTROY
    # ------------------------------------------------------------------
    def destroy(self, request: Request, *args, **kwargs) -> Response:
        review = self._get_review_or_404()
        user = request.user
        if not user or not user.is_authenticated:
            raise PermissionDenied("Authentication required.")
        is_owner = review.user_id == user.pk
        is_admin = getattr(user, "is_staff", False)
        if not (is_owner or is_admin):
            raise PermissionDenied("You can only delete your own review.")
        try:
            ReviewService.delete_review(user=user, review=review)
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(message="Review deleted.", status=drf_status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # HELPFUL
    # ------------------------------------------------------------------
    @action(detail=True, methods=("post",), url_path="helpful")
    def helpful(self, request: Request, *args, **kwargs) -> Response:
        review = self._get_review_or_404()
        try:
            result = ReviewService.toggle_helpful(
                user=request.user, review_id=review.pk
            )
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(data=result)

    # ------------------------------------------------------------------
    # CAN-REVIEW (spec: ``GET /api/v1/reviews/can-review/?product=<slug>``)
    # ------------------------------------------------------------------
    @action(
        detail=False,
        methods=("get",),
        url_path="can-review",
        permission_classes=(IsAuthenticated, IsCustomer),
    )
    def can_review(self, request: Request, *args, **kwargs) -> Response:
        """Return ``{can_review: bool, reason: str|null}``.

        The product is identified by the ``product`` query parameter
        (slug).  ``IsCustomer`` enforces the customer-only role check;
        non-customers receive 403 before the eligibility logic runs.
        """
        slug = request.query_params.get("product")
        if not slug:
            return _to_error_response(
                ReviewServiceError(
                    "validation_error",
                    "Missing required query parameter: product.",
                    fields={"product": "Required."},
                    status=400,
                )
            )
        product = ReviewService.get_product_or_404(slug)
        ok, reason = ReviewService.can_review(request.user, product)
        payload = {"can_review": ok, "reason": reason}
        return api_response(data=CanReviewResponseSerializer(payload).data)


# ---------------------------------------------------------------------------
# Vendor: list, reply, remove reply
# ---------------------------------------------------------------------------
def _resolve_vendor(request: Request) -> VendorProfile:
    try:
        return VendorProfile.objects.get(user=request.user, is_active=True)
    except VendorProfile.DoesNotExist:
        raise PermissionDenied("Vendor profile not found.")


class VendorReviewViewSet(viewsets.GenericViewSet):
    """``/api/v1/vendor/reviews/`` family."""

    permission_classes = (IsAuthenticated, IsApprovedVendor)
    serializer_class = ReviewListSerializer
    parser_classes = (JSONParser, FormParser)

    def get_queryset(self):
        vendor = _resolve_vendor(self.request)
        return ReviewService.list_for_vendor(vendor=vendor)

    def list(self, request: Request, *args, **kwargs) -> Response:
        vendor = _resolve_vendor(request)
        ordering = request.query_params.get("ordering")
        rating_raw = request.query_params.get("rating")
        replied_raw = request.query_params.get("replied")
        try:
            rating = int(rating_raw) if rating_raw else None
        except (TypeError, ValueError):
            rating = None
        replied: bool | None = None
        if replied_raw in ("true", "1", "yes"):
            replied = True
        elif replied_raw in ("false", "0", "no"):
            replied = False
        qs = ReviewService.list_for_vendor(
            vendor=vendor, ordering=ordering, rating=rating, replied=replied
        )
        page_qs = self.paginate_queryset(qs)
        if page_qs is not None:
            data = ReviewListSerializer(
                page_qs, many=True, context=self.get_serializer_context()
            ).data
            return self.get_paginated_response(data)
        return api_response(
            data=ReviewListSerializer(
                qs, many=True, context=self.get_serializer_context()
            ).data,
        )

    @action(detail=True, methods=("post",), url_path="reply")
    def reply(self, request: Request, *args, **kwargs) -> Response:
        vendor = _resolve_vendor(request)
        serializer = VendorReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            review = ReviewService.add_vendor_reply(
                vendor=vendor,
                review_id=kwargs.get(self.lookup_field or "pk"),
                reply_text=serializer.validated_data["reply_text"],
            )
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Reply saved.",
        )

    @action(
        detail=True,
        methods=("delete",),
        url_path="reply",
    )
    def remove_reply(self, request: Request, *args, **kwargs) -> Response:
        vendor = _resolve_vendor(request)
        # Authorise: vendor must own the review.
        try:
            review = Review.objects.select_related("product", "product__vendor").get(
                pk=kwargs.get(self.lookup_field or "pk")
            )
        except Review.DoesNotExist:
            return _to_error_response(
                ReviewServiceError("not_found", "Review not found.", status=404)
            )
        if review.product.vendor_id != vendor.pk:
            raise PermissionDenied("You can only remove replies from your own products.")
        try:
            review = ReviewService.remove_vendor_reply(review_id=review.pk)
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Reply removed.",
        )


# ---------------------------------------------------------------------------
# Admin moderation
# ---------------------------------------------------------------------------
class AdminReviewViewSet(viewsets.GenericViewSet):
    """``/api/v1/admin/reviews/`` family."""

    permission_classes = (IsAuthenticated, IsAdminUser)
    serializer_class = AdminReviewListSerializer
    parser_classes = (JSONParser, FormParser)

    def get_queryset(self):
        return Review.objects.select_related("user", "product", "product__vendor")

    def list(self, request: Request, *args, **kwargs) -> Response:
        ordering = request.query_params.get("ordering")
        rating_raw = request.query_params.get("rating")
        is_hidden_raw = request.query_params.get("is_hidden")
        product_id = request.query_params.get("product_id")
        vendor_id = request.query_params.get("vendor_id")
        search = request.query_params.get("search")
        try:
            rating = int(rating_raw) if rating_raw else None
        except (TypeError, ValueError):
            rating = None
        is_hidden: bool | None = None
        if is_hidden_raw in ("true", "1"):
            is_hidden = True
        elif is_hidden_raw in ("false", "0"):
            is_hidden = False
        qs = ReviewService.list_for_admin(
            ordering=ordering,
            is_hidden=is_hidden,
            rating=rating,
            product_id=product_id,
            vendor_id=vendor_id,
            search=search,
        )
        page_qs = self.paginate_queryset(qs)
        if page_qs is not None:
            data = AdminReviewListSerializer(
                page_qs, many=True, context=self.get_serializer_context()
            ).data
            return self.get_paginated_response(data)
        return api_response(
            data=AdminReviewListSerializer(
                qs, many=True, context=self.get_serializer_context()
            ).data,
        )

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        try:
            review = self.get_queryset().get(pk=kwargs.get("pk"))
        except Review.DoesNotExist:
            return _to_error_response(
                ReviewServiceError("not_found", "Review not found.", status=404)
            )
        return api_response(
            data=ReviewDetailSerializer(
                review, context=self.get_serializer_context()
            ).data
        )

    # -- moderation actions --------------------------------------------
    @action(
        detail=True,
        methods=("patch",),
        url_path="moderate",
    )
    def moderate(self, request: Request, *args, **kwargs) -> Response:
        """Spec: ``PATCH /admin/reviews/{id}/moderate/`` body ``{is_hidden}``.

        Single endpoint that toggles ``is_hidden`` to the requested
        value.  Re-aggregates the product average after every change.
        """
        serializer = ReviewModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_hidden = serializer.validated_data["is_hidden"]
        try:
            if is_hidden:
                review = ReviewService.hide_review(review_id=kwargs.get("pk"))
            else:
                review = ReviewService.restore_review(review_id=kwargs.get("pk"))
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=AdminReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message=("Review hidden." if is_hidden else "Review restored."),
        )

    @action(detail=True, methods=("patch",), url_path="hide")
    def hide(self, request: Request, *args, **kwargs) -> Response:
        try:
            review = ReviewService.hide_review(
                review_id=kwargs.get("pk"),
            )
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Review hidden.",
        )

    @action(detail=True, methods=("patch",), url_path="restore")
    def restore(self, request: Request, *args, **kwargs) -> Response:
        try:
            review = ReviewService.restore_review(review_id=kwargs.get("pk"))
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Review restored.",
        )

    @action(detail=True, methods=("delete",), url_path="reply")
    def remove_vendor_reply(self, request: Request, *args, **kwargs) -> Response:
        try:
            review = ReviewService.remove_vendor_reply(review_id=kwargs.get("pk"))
        except ReviewServiceError as exc:
            return _to_error_response(exc)
        return api_response(
            data=ReviewListSerializer(
                review, context=self.get_serializer_context()
            ).data,
            message="Vendor reply removed.",
        )
