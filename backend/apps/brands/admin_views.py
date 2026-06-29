"""Admin brand CRUD views (Module 9 — Brand Admin).

Mounted at ``/api/v1/admin/brands/``. Every endpoint requires
``IsAdmin`` and every mutation writes an ``AuditLog`` row via
``BrandAdminService``.

Endpoints:

* ``GET    /``                       — paginated list (search, is_active).
* ``POST   /``                       — create brand.
* ``GET    /{slug}/``                — single brand detail.
* ``PATCH  /{slug}/``                — update brand.
* ``DELETE /{slug}/``                — soft delete (refuses if products exist).
* ``PATCH  /{slug}/restore/``        — restore a soft-deleted brand.
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.brands.admin_serializers import (
    BrandAdminDetailSerializer,
    BrandAdminListSerializer,
    BrandAdminWriteSerializer,
)
from apps.brands.services import BrandAdminService, BrandAdminServiceError
from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin
from apps.common.response import api_response

logger = logging.getLogger(__name__)


def _service_error(exc: BrandAdminServiceError) -> Response:
    return api_response(
        status=exc.http_status,
        error={
            "code": exc.code,
            "message": exc.message,
            "fields": exc.fields or {},
        },
    )


# ====================================================================
# Collection
# ====================================================================
class AdminBrandCollectionView(APIView):
    """``GET /`` paginated list, ``POST /`` create."""

    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        qs = BrandAdminService.list_brands(
            search=request.query_params.get("search", "").strip(),
            is_active=request.query_params.get("is_active", "").strip(),
            ordering=request.query_params.get("ordering", "display_order").strip(),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = BrandAdminListSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request: Request) -> Response:
        serializer = BrandAdminWriteSerializer(data=request.data)
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
            brand = BrandAdminService.create(
                actor=request.user,
                data=dict(serializer.validated_data),
                request=request,
            )
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        logger.info("admin.brands.create ok brand_id=%s actor=%s", brand.pk, request.user.pk)
        return api_response(
            data=BrandAdminDetailSerializer(brand).data,
            status=status.HTTP_201_CREATED,
        )


# ====================================================================
# Detail
# ====================================================================
class AdminBrandDetailView(APIView):
    """``GET / PATCH / DELETE /api/v1/admin/brands/{slug}/``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request: Request, slug: str) -> Response:
        try:
            brand = BrandAdminService.get_brand_by_slug(slug)
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        return api_response(
            data=BrandAdminDetailSerializer(brand).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, slug: str) -> Response:
        try:
            brand = BrandAdminService.get_brand_by_slug(slug)
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        serializer = BrandAdminWriteSerializer(brand, data=request.data, partial=True)
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
            brand = BrandAdminService.update(
                actor=request.user,
                brand=brand,
                data=dict(serializer.validated_data),
                request=request,
            )
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        logger.info("admin.brands.update ok brand_id=%s actor=%s", brand.pk, request.user.pk)
        return api_response(
            data=BrandAdminDetailSerializer(brand).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, slug: str) -> Response:
        try:
            brand = BrandAdminService.get_brand_by_slug(slug)
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        try:
            BrandAdminService.soft_delete(
                actor=request.user, brand=brand, request=request,
            )
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        logger.info("admin.brands.soft_delete ok brand_id=%s actor=%s", brand.pk, request.user.pk)
        return api_response(
            data={"message": "Brand deleted.", "id": str(brand.id), "slug": brand.slug},
            status=status.HTTP_200_OK,
        )


# ====================================================================
# Restore
# ====================================================================
class AdminBrandRestoreView(APIView):
    """``PATCH /api/v1/admin/brands/{slug}/restore/``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request: Request, slug: str) -> Response:
        try:
            brand = BrandAdminService.get_brand_by_slug(slug)
            brand = BrandAdminService.restore(
                actor=request.user, brand=brand, request=request,
            )
        except BrandAdminServiceError as exc:
            return _service_error(exc)
        logger.info("admin.brands.restore ok brand_id=%s actor=%s", brand.pk, request.user.pk)
        return api_response(
            data=BrandAdminDetailSerializer(brand).data,
            status=status.HTTP_200_OK,
        )
