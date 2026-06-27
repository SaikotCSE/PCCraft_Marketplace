"""Order domain models.

Module 5 expands this significantly (orders, items, payments, shipments).
For Module 1 we only ship ``ShippingAddress`` because
``accounts.CustomerProfile.default_shipping_address`` FKs to it.
"""
from __future__ import annotations

from django.db import models

from apps.common.models import TimeStampedModel


class ShippingAddress(TimeStampedModel):
    """Per-user address book entry. Full field set grows in Module 5."""

    user = models.ForeignKey(
        "accounts.CustomUser",
        on_delete=models.CASCADE,
        related_name="shipping_addresses",
    )

    label = models.CharField(max_length=80, blank=True, default="Home")
    recipient_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=80)
    district = models.CharField(max_length=80)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=80, default="Bangladesh")
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Shipping Address"
        verbose_name_plural = "Shipping Addresses"
        ordering = ("-is_default", "-updated_at")

    def __str__(self):  # pragma: no cover
        return "%s -- %s, %s" % (self.recipient_name, self.city, self.country)
