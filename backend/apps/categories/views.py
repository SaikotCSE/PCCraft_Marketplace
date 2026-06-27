"""Views for the categories app.

Endpoint summary (mounted under ``/api/v1/categories/``):

* ``GET    /``           — public; tree view by default, ``?flat=1`` for list.
* ``POST   /``           — admin only.
* ``GET    /{slug}/``    — public; single category detail.
* ``PATCH  /{slug}/``    — admin only.
* ``DELETE /{slug}/``    — admin only; soft delete.
"""
from __future__ import annotations

import logging

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.categories.models import Category
from apps.categories.serializers import (
    CategoryDetailSerializer,
    CategoryListSerializer,
    CategoryTreeSerializer,
    CategoryWriteSerializer,
)
from apps.categories.services import CategoryService, CategoryServiceError
from apps.common.response import api_response

logger = logging.getLogger(__name__)


def _error_response(exc: CategoryServiceError) -> Response:
    """Translate a service error into our envelope."""
    code_to_status = {
        "duplicate_slug": status.HTTP_409_CONFLICT,
        "invalid_parent": status.HTTP_400_BAD_REQUEST,
        "has_children": status.HTTP_409_CONFLICT,
    }
    status_code = code_to_status.get(exc.code, status.HTTP_400_BAD_REQUEST)
    return api_response(
        status=status_code,
        error={"code": exc.code, "message": exc.message, "fields": exc.fields or {}},
    )


# ====================================================================
# Collection: GET (tree/list) + POST (admin create)
# ====================================================================
class CategoryCollectionView(APIView):
    """``GET /`` public tree (or flat); ``POST /`` admin-only create."""

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdminUser()]
        return [AllowAny()]

    def get(self, request: Request) -> Response:
        if request.query_params.get("flat", "").lower() in {"1", "true", "yes"}:
            qs = (
                Category.objects
                .select_related("parent")
                .annotate(
                    product_count=Count(
                        "products",
                        filter=Q(products__is_active=True),
                    ),
                )
                .order_by("display_order", "name")
            )
            data = CategoryListSerializer(qs, many=True).data
            return api_response(data=data, status=status.HTTP_200_OK)

        tree = CategoryService.tree()
        # Validate the shape so OpenAPI documents it.
        CategoryTreeSerializer(data=tree, many=True)
        return api_response(data=tree, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        serializer = CategoryWriteSerializer(data=request.data)
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
            category = CategoryService.create(dict(serializer.validated_data))
        except CategoryServiceError as exc:
            return _error_response(exc)
        logger.info("categories.create ok category_id=%s", category.pk)
        return api_response(
            data=CategoryDetailSerializer(category).data,
            status=status.HTTP_201_CREATED,
        )


# ====================================================================
# Detail: GET public, PATCH/DELETE admin
# ====================================================================
class CategoryDetailView(APIView):
    """``GET / PATCH / DELETE /api/v1/categories/{slug}/``."""

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAdminUser()]

    def get(self, request: Request, slug: str) -> Response:
        try:
            category = Category.objects.select_related("parent").get(slug=slug)
        except Category.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Category not found."},
            )
        return api_response(
            data=CategoryDetailSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, slug: str) -> Response:
        try:
            category = Category.objects.get(slug=slug)
        except Category.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Category not found."},
            )
        serializer = CategoryWriteSerializer(category, data=request.data, partial=True)
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
            category = CategoryService.update(category, serializer.validated_data)
        except CategoryServiceError as exc:
            return _error_response(exc)
        logger.info("categories.update ok category_id=%s", category.pk)
        return api_response(
            data=CategoryDetailSerializer(category).data,
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, slug: str) -> Response:
        try:
            category = Category.objects.get(slug=slug)
        except Category.DoesNotExist:
            return api_response(
                status=status.HTTP_404_NOT_FOUND,
                error={"code": "not_found", "message": "Category not found."},
            )
        try:
            CategoryService.soft_delete(category)
        except CategoryServiceError as exc:
            return _error_response(exc)
        logger.info("categories.soft_delete ok category_id=%s", category.pk)
        return api_response(
            data={"message": "Category deleted.", "id": str(category.id)},
            status=status.HTTP_200_OK,
        )
