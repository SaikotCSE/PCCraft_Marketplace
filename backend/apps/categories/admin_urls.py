"""Admin category URLs (Module 9 — Category Admin).

Mounted at ``/api/v1/admin/categories/``.
"""
from __future__ import annotations

from django.urls import path

from apps.categories.admin_views import (
    AdminCategoryCollectionView,
    AdminCategoryDetailView,
    AdminCategoryRestoreView,
    AdminCategoryTreeView,
)

app_name = "admin_categories"

urlpatterns = [
    path("", AdminCategoryCollectionView.as_view(), name="list"),
    path("tree/", AdminCategoryTreeView.as_view(), name="tree"),
    path("<slug:slug>/", AdminCategoryDetailView.as_view(), name="detail"),
    path("<slug:slug>/restore/", AdminCategoryRestoreView.as_view(), name="restore"),
]
