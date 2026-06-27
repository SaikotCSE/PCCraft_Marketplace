"""Common endpoints -- health-check + envelope demo."""
from django.urls import path
from rest_framework.permissions import AllowAny

from apps.common.response import APIResponse
from apps.common.views import HealthCheckView, ping

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("ping/", ping, name="ping"),
]