"""Viewsets / APIViews for the products app.

Endpoint summary:

* Public catalog (mounted under ``/api/v1/products/``):
    - ``GET    /``              list, with filters (see :mod:`filters`).
    - ``GET    /{slug}/``       product detail.
    - ``GET    /trending/``     top sellers in the last 30 days (fallback to
      ``total_sold`` when no orders exist yet).
    - ``GET    /search/``       lightweight search — kept for parity with
      the front-end's ``productService.search`` stub.

* Vendor catalog (mounted under ``/api/v1/vendor/products/``):
    - ``GET    /``              list the requesting vendor's products.
    - ``POST   /``              create a product (with optional images).
    - ``GET    /{slug}/``       vendor-only detail (also exposes drafts).
    - ``PATCH  /{slug}/``       update.
    - ``DELETE /{slug}/``       soft delete.
    - ``POST   /{slug}/images/``           append images.
    - ``DELETE /{slug}/images/{id}/``      remove an image.
    - ``POST   /{slug}/images/reorder/``   bulk reorder, payload ``{ids: [...]}``.
    - ``PATCH  /{slug}/images/{id}/set-primary/``.
"""
from __future__ import annotations

import logging

from django.db.models import F, Q, Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin, IsApprovedVendor
from apps.common.response import api_response
from apps.products.filters import ProductFilter
from apps.products.models import Product, ProductStatus
from apps.products.serializers import (
    AdminProductListSerializer,
    AdminProductModerateSerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    ProductUpdateSerializer,
    ProductWriteSerializer,
)
from apps.products.services import (
    AdminProductService,
    AdminProductServiceError,
    ProductService,
    ProductServiceError,
)

logger = logging.getLogger(__name__)


# ====================================================================
# Public catalog
# ====================================================================
class PublicProductListView(viewsets.ReadOnlyModelViewSet):
    """``GET /api/v1/products/`` and ``GET /api/v1/products/{slug}/``."""

    serializer_class = ProductListSerializer
    permission_classes = (AllowAny,)
    lookup_field = "slug"
    filterset_class = ProductFilter

    def get_queryset(self):
        qs = (
            Product.objects.select_related("brand", "category", "vendor")
            .filter(is_active=True, status=ProductStatus.ACTIVE)
        )
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProductDetailSerializer
        return super().get_serializer_class()

    @action(detail=False, methods=("get",), url_path="trending")
    def trending(self, request: Request) -> Response:
        """Top sellers in the last 30 days, capped to 12.

        Falls back to ``-total_sold`` when no order data is available
        yet (the orders app is built in Module 4).
        """
        # Import defensively — orders app may not yet have OrderItem.
        try:
            from apps.orders.models import OrderItem
        except ImportError:
            OrderItem = None

        ids: list = []
        if OrderItem is not None:
            thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
            try:
                recent = (
                    OrderItem.objects.filter(
                        order__is_active=True,
                        order__created_at__gte=thirty_days_ago,
                        is_active=True,
                    )
                    .values("product_id")
                    .annotate(units=Sum("quantity"))
                    .order_by("-units")[:12]
                )
                ids = [r["product_id"] for r in recent]
            except Exception:  # pragma: no cover - defensive
                ids = []

        if not ids:
            qs = self.get_queryset().order_by("-total_sold", "-created_at")[:12]
        else:
            qs = self.get_queryset().filter(pk__in=ids).order_by(F("total_sold").desc())
        data = ProductListSerializer(qs, many=True, context={"request": request}).data
        return api_response(data=data, status=status.HTTP_200_OK)

    @action(detail=False, methods=("get",), url_path="search")
    def search(self, request: Request) -> Response:
        """Lightweight search — delegates to the queryset filter."""
        term = request.query_params.get("q", "").strip()
        qs = self.get_queryset()
        if term:
            qs = qs.filter(
                Q(name__icontains=term)
                | Q(short_description__icontains=term)
                | Q(sku__icontains=term)
            )
        page = self.paginate_queryset(qs)
        if page is not None:
            data = ProductListSerializer(
                page, many=True, context={"request": request},
            ).data
            return self.get_paginated_response(data)
        data = ProductListSerializer(qs, many=True, context={"request": request}).data
        return api_response(data=data, status=status.HTTP_200_OK)

    @action(detail=True, methods=("post",), url_path="track-view")
    def track_view(self, request: Request, slug: str | None = None) -> Response:
        """Record a product-view event for the recommendations engine.

        Spec §7.3: ``POST /api/v1/products/{slug}/track-view/``. Accepts
        anonymous viewers -- the frontend supplies an ``X-Session-Key``
        header for session attribution when the user is not logged in.
        """
        from apps.recommendations.views import track_view_for_product

        return track_view_for_product(
            request,
            slug=slug or self.kwargs.get("slug", ""),
            session_key=request.headers.get("X-Session-Key", ""),
            ip_address=request.META.get("REMOTE_ADDR", "") or "",
        )


