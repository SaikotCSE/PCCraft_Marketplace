"""URL routes for Module 11 — search & analytics (spec §11.1, §11.3).

Mounted in ``config/urls.py`` at two prefixes:

* ``/api/v1/search/``         — public + staff
* ``/api/v1/analytics/``      — staff only
"""
from __future__ import annotations

from django.urls import path

from apps.recommendations import search

app_name = "search"

urlpatterns = [
    path(
        "",
        search.search_products,
        name="search",
    ),
    path(
        "suggestions/",
        search.search_suggestions,
        name="suggestions",
    ),
    path(
        "trending/",
        search.search_trending,
        name="trending",
    ),
    path(
        "zero-result/",
        search.zero_result_queries,
        name="zero-result",
    ),
]


analytics_urlpatterns = [
    path(
        "search/",
        search.search_analytics,
        name="search-analytics",
    ),
]
