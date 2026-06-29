"""Admin category CRUD views (Module 9 — Category Admin).

Mounted at ``/api/v1/admin/categories/``. Every endpoint requires
``IsAdmin`` and every mutation writes an ``AuditLog`` row via
``CategoryAdminService``.

Endpoints:

* ``GET    /``                       — paginated list (search, is_active, parent).
* ``POST   /``                       — create category.
* ``GET    /tree/``                  — full tree (admin), including inactive rows.
* ``GET    /{slug}/``                — single category detail.
* ``PATCH  /{slug}/``                — update category.
* ``DELETE /{slug}/``                — soft delete (refuses if has children).
* ``PATCH  /{slug}/restore/``        — restore a soft-deleted category.
"""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.categories.admin_serializers import (
    CategoryAdminDetailSerializer,
    CategoryAdminListSerializer,
    CategoryAdminWriteSerializer,
)
from apps.categories.services import (
    CategoryAdminService,
    CategoryAdminServiceError,
)
from apps.common.pagination import StandardResultsPagination
from apps.common.permissions import IsAdmin
from apps.common.response import api_response

logger = logging.getLogger(__name__)


def _service_error(exc: CategoryAdminServiceError) -> Response:
    return api_response(
        status=exc.http_status,
        error={
            "code": exc.code,
            "message": exc.message,
            "fields": exc.fields or {},
        },
    )


# ====================================================================
# Tree (admin) — full forest, including inactive
# ====================================================================
class AdminCategoryTreeView(APIView):
    """``GET /api/v1/admin/categories/tree/``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request: Request) -> Response:
        include_inactive = request.query_params.get(
            "include_inactive", "true"
        ).lower() in {"1", "true", "yes"}
        tree = CategoryAdminService.tree(include_inactive=include_inactive)
        return api_response(data=tree, status=status.HTTP_200_OK)


# ====================================================================
# Collection
# ====================================================================
class AdminCategoryCollectionView(APIView):
    """``GET /`` paginated list, ``POST /`` create."""

    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsPagination

    def get(self, request: Request) -> Response:
        qs = CategoryAdminService.list_categories(
            search=request.query_params.get("search", "").strip(),
            is_active=request.query_params.get("is_active", "").strip(),
            parent=request.query_params.get("parent", "").strip(),
            ordering=request.query_params.get("ordering", "display_order").strip(),
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = CategoryAdminListSerializer(page, many=True).data
        return paginator.get_paginated_response(data)

    def post(self, request: Request) -> Response:
        serializer = CategoryAdminWriteSerializer(data=request.data)
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
            category = CategoryAdminService.create(
                actor=request.user,
                data=dict(serializer.validated_data),
                request=request,
            )
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        logger.info(
            "admin.categories.create ok category_id=%s actor=%s",
            category.pk, request.user.pk,
        )
        return api_response(
            data=CategoryAdminDetailSerializer(category).data,
            status=status.HTTP_201_CREATED,
        )


# ====================================================================
# Detail
# ====================================================================
class AdminCategoryDetailView(APIView):
    """``GET / PATCH / DELETE /api/v1/admin/categories/{slug}/``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request: Request, slug: str) -> Response:
        try:
            category = CategoryAdminService.get_category_by_slug(slug)
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        return api_response(
            data=CategoryAdminDetailSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, slug: str) -> Response:
        try:
            category = CategoryAdminService.get_category_by_slug(slug)
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        serializer = CategoryAdminWriteSerializer(category, data=request.data, partial=True)
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
            category = CategoryAdminService.update(
                actor=request.user,
                category=category,
                data=dict(serializer.validated_data),
                request=request,
            )
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        logger.info(
            "admin.categories.update ok category_id=%s actor=%s",
            category.pk, request.user.pk,
        )
        return api_response(
            data=CategoryAdminDetailSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, slug: str) -> Response:
        try:
            category = CategoryAdminService.get_category_by_slug(slug)
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        try:
            CategoryAdminService.soft_delete(
                actor=request.user, category=category, request=request,
            )
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        logger.info(
            "admin.categories.soft_delete ok category_id=%s actor=%s",
            category.pk, request.user.pk,
        )
        return api_response(
            data={"message": "Category deleted.", "id": str(category.id), "slug": category.slug},
            status=status.HTTP_200_OK,
        )


# ====================================================================
# Restore
# ====================================================================
class AdminCategoryRestoreView(APIView):
    """``PATCH /api/v1/admin/categories/{slug}/restore/``."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request: Request, slug: str) -> Response:
        try:
            category = CategoryAdminService.get_category_by_slug(slug)
            category = CategoryAdminService.restore(
                actor=request.user, category=category, request=request,
            )
        except CategoryAdminServiceError as exc:
            return _service_error(exc)
        logger.info(
            "admin.categories.restore ok category_id=%s actor=%s",
            category.pk, request.user.pk,
        )
        return api_response(
            data=CategoryAdminDetailSerializer(category).data,
            status=status.HTTP_200_OK,
        )
