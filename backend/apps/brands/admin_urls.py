"""Admin brand URLs (Module 9 — Brand Admin).

Mounted at ``/api/v1/admin/brands/``.
"""
from __future__ import annotations

from django.urls import path

from apps.brands.admin_views import (
    AdminBrandCollectionView,
    AdminBrandDetailView,
    AdminBrandRestoreView,
)

app_name = "admin_brands"

urlpatterns = [
    path("", AdminBrandCollectionView.as_view(), name="list"),
    path("<slug:slug>/", AdminBrandDetailView.as_view(), name="detail"),
    path("<slug:slug>/restore/", AdminBrandRestoreView.as_view(), name="restore"),
]
