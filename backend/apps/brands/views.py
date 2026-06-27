"""Views for the brands app.

Endpoint summary (mounted under ``/api/v1/brands/``):

* ``GET    /``           — public; optional ``?featured=1`` filter.
* ``POST   /``           — admin only.
* ``GET    /{slug}/``    — public; single brand detail.
* ``PATCH  /{slug}/``    — admin only.
* ``DELETE /{slug}/``    — admin only; soft delete (refuses if products reference).
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.models import Brand
from apps.brands.serializers import (
    BrandDetailSerializer,
    BrandListSerializer,
    BrandWriteSerializer,
)
from apps.brands.services import BrandService, BrandServiceError
from apps.common.response import api_response

logger = logging.getLogger(__name__)


def _error_response(exc: BrandServiceError) -> Response:
    code_to_status = {
        "duplicate_slug": status.HTTP_409_CONFLICT,
        "has_products": status.HTTP_409_CONFLICT,
    }
    status_code = code_to_status.get(exc.code, status.HTTP_400_BAD_REQUEST)
    return api_response(
        status=status_code,
        error={"code": exc.code, "message": exc.message, "fields": exc.fields or {}},
    )


# ====================================================================
# Collection
# ====================================================================
class BrandCollectionView(APIView):
    """``GET /`` public; ``POST /`` admin only."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminUser()]
        return [AllowAny()]

    def get(self, request: Request) -> Response:
        qs = Brand.objects.all().order_by("display_order", "name")
        if request.query_params.get("featured", "").lower() in {"1", "true", "yes"}:
            qs = qs.filter(is_featured=True)
        data = BrandListSerializer(qs, many=True).data
        return api_response(data=data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        serializer = BrandWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )
        try:
            brand = BrandService.create(dict(serializer.validated_data))
        except BrandServiceError as exc:
            return _error_response(exc)
        logger.info("brands.create ok brand_id=%s", brand.pk)
        return api_response(
            data=BrandDetailSerializer(brand).data,
            status=status.HTTP_201_CREATED,
        )


# ====================================================================
# Detail
# ====================================================================
class BrandDetailView(APIView):
    """``GET / PATCH / DELETE /api/v1/brands/{slug}/``."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request: Request, slug: str) -> Response:
        try:
            brand = Brand.objects.get(slug=slug)
        except Brand.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Brand not found."},
            )
        return api_response(
            data=BrandDetailSerializer(brand).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, slug: str) -> Response:
        try:
            brand = Brand.objects.get(slug=slug)
        except Brand.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Brand not found."},
            )
        serializer = BrandWriteSerializer(brand, data=request.data, partial=True)
        if not serializer.is_valid():
            return api_response(
                status=status.HTTP_400_BAD_REQUEST,
                error={
                    "code": "validation_error",
                    "message": "One or more fields failed validation.",
                    "fields": serializer.errors,
                },
            )
        try:
            brand = BrandService.update(brand, serializer.validated_data)
        except BrandServiceError as exc:
            return _error_response(exc)
        logger.info("brands.update ok brand_id=%s", brand.pk)
        return api_response(
            data=BrandDetailSerializer(brand).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, slug: str) -> Response:
        try:
            brand = Brand.objects.get(slug=slug)
        except Brand.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Brand not found."},
            )
        try:
            BrandService.soft_delete(brand)
        except BrandServiceError as exc:
            return _error_response(exc)
        logger.info("brands.soft_delete ok brand_id=%s", brand.pk)
        return api_response(
            data={"message": "Brand deleted.", "id": str(brand.id)},
            status=status.HTTP_200_OK,
        )
