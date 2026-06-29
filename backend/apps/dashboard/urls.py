"""Dashboard URLconf -- Module 9.

Mounted at ``/api/v1/dashboard/`` (see ``config/urls.py``).
"""
from django.urls import path

from apps.dashboard import views

app_name = "dashboard"

urlpatterns: list = [
    path("overview/", views.DashboardOverviewView.as_view(), name="overview"),
    path("orders-over-time/", views.OrdersOverTimeView.as_view(), name="orders-over-time"),
    path("revenue-over-time/", views.RevenueOverTimeView.as_view(), name="revenue-over-time"),
    path("top-products/", views.TopProductsView.as_view(), name="top-products"),
    path("top-vendors/", views.TopVendorsView.as_view(), name="top-vendors"),
    path("category-distribution/", views.CategoryDistributionView.as_view(), name="category-distribution"),
    path("user-growth/", views.UserGrowthView.as_view(), name="user-growth"),
]