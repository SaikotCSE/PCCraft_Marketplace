"""Accounts signals.

A new ``CustomUser`` must always have a matching profile row:

* ``role=Customer``   → ``CustomerProfile`` (1:1)
* ``role=Vendor``     → ``VendorProfile``   (1:1, status=PENDING until KYC review)

We listen on ``post_save`` of ``CustomUser``. If the role flips
*after* registration (admin overrides a customer into a vendor, or
vice-versa) we create the missing profile but **never** delete the
existing one -- that's a destructive op and should be an explicit
admin action.

Wired via :func:`apps.accounts.apps.AccountsConfig.ready`.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import CustomerProfile, CustomUser, UserRole, VendorProfile, VendorStatus


logger = logging.getLogger("apps.accounts.signals")


@receiver(post_save, sender=CustomUser)
def ensure_profile_for_role(sender, instance: CustomUser, created: bool, **kwargs):
    """Create the role-appropriate profile if it doesn't exist yet.

    CustomerProfile is created automatically because the user object
    alone carries everything needed (full_name, phone, etc.).

    VendorProfile is NOT created here -- ``AuthService.register_vendor``
    creates it with the full multipart payload (business_name, store
    fields, docs, etc.). An empty signal-created VendorProfile would
    violate ``store_slug``'s uniqueness on the second registration.
    """
    # Avoid recursion if a profile.save() ever triggers a user.save().
    if kwargs.get("raw"):
        return

    if instance.role == UserRole.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=instance)
    # VENDOR: handled by AuthService.register_vendor (which has the
    # full payload). The service uses get_or_create too, so this branch
    # is intentionally a no-op.