# ====================================================================
# Vendor catalog
# ====================================================================
class VendorProductViewSet(viewsets.ModelViewSet):
    """``/api/v1/vendor/products/`` -- scoped to the requesting vendor."""

    permission_classes = (IsApprovedVendor,)
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    lookup_field = "slug"
    http_method_names = ("get", "post", "patch", "delete", "head", "options")

    def get_serializer_class(self):
        if self.action in ("partial_update", "update"):
            return ProductUpdateSerializer
        return ProductWriteSerializer

    def get_queryset(self):
        from apps.accounts.models import VendorProfile
        vendor = VendorProfile.objects.filter(user=self.request.user).first()
        if vendor is None:
            return Product.objects.none()
        return (
            Product.objects.select_related("brand", "category", "vendor")
            .filter(vendor=vendor)
        )

    def list(self, request: Request, *args, **kwargs) -> Response:
        qs = self.get_queryset().order_by("-created_at")
        page = self.paginate_queryset(qs)
        if page is not None:
            data = ProductDetailSerializer(
                page, many=True, context={"request": request},
            ).data
            return self.get_paginated_response(data)
        data = ProductDetailSerializer(qs, many=True, context={"request": request}).data
        return api_response(data=data, status=status.HTTP_200_OK)

    def retrieve(self, request, *args, **kwargs) -> Response:
        product = self.get_object()
        return api_response(
            data=ProductDetailSerializer(product, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def create(self, request: Request, *args, **kwargs) -> Response:
        return self._write(request)

    def partial_update(self, request: Request, *args, **kwargs) -> Response:
        return self._write(request, instance=self.get_object(), partial=True)

    def update(self, request: Request, *args, **kwargs) -> Response:  # noqa: D401
        return self._write(request, instance=self.get_object(), partial=False)

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        ProductService.soft_delete(product)
        logger.info("products.soft_delete ok product_id=%s", product.pk)
        return api_response(
            data={"message": "Product deleted.", "id": str(product.id)},
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Image actions
    # ------------------------------------------------------------------
    @action(detail=True, methods=("post",), url_path="images")
    def add_images(self, request: Request, slug: str) -> Response:
        product = self.get_object()
        files = request.FILES.getlist("images") or request.FILES.getlist("image")
        if not files:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "no_images",
                    "message": "Provide at least one file via the 'images' field.",
                },
            )
        try:
            created = ProductService.add_images(product, files)
        except ProductServiceError as exc:
            return self._error(exc)
        from apps.products.serializers import ProductImageSerializer
        return api_response(
            data=ProductImageSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=("post",),
        url_path="images/reorder",
    )
    def reorder_images(self, request: Request, slug: str) -> Response:
        product = self.get_object()
        ordered_ids = request.data.get("ids") or request.data.get("ordered_ids")
        if not isinstance(ordered_ids, list) or not ordered_ids:
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "Payload must be a non-empty 'ids' list.",
                },
            )
        try:
            ProductService.reorder_images(product, ordered_ids)
        except ProductServiceError as exc:
            return self._error(exc)
        return api_response(
            data={"message": "Reordered."}, status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=("delete",), url_path=r"images/by-id/(?P<image_id>[^/.]+)")
    def delete_image(self, request: Request, slug: str, image_id: str) -> Response:
        product = self.get_object()
        try:
            ProductService.delete_image(product, image_id)
        except ProductServiceError as exc:
            return self._error(exc)
        return api_response(data={"message": "Image removed."}, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=("patch",),
        url_path=r"images/(?P<image_id>[^/.]+)/set-primary",
    )
    def set_primary_image(self, request: Request, slug: str, image_id: str) -> Response:
        product = self.get_object()
        try:
            ProductService.set_primary_image(product, image_id)
        except ProductServiceError as exc:
            return self._error(exc)
        return api_response(data={"message": "Primary image updated."}, status=status.HTTP_200_OK)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _write(
        self,
        request: Request,
        *,
        instance: Product | None = None,
        partial: bool = False,
    ) -> Response:
        from apps.accounts.models import VendorProfile
        try:
            vendor = VendorProfile.objects.get(user=request.user)
        except VendorProfile.DoesNotExist:
            raise PermissionDenied("Vendor profile required.")

        serializer_class = (
            ProductUpdateSerializer if (instance and partial)
            else ProductWriteSerializer
        )
        serializer = serializer_class(
            data=request.data,
            instance=instance,
            partial=partial,
        )
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )
        data = dict(serializer.validated_data)

        try:
            if instance is None:
                product = ProductService.create(
                    vendor=vendor,
                    category=data.pop("category"),
                    brand=data.pop("brand"),
                    data=data,
                )
            else:
                product = ProductService.update(
                    instance,
                    category=data.get("category"),
                    brand=data.get("brand"),
                    data=data,
                )
        except ProductServiceError as exc:
            return self._error(exc)

        return api_response(
            data=ProductDetailSerializer(product, context={"request": request}).data,
            status=status.HTTP_201_CREATED if instance is None else status.HTTP_200_OK,
        )

    @staticmethod
    def _error(exc: ProductServiceError) -> Response:
        code_to_status = {
            "duplicate_sku": status.HTTP_409_CONFLICT,
            "too_many_images": status.HTTP_400_BAD_REQUEST,
            "invalid_ids": status.HTTP_400_BAD_REQUEST,
            "not_found": status.HTTP_404_NOT_FOUND,
            "invalid_specs": status.HTTP_400_BAD_REQUEST,
            "invalid_status": status.HTTP_400_BAD_REQUEST,
        }
        return api_response(
            status=code_to_status.get(exc.code, status.HTTP_400_BAD_REQUEST),
            error={"code": exc.code, "message": exc.message, "fields": exc.fields or {}},
        )


