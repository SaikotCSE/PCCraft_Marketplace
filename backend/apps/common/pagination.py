"""Default pagination -- 20 items per page, envelope-aware meta."""
from __future__ import annotations

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.common.response import APIResponse


class StandardResultsPagination(PageNumberPagination):
    """20 items per page, max 100. Emits envelope-shaped meta."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data) -> Response:
        return APIResponse(
            data=data,
            meta={
                "pagination": {
                    "page": self.page.number,
                    "page_size": self.get_page_size(self.request),
                    "total_pages": self.page.paginator.num_pages,
                    "total_items": self.page.paginator.count,
                    "has_next": self.page.has_next(),
                    "has_previous": self.page.has_previous(),
                    "next": self.get_next_link(),
                    "previous": self.get_previous_link(),
                }
            },
        )