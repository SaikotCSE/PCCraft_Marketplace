"""User + profile models for Module 1.

Three concrete models:

* ``CustomUser``        -- email-as-username user with a ``role`` enum
                            and full profile fields (gender, DOB, avatar).
* ``CustomerProfile``   -- 1:1 with customer accounts, default shipping
                            address FK (orders.ShippingAddress; added as
                            a stub now and expanded in Module 5).
* ``VendorProfile``     -- 1:1 with vendor accounts, KYC documents,
                            storefront metadata, and approval status.

Every concrete model inherits from ``apps.common.models.TimeStampedModel``
for audit + soft-delete columns.
"""
from __future__ import annotations

import uuid
from datetime import date

from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel
from apps.common.validators import (
    BDPhoneValidator,
    FileMimeTypeValidator,
    ImageValidator,
)


# ====================================================================
# Enums (TextChoices). Values are stable identifiers used by the
# frontend constants mirror in ``frontend/src/utils/constants.js``.
# ====================================================================
class UserRole(models.TextChoices):
    CUSTOMER = "customer", _("Customer")
    VENDOR = "vendor", _("Vendor")
    ADMIN = "admin", _("Administrator")


class Gender(models.TextChoices):
    MALE = "MALE", _("Male")
    FEMALE = "FEMALE", _("Female")
    PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY", _("Prefer not to say")


class BusinessType(models.TextChoices):
    SOLE_PROP = "SOLE_PROP", _("Sole proprietorship")
    PARTNERSHIP = "PARTNERSHIP", _("Partnership")
    PVT_LTD = "PVT_LTD", _("Private limited")
    OTHER = "OTHER", _("Other")


class VendorStatus(models.TextChoices):
    PENDING = "PENDING", _("Pending review")
    APPROVED = "APPROVED", _("Approved")
    REJECTED = "REJECTED", _("Rejected")
    INFO_REQUESTED = "INFO_REQUESTED", _("Additional information requested")