# ====================================================================
# Module 9 — admin product moderation
# ====================================================================
def _admin_product_error(exc) -> Response:
    return api_response(
        status=exc.http_status,
        error={
            "code": exc.code,
            "message": exc.message,
            "fields": exc.fields or {},
        },
    )


class AdminProductListView(APIView):
    """``GET /api/v1/admin/products/`` -- paginated admin product list."""

    permission_classes = (IsAuthenticated, IsAdmin)
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        qs = AdminProductService.list_products(
            status=request.query_params.get("status", ""),
            vendor_id=request.query_params.get("vendor_id", ""),
            search=request.query_params.get("search", ""),
            ordering=request.query_params.get("ordering") or "-created_at",
        )
        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = AdminProductListSerializer(
            page if page is not None else qs,
            many=True,
            context={"request": request},
        ).data
        if page is not None:
            return paginator.get_paginated_response(data)
        return api_response(data=data)


class AdminProductDetailOrDeleteView(APIView):
    """``GET / DELETE /api/v1/admin/products/{id}/``."""

    permission_classes = (IsAuthenticated, IsAdmin)

    def get(self, request: Request, product_id) -> Response:
        try:
            product = AdminProductService.get_product(product_id)
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        # Reuse the public detail serializer for full payload.
        from apps.products.serializers import ProductDetailSerializer

        return api_response(
            data=ProductDetailSerializer(
                product, context={"request": request}
            ).data
        )

    def delete(self, request: Request, product_id) -> Response:
        reason = (
            (request.data or {}).get("reason", "")
            if isinstance(request.data, dict)
            else ""
        )
        try:
            product = AdminProductService.soft_delete(
                actor=request.user, product_id=product_id, reason=reason
            )
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        return api_response(
            data=AdminProductListSerializer(
                product, context={"request": request}
            ).data,
            message="Product archived.",
        )


