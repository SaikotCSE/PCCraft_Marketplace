"""URLconf for the brands app.

Mounted by ``config/urls.py`` at ``/api/v1/brands/``.
"""
from __future__ import annotations

from django.urls import path

from apps.brands.views import BrandCollectionView, BrandDetailView

app_name = "brands"

urlpatterns: list = [
    path("", BrandCollectionView.as_view(), name="collection"),
    path("<slug:slug>/", BrandDetailView.as_view(), name="detail"),
]