# ====================================================================
# Manager
# ====================================================================
class CustomUserManager(BaseUserManager):
    """Email-based manager -- no usernames."""

    use_in_migrations = True

    def _create_user(
        self,
        email,
        password,
        *,
        is_staff=False,
        is_superuser=False,
        **extra_fields,
    ):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        user = self.model(
            email=email,
            is_staff=is_staff,
            is_superuser=is_superuser,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


# ====================================================================
# CustomUser
# ====================================================================
class CustomUser(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Email-as-username user with a ``role`` enum and full profile fields."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ---- core ----
    email = models.EmailField(_("email address"), unique=True, db_index=True)
    full_name = models.CharField(_("full name"), max_length=150, blank=True)
    phone = models.CharField(
        _("phone"),
        max_length=20,
        blank=True,
        validators=[BDPhoneValidator()],
    )

    role = models.CharField(
        max_length=16,
        choices=UserRole.choices,
        default=UserRole.CUSTOMER,
        db_index=True,
    )

    # ---- profile enrichment ----
    date_of_birth = models.DateField(_("date of birth"), null=True, blank=True)
    gender = models.CharField(
        max_length=20,
        choices=Gender.choices,
        blank=True,
        default="",
    )
    avatar = models.ImageField(
        _("avatar"),
        upload_to="profiles/avatars/%Y/%m/",
        null=True,
        blank=True,
        validators=[ImageValidator(max_size_mb=5)],
    )

    # ---- auth flags ----
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = CustomUserManager()

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ("-date_joined",)

    def __str__(self):  # pragma: no cover
        return self.email

    # ---- convenience role checks ----
    @property
    def is_customer(self):
        return self.role == UserRole.CUSTOMER

    @property
    def is_vendor(self):
        return self.role == UserRole.VENDOR

    @property
    def is_admin_role(self):
        return self.role == UserRole.ADMIN

    def clean(self):
        super().clean()
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValidationError({"date_of_birth": _("Date of birth cannot be in the future.")})


# ====================================================================
# CustomerProfile
# ====================================================================
class CustomerProfile(TimeStampedModel):
    """Customer-only metadata. 1:1 with ``CustomUser`` (role=customer)."""

    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )

    # FK to ``orders.ShippingAddress``. That app currently only ships this
    # single stub model -- Module 5 expands the orders domain. We
    # forward-reference via the ``<app>.<ModelName>`` string so the migration
    # stays correct even if orders' own migrations change later.
    #
    # Lives in migration ``0002_default_shipping_address`` so that the
    # circular FK (accounts ↔ orders via CustomUser + ShippingAddress)
    # doesn't deadlock the migration graph.
    default_shipping_address = models.ForeignKey(
        "orders.ShippingAddress",
        on_delete=models.SET_NULL,
        related_name="+",
        null=True,
        blank=True,
    )

    loyalty_points = models.PositiveIntegerField(default=0)
    total_orders = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    newsletter_subscribed = models.BooleanField(default=True)
    preferred_language = models.CharField(max_length=8, blank=True, default="en")
    preferred_currency = models.CharField(max_length=8, blank=True, default="BDT")

    class Meta:
        verbose_name = "Customer Profile"
        verbose_name_plural = "Customer Profiles"

    def __str__(self):  # pragma: no cover
        return "CustomerProfile<%s>" % self.user_id


# ====================================================================
# VendorProfile
# ====================================================================
def _trade_license_path(instance, filename):
    return "documents/trade_licenses/%s/%s" % (timezone.now().strftime("%Y/%m"), filename)


def _nid_path(instance, filename):
    return "documents/nid_docs/%s/%s" % (timezone.now().strftime("%Y/%m"), filename)


def _store_logo_path(instance, filename):
    return "stores/logos/%s" % filename


def _store_banner_path(instance, filename):
    return "stores/banners/%s" % filename


_DOCUMENT_VALIDATORS = [
    FileMimeTypeValidator(allowed_mime=["image/", "application/pdf"], max_size_mb=5),
]


class VendorProfile(TimeStampedModel):
    """Vendor-only metadata. 1:1 with ``CustomUser`` (role=vendor).

    Combines KYC documents (trade license + NID), business info, and the
    public-facing storefront metadata (store_name, slug, logo, banner,
    return policy, low-stock threshold).
    """

    user = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="vendor_profile",
    )

    # ---- business info ----
    business_name = models.CharField(_("business name"), max_length=180)
    owner_name = models.CharField(_("owner name"), max_length=150)
    business_type = models.CharField(
        max_length=20,
        choices=BusinessType.choices,
        default=BusinessType.SOLE_PROP,
    )
    business_phone = models.CharField(
        max_length=20,
        blank=True,
        validators=[BDPhoneValidator()],
    )

    # ---- KYC documents ----
    trade_license_number = models.CharField(_("trade license number"), max_length=80)
    trade_license_doc = models.FileField(
        _("trade license document"),
        upload_to=_trade_license_path,
        validators=_DOCUMENT_VALIDATORS,
    )
    nid_number = models.CharField(_("NID number"), max_length=40)
    nid_doc = models.FileField(
        _("NID document"),
        upload_to=_nid_path,
        validators=_DOCUMENT_VALIDATORS,
    )

    # ---- business address (JSON: street/city/district/postal_code) ----
    business_address = models.JSONField(
        _("business address"),
        default=dict,
        blank=True,
        help_text=_("{street, city, district, postal_code}"),
    )

    # ---- approval workflow ----
    status = models.CharField(
        max_length=20,
        choices=VendorStatus.choices,
        default=VendorStatus.PENDING,
        db_index=True,
    )
    rejection_reason = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        "accounts.CustomUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_vendors",
    )

    # ---- storefront ----
    store_name = models.CharField(_("store name"), max_length=120)
    store_slug = models.SlugField(
        _("store slug"),
        max_length=140,
        unique=True,
        db_index=True,
    )
    store_description = models.TextField(blank=True)
    store_contact_email = models.EmailField(_("store contact email"), blank=True)
    store_logo = models.ImageField(
        upload_to=_store_logo_path,
        null=True,
        blank=True,
        validators=[ImageValidator(max_size_mb=5)],
    )
    store_banner = models.ImageField(
        upload_to=_store_banner_path,
        null=True,
        blank=True,
        validators=[ImageValidator(max_size_mb=10)],
    )

    # ---- ops ----
    vendor_return_policy = models.TextField(
        blank=True,
        help_text=_("Overrides platform default when non-empty (see spec sec 2.8)."),
    )
    low_stock_threshold = models.PositiveSmallIntegerField(default=5)

    # ---- stats (denormalized; updated by orders/reviews signals in later modules) ----
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    total_reviews = models.PositiveIntegerField(default=0)
    total_sales = models.PositiveIntegerField(default=0)
    is_featured = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Vendor Profile"
        verbose_name_plural = "Vendor Profiles"
        ordering = ("store_name",)

    def __str__(self):  # pragma: no cover
        return self.store_name

    # ---- convenience flags ----
    @property
    def is_approved(self):
        return self.status == VendorStatus.APPROVED

    @property
    def is_pending(self):
        return self.status == VendorStatus.PENDING

    @property
    def is_rejected(self):
        return self.status == VendorStatus.REJECTED

    # ---- slug auto-gen ----
    def save(self, *args, **kwargs):
        if not self.store_slug and self.store_name:
            base = slugify(self.store_name) or "store"
            slug = base
            i = 1
            while (
                VendorProfile.all_objects.filter(store_slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                i += 1
                slug = "%s-%d" % (base, i)
            self.store_slug = slug
        super().save(*args, **kwargs)