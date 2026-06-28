"""URL routes for the recommendations app (Module 7 spec §7.3).

All five read endpoints are registered on a single ``urlpatterns`` list
and included from ``config/urls.py`` under
``/api/v1/recommendations/``.
"""
from __future__ import annotations

from django.urls import path

from apps.recommendations import views

app_name = "recommendations"

urlpatterns = [
    path(
        "trending/",
        views.trending,
        name="trending",
    ),
    path(
        "personalized/",
        views.personalized,
        name="personalized",
    ),
    path(
        "recently-viewed/",
        views.recently_viewed,
        name="recently-viewed",
    ),
    path(
        "<slug:slug>/similar/",
        views.similar_products,
        name="similar",
    ),
    path(
        "<slug:slug>/frequently-bought-together/",
        views.frequently_bought_together,
        name="frequently-bought-together",
    ),
]