"""URL configuration for the compatibility app (Module 8).

Routes are namespaced under ``compatibility`` so reverse lookups stay
unambiguous across the project::

    reverse("compatibility:rules-list")
    reverse("compatibility:check")
    reverse("compatibility:compatible-products", args=["CPU"])
    reverse("compatibility:builds-list")
    reverse("compatibility:build-share", args=["<token>"])

Two URL patterns are exported so the same viewset is mounted under
both the in-tree prefix (``/api/v1/compatibility/``) and the spec
§2.10 alias (``/api/v1/builds/``):

* ``urlpatterns`` -- the full set used at ``/api/v1/compatibility/``.
* ``build_urlpatterns`` -- the build-CRUD subset mounted at
  ``/api/v1/builds/`` (spec §2.10: "On login: auto-POST to
  /api/v1/builds/").
"""
from __future__ import annotations

from django.urls import path

from apps.compatibility import views


app_name = "compatibility"

urlpatterns = [
    # ---- rules (admin) ---------------------------------------------
    path("rules/", views.RuleListCreateView.as_view(), name="rules-list"),
    path(
        "rules/<uuid:pk>/",
        views.RuleDetailView.as_view(),
        name="rules-detail",
    ),

    # ---- public checker --------------------------------------------
    path("check/", views.CompatibilityCheckView.as_view(), name="check"),

    # ---- compatible products for a slot ----------------------------
    path(
        "products/<str:slot>/",
        views.CompatibleProductsView.as_view(),
        name="compatible-products",
    ),

    # ---- PC builds (user CRUD) -------------------------------------
    path("builds/", views.PCBuildListCreateView.as_view(), name="builds-list"),
    path(
        "builds/<int:pk>/",
        views.PCBuildDetailView.as_view(),
        name="builds-detail",
    ),

    # ---- share / view (public when is_public=True) -----------------
    path(
        "builds/share/<uuid:token>/",
        views.SharedPCBuildView.as_view(),
        name="build-share",
    ),

    # ---- admin: attributes table -----------------------------------
    path(
        "attributes/",
        views.CompatibilityAttributeListCreateView.as_view(),
        name="attributes-list",
    ),
    path(
        "attributes/<uuid:pk>/",
        views.CompatibilityAttributeDetailView.as_view(),
        name="attributes-detail",
    ),
]


# ====================================================================
# Spec §2.10 alias: /api/v1/builds/
# ====================================================================
# Only the build-CRUD subset lives here so the public auto-POST on
# login targets the canonical spec path without conflicting with the
# rules / check / products routes that have their own /compatibility/
# prefix.
build_urlpatterns = [
    path("", views.PCBuildListCreateView.as_view(), name="builds-list"),
    path(
        "<int:pk>/",
        views.PCBuildDetailView.as_view(),
        name="builds-detail",
    ),
    path(
        "share/<uuid:token>/",
        views.SharedPCBuildView.as_view(),
        name="build-share",
    ),
]