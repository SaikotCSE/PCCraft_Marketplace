"""URLconf for the categories app.

Mounted by ``config/urls.py`` at ``/api/v1/categories/``.
"""
from __future__ import annotations

from django.urls import path

from apps.categories.views import (
    CategoryCollectionView,
    CategoryDetailView,
)

app_name = "categories"

urlpatterns: list = [
    # GET (public tree/flat) and POST (admin create) both bind to "".
    path("", CategoryCollectionView.as_view(), name="collection"),
    # GET (public detail), PATCH/DELETE (admin).
    path("<slug:slug>/", CategoryDetailView.as_view(), name="detail"),
]