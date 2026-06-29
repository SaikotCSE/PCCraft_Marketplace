"""
Project URL configuration.

Every app exposes a ``urls.py`` mounted under ``/api/v1/<app>/``. The
OpenAPI schema and Swagger UI live at ``/api/schema/`` and ``/api/docs/``.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.products import urls as products_urls
from apps.orders import urls as apps_orders_urls
from apps.reviews import urls as apps_reviews_urls
from apps.compatibility import urls as compatibility_urls
from apps.recommendations import search_urls as search_analytics_urls

api_v1_patterns = [
    path("common/", include(("apps.common.urls", "common"), namespace="common")),
    path("accounts/", include(("apps.accounts.urls", "accounts"), namespace="accounts")),
    # Module 1 spec exposes auth endpoints under /api/v1/auth/ — alias the
    # same urlconf so /auth/login/ etc. resolve identically to /accounts/.
    path("auth/", include(("apps.accounts.urls", "accounts-auth"), namespace="accounts-auth")),
    path("categories/", include(("apps.categories.urls", "categories"), namespace="categories")),
    path("brands/", include(("apps.brands.urls", "brands"), namespace="brands")),
    path("products/", include(("apps.products.urls", "products"), namespace="products")),
    # Product-scoped review routes (lives in apps.reviews.urls, mounted
    # here so the prefix matches the spec: /api/v1/products/<slug>/reviews/).
    # NOTE: prefix is "products/" — mounting under "" would let the
    # <slug:slug> URL converter swallow sibling prefixes like
    # "admin" and collide with /admin/reviews/ etc.
    path(
        "products/",
        include(
            (apps_reviews_urls.product_router, "products-reviews"),
            namespace="products-reviews",
        ),
    ),
    # The vendor router lives inside apps/products/urls.py under a
    # "vendor/" sub-prefix. Expose it at the project root so the spec's
    # /api/v1/vendor/products/* URLs resolve cleanly.
    path("vendor/", include((products_urls.vendor_router.urls, "vendor-products"), namespace="vendor-products")),
    path("cart/", include(("apps.cart.urls", "cart"), namespace="cart")),
    path("wishlist/", include(("apps.wishlist.urls", "wishlist"), namespace="wishlist")),
    # Address book lives at /api/v1/addresses/ per spec
    path(
        "addresses/",
        include((apps_orders_urls.address_urlpatterns, "addresses"), namespace="addresses"),
    ),
    path("", include(("apps.orders.urls", "orders"), namespace="orders")),
    # Reviews (Module 6). Mounted three times so the spec's URL prefixes
    # resolve cleanly: ``/products/<slug>/reviews/`` (already wired
    # above), ``/reviews/<id>/`` + ``/reviews/<id>/helpful/``, and the
    # vendor + admin prefixes below.
    path("reviews/", include(("apps.reviews.urls", "reviews"), namespace="reviews")),
    path("vendor/reviews/", include((apps_reviews_urls.vendor_urlpatterns, "vendor-reviews"), namespace="vendor-reviews")),
    path("admin/reviews/", include((apps_reviews_urls.admin_urlpatterns, "admin-reviews"), namespace="admin-reviews")),
    # Module 9 — admin user moderation. Separate URLconf so the public
    # auth namespace stays isolated.
    path("admin/users/", include(("apps.accounts.admin_urls", "admin-users"), namespace="admin-users")),
    path("admin/vendors/", include(("apps.accounts.admin_vendor_urls", "admin-vendors"), namespace="admin-vendors")),
    path("admin/products/", include(("apps.products.admin_urls", "admin-products"), namespace="admin-products")),
    path("admin/orders/", include(("apps.orders.admin_urls", "admin-orders"), namespace="admin-orders")),
    path("admin/brands/", include(("apps.brands.admin_urls", "admin-brands"), namespace="admin-brands")),
    path("admin/categories/", include(("apps.categories.admin_urls", "admin-categories"), namespace="admin-categories")),
    path("recommendations/", include(("apps.recommendations.urls", "recommendations"), namespace="recommendations")),
    # Module 11 — search & filtering (advanced). Public + staff endpoints.
    path("search/", include(("apps.recommendations.search_urls", "search"), namespace="search")),
    # Module 11 — staff-only aggregate analytics. Mount only the
    # ``analytics_urlpatterns`` subset so the public /api/v1/search/*
    # routes aren't double-exposed under /api/v1/analytics/*.
    path(
        "analytics/",
        include(
            (search_analytics_urls.analytics_urlpatterns, "search-analytics"),
            namespace="search-analytics",
        ),
    ),
    path("compatibility/", include(("apps.compatibility.urls", "compatibility"), namespace="compatibility")),
    # Spec §2.10: "On login: auto-POST to /api/v1/builds/". Mount only
    # the build-CRUD subset (build_urlpatterns) here so the alias path
    # resolves to /api/v1/builds/, /api/v1/builds/<id>/, and
    # /api/v1/builds/share/<token>/. The rules / check / products
    # routes stay under /api/v1/compatibility/.
    path(
        "builds/",
        include((compatibility_urls.build_urlpatterns, "builds"), namespace="builds"),
    ),
    path("dashboard/", include(("apps.dashboard.urls", "dashboard"), namespace="dashboard")),
    # Module 10 — vendor dashboard analytics.
    # Mounted at /api/v1/vendor/dashboard/* and gated by IsApprovedVendor.
    path(
        "vendor/dashboard/",
        include(
            ("apps.dashboard.vendor_analytics_urls", "vendor-dashboard"),
            namespace="vendor-dashboard",
        ),
    ),
    # Module 9 spec writes analytics URLs as /api/v1/admin/analytics/...
    # The canonical implementation lives under /api/v1/dashboard/*; this
    # alias mount re-exposes the same views so spec-named URLs resolve.
    path(
        "admin/analytics/",
        include(
            ("apps.dashboard.admin_analytics_urls", "admin-analytics"),
            namespace="admin-analytics",
        ),
    ),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((api_v1_patterns, "api"), namespace="api")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)