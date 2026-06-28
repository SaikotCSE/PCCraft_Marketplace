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

api_v1_patterns = [
    path("common/", include(("apps.common.urls", "common"), namespace="common")),
    path("accounts/", include(("apps.accounts.urls", "accounts"), namespace="accounts")),
    # Module 1 spec exposes auth endpoints under /api/v1/auth/ — alias the
    # same urlconf so /auth/login/ etc. resolve identically to /accounts/.
    path("auth/", include(("apps.accounts.urls", "accounts-auth"), namespace="accounts-auth")),
    path("categories/", include(("apps.categories.urls", "categories"), namespace="categories")),
    path("brands/", include(("apps.brands.urls", "brands"), namespace="brands")),
    path("products/", include(("apps.products.urls", "products"), namespace="products")),
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
    path("reviews/", include(("apps.reviews.urls", "reviews"), namespace="reviews")),
    path("recommendations/", include(("apps.recommendations.urls", "recommendations"), namespace="recommendations")),
    path("compatibility/", include(("apps.compatibility.urls", "compatibility"), namespace="compatibility")),
    path("dashboard/", include(("apps.dashboard.urls", "dashboard"), namespace="dashboard")),
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