class AdminProductModerateView(APIView):
    """``PATCH /api/v1/admin/products/{id}/moderate/`` -- status flip.

    Allows admins to move a product through any ``ProductStatus`` value
    (draft → published → archived → suspended, etc.), which is broader than
    the binary hide/restore surface in ``/hide/`` and ``/restore/``.
    """

    permission_classes = (IsAuthenticated, IsAdmin)
    parser_classes = (JSONParser, FormParser)

    def patch(self, request: Request, product_id) -> Response:
        serializer = AdminProductModerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            product = AdminProductService.moderate_status(
                actor=request.user,
                product_id=product_id,
                new_status=serializer.validated_data["status"],
                reason=serializer.validated_data.get("reason", ""),
            )
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        return api_response(
            data=AdminProductListSerializer(
                product, context={"request": request}
            ).data,
            message="Product status updated.",
        )


# ====================================================================
# Module 9 — slug-keyed product moderation (per spec §3166-3172)
# ====================================================================
class _SlugProductActionView(APIView):
    """Shared base for slug-keyed admin product actions.

    The spec writes these endpoints as ``/admin/products/{slug}/hide/``,
    ``/admin/products/{slug}/restore/`` and ``DELETE
    /admin/products/{slug}/`` — distinct from the existing UUID-keyed
    ``/moderate/`` endpoint so the React admin UI can address products
    by their public slug (the field rendered in the table) without
    needing to surface the UUID.
    """

    permission_classes = (IsAuthenticated, IsAdmin)
    parser_classes = (JSONParser, FormParser)

    @staticmethod
    def _reason(request) -> str:
        if not isinstance(request.data, dict):
            return ""
        return (request.data.get("reason") or "").strip()

    def _by_slug(self, slug: str):
        return AdminProductService.get_product_by_slug(slug)


class AdminProductHideView(_SlugProductActionView):
    """``PATCH /api/v1/admin/products/{slug}/hide/`` — set status=HIDDEN.

    Body (optional): ``{"reason": "..."}`` recorded in the audit log.
    Idempotent: a product already HIDDEN returns the current row without
    rewriting the audit log twice.
    """

    def patch(self, request: Request, slug: str) -> Response:
        try:
            product = AdminProductService.hide(
                actor=request.user,
                product_id=AdminProductService.get_product_by_slug(slug).pk,
                reason=self._reason(request),
            )
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        return api_response(
            data=AdminProductListSerializer(
                product, context={"request": request}
            ).data,
            message="Product hidden.",
        )


class AdminProductRestoreView(_SlugProductActionView):
    """``PATCH /api/v1/admin/products/{slug}/restore/`` — set status=ACTIVE.

    Body (optional): ``{"reason": "..."}`` recorded in the audit log.
    """

    def patch(self, request: Request, slug: str) -> Response:
        try:
            product = AdminProductService.restore(
                actor=request.user,
                product_id=AdminProductService.get_product_by_slug(slug).pk,
                reason=self._reason(request),
            )
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        return api_response(
            data=AdminProductListSerializer(
                product, context={"request": request}
            ).data,
            message="Product restored.",
        )


class AdminProductHardDeleteView(_SlugProductActionView):
    """``DELETE /api/v1/admin/products/{slug}/`` — permanent removal.

    Distinct from the UUID-keyed DELETE which performs a *soft* delete
    (archive). The slug-keyed variant honors the spec line 3171
    "(hard delete — requires admin confirmation)" and is gated behind
    the page's confirm dialog.

    Body (optional): ``{"reason": "..."}`` recorded in the audit log.
    """

    def delete(self, request: Request, slug: str) -> Response:
        try:
            snapshot = AdminProductService.hard_delete(
                actor=request.user,
                product_id=AdminProductService.get_product_by_slug(slug).pk,
                reason=self._reason(request),
            )
        except AdminProductServiceError as exc:
            return _admin_product_error(exc)
        return api_response(
            data=snapshot,
            message="Product permanently deleted.",
        )
