"""Auth serializers — full implementations per spec §Module 1.

Serializers
-----------
* ``CustomerRegisterSerializer``  -- validates phone regex, password match,
  age ≥ 13 if DOB provided. Used by ``CustomerRegisterView``.
* ``VendorRegisterSerializer``    -- validates document MIME types using
  ``FileMimeTypeValidator`` (already on the model fields, this serializer
  adds cross-field + business-address structure checks).
* ``LoginSerializer``             -- email + password + role. Delegates to
  ``rest_framework_simplejwt.serializers.TokenObtainPairSerializer`` so
  the same JWT minting flow is reused for the SIMPLE_JWT
  ``/api/v1/auth/token/refresh/`` endpoint.
* ``UserProfileSerializer``       -- readable + writable fields for
  profile update (name, phone, DOB, gender, avatar).
* ``VendorProfileSerializer``     -- includes ``status`` (read-only),
  rejection reason (read-only), and store fields (read-write). Linked to
  via ``ProfileView`` for vendors.
* ``TokenResponseSerializer``     -- wraps ``{access, refresh, user}`` so
  the response shape matches what the frontend's ``useAuthStore`` reads.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import (
    BusinessType,
    CustomerProfile,
    CustomUser,
    Gender,
    UserRole,
    VendorProfile,
    VendorStatus,
)
from apps.common.validators import BDPhoneValidator

User = get_user_model()


# ====================================================================
# Shared helpers
# ====================================================================
def _validate_age_13(dob: date | None) -> None:
    """Raise ``serializers.ValidationError`` if the DOB implies age < 13."""
    if dob is None:
        return
    today = date.today()
    thirteen = today - timedelta(days=13 * 365 + 4)  # leap-year buffer
    if dob > thirteen:
        raise serializers.ValidationError(
            _("You must be at least 13 years old to register."),
            code="underage",
        )
    if dob > today:
        raise serializers.ValidationError(
            _("Date of birth cannot be in the future."),
            code="future_dob",
        )


# ====================================================================
# Login
# ====================================================================
class LoginSerializer(TokenObtainPairSerializer):
    """Email + password + role. Roles are validated here so the service
    layer never sees an invalid role string.
    """

    role = serializers.ChoiceField(
        choices=[r.value for r in UserRole],
        required=True,
    )

    default_error_messages = {
        **TokenObtainPairSerializer.default_error_messages,
        "role_mismatch": "This account does not have the selected role.",
        "email_not_verified": (
            "Please verify your email before signing in. Check your inbox "
            "for the 6-digit code, or re-register to receive a new one."
        ),
    }

    def _authenticate_user(self, username, password):
        """Override the parent's USERNAME_FIELD-based authenticate so we
        accept email. Returns the user or raises ``AuthenticationFailed``.

        Module 1 hardening: an account whose ``is_verified`` is still
        ``False`` is treated as "email_not_verified", regardless of
        whether the password matches. The frontend must route the user
        to the OTP screen instead of letting them into the dashboard.
        """
        if not username or not password:
            self.fail("no_active_account")
        user = authenticate(
            request=self.context.get("request"),
            username=username,
            password=password,
        )
        if user is None or not user.is_active:
            self.fail("no_active_account")
        # Admin / superuser accounts never go through the OTP sign-up
        # flow (``manage.py createsuperuser`` and the Django admin do
        # not issue a code), so exempt them from the is_verified gate.
        is_admin_user = (
            getattr(user, "is_superuser", False)
            or getattr(user, "role", None) == UserRole.ADMIN
        )
        if not is_admin_user and not getattr(user, "is_verified", False):
            self.fail("email_not_verified")
        return user

    def validate(self, attrs):
        # ``attrs`` already has ``email`` (from the parent's ``username_field``)
        # and ``password``. We add ``role`` (declared above) and
        # re-implement the parent's credential check to inject role-gating.
        request = self.context.get("request")
        authenticate_kwargs = {
            getattr(self, "username_field", "email"): attrs[self.username_field],
            "password": attrs["password"],
        }
        try:
            authenticate_kwargs["request"] = request
        except Exception:
            pass
        self.user = self._authenticate_user(
            attrs[self.username_field], attrs["password"]
        )
        if not self.user.role or self.user.role.lower() != attrs["role"].lower():
            self.fail("role_mismatch")
        refresh = self.get_token(self.user)
        return {"access": str(refresh.access_token), "refresh": str(refresh)}

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = getattr(user, "role", None)
        token["full_name"] = getattr(user, "full_name", "")
        token["is_verified"] = getattr(user, "is_verified", False)
        return token


# ====================================================================
# Customer registration
# ====================================================================
class CustomerRegisterSerializer(serializers.Serializer):
    """Customer sign-up body.

    Mirrors the spec's customer registration field list (full_name,
    email, phone, password, confirm_password, date_of_birth, gender,
    avatar, accept_terms).
    """

    full_name = serializers.CharField(max_length=150, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(
        max_length=20,
        validators=[BDPhoneValidator()],
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(
        choices=Gender.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    avatar = serializers.ImageField(required=False, allow_null=True)
    accept_terms = serializers.BooleanField()

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        # Use ``all_objects`` (not ``User.objects``) so unverified rows
        # are visible. The service layer (``AuthService.register_customer``)
        # decides whether to overwrite (unverified) or reject (verified).
        # Defaulting to the active-only manager here would mask the
        # upsert path and surface false "email_taken" errors to the
        # frontend for any half-provisioned row.
        if User.all_objects.filter(email__iexact=email).exists():
            row = User.all_objects.get(email__iexact=email)
            if row.is_verified:
                raise serializers.ValidationError(
                    "An account with this email already exists.",
                    code="email_taken",
                )
            # Unverified -- service layer will overwrite & re-issue OTP.
        return email

    def validate_password(self, value: str) -> str:
        # Reuse Django's auth validators (min length, common password,
        # similarity, numeric-only). Raises ``ValidationError`` on failure.
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                list(exc.messages),
                code="weak_password",
            ) from exc
        return value

    def validate_date_of_birth(self, value: date | None) -> date | None:
        _validate_age_13(value)
        return value

    def validate_accept_terms(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "You must accept the terms to continue.",
                code="terms_not_accepted",
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."},
                code="password_mismatch",
            )
        return attrs


# ====================================================================
# Vendor registration
# ====================================================================
class _BusinessAddressSerializer(serializers.Serializer):
    """Bangladesh-style business address -- used as a nested field on
    ``VendorRegisterSerializer``. JSON callers send a real nested object;
    multipart callers send a JSON-encoded string in the same field. The
    JSON-string decode happens in the parent's ``to_internal_value`` so the
    nested serializer's contract stays simple."""

    street = serializers.CharField(max_length=255)
    city = serializers.CharField(max_length=80)
    district = serializers.CharField(max_length=80)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")


class VendorRegisterSerializer(serializers.Serializer):
    """Vendor sign-up body -- all 4 steps collapsed for the API call.

    Multipart upload: ``trade_license_doc`` and ``nid_doc`` are required
    file fields. MIME-type validation happens at the model layer via
    ``FileMimeTypeValidator`` (set in ``models.py``).
    """

    # ---- step 1: personal ----
    owner_name = serializers.CharField(max_length=150, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(
        max_length=20,
        validators=[BDPhoneValidator()],
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    # ---- step 2: business ----
    business_name = serializers.CharField(max_length=180, trim_whitespace=True)
    business_type = serializers.ChoiceField(
        choices=BusinessType.choices,
        default=BusinessType.SOLE_PROP,
    )
    business_phone = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        validators=[BDPhoneValidator()],
    )
    trade_license_number = serializers.CharField(max_length=80)
    business_address = _BusinessAddressSerializer()

    # ---- step 3: documents ----
    trade_license_doc = serializers.FileField()
    nid_number = serializers.CharField(max_length=40)
    nid_doc = serializers.FileField()

    # ---- storefront ----
    store_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    store_description = serializers.CharField(required=False, allow_blank=True)
    store_contact_email = serializers.EmailField(required=False, allow_blank=True)
    vendor_return_policy = serializers.CharField(required=False, allow_blank=True)
    low_stock_threshold = serializers.IntegerField(
        required=False, min_value=1, max_value=32767, default=5,
    )

    # ---- step 4: consent ----
    accept_vendor_terms = serializers.BooleanField()

    def to_internal_value(self, data):
        """Decode the JSON-string ``business_address`` field posted by
        multipart clients. JSON callers send a real nested object, so the
        override is a no-op for them. We mutate a shallow copy of ``data``
        so the original (DRF QueryDict for multipart) is preserved.
        """
        import json as _json

        if hasattr(data, "getlist"):
            # ``QueryDict`` -- read the raw string value.
            raw = data.get("business_address")
        elif isinstance(data, dict):
            raw = data.get("business_address")
        else:
            raw = None

        if isinstance(raw, str) and raw:
            try:
                parsed = _json.loads(raw)
            except _json.JSONDecodeError as exc:
                raise serializers.ValidationError(
                    {"business_address": "Must be a JSON object."},
                    code="invalid",
                ) from exc
            if not isinstance(parsed, dict):
                raise serializers.ValidationError(
                    {"business_address": "Must be a JSON object."},
                    code="invalid",
                )
            # Build a mutable dict the parent can consume.
            if hasattr(data, "getlist"):
                # ``QueryDict``: copy via dict() then assign.
                new_data = {k: data.get(k) for k in data.keys()}
            else:
                new_data = dict(data) if isinstance(data, dict) else dict(data)
            new_data["business_address"] = parsed
            data = new_data
        return super().to_internal_value(data)

    def validate_email(self, value: str) -> str:
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists.",
                code="email_taken",
            )
        return email

    def validate_password(self, value: str) -> str:
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                list(exc.messages),
                code="weak_password",
            ) from exc
        return value

    def validate_accept_vendor_terms(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "You must accept the vendor terms to continue.",
                code="vendor_terms_not_accepted",
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."},
                code="password_mismatch",
            )
        # Default store_name to business_name if blank so the slug-gen
        # in VendorProfile.save() has something to work with.
        if not attrs.get("store_name"):
            attrs["store_name"] = attrs["business_name"]
        return attrs


# ====================================================================
# Profile (GET / PATCH /api/v1/auth/profile/)
# ====================================================================
class UserInlineSerializer(serializers.ModelSerializer):
    """Tiny public-user shape -- used wherever a foreign-key to User is
    embedded in another resource (reviews, comments, etc.).  Only the
    non-sensitive fields are exposed; callers wanting the full profile
    should hit ``/api/v1/auth/profile/``."""

    avatar = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ("id", "full_name", "email", "avatar", "date_joined")
        read_only_fields = fields

    def get_avatar(self, obj):
        avatar = getattr(obj, "avatar", None)
        if not avatar:
            return None
        request = self.context.get("request")
        try:
            url = avatar.url
        except ValueError:
            return None
        return request.build_absolute_uri(url) if request else url


class UserProfileSerializer(serializers.ModelSerializer):
    """Customer-facing profile serializer (used for PATCH and read)."""

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "email",
            "full_name",
            "phone",
            "role",
            "date_of_birth",
            "gender",
            "avatar",
            "is_active",
            "date_joined",
        )
        read_only_fields = ("id", "email", "role", "is_active", "date_joined")

    def validate_phone(self, value: str) -> str:
        if not value:
            return value
        BDPhoneValidator()(value)
        return value

    def validate_date_of_birth(self, value):
        _validate_age_13(value)
        return value


# ====================================================================
# Vendor profile (GET / PATCH store fields)
# ====================================================================
class VendorProfileSerializer(serializers.ModelSerializer):
    """Vendor-facing profile serializer.

    ``status`` and ``rejection_reason`` are read-only -- staff change
    them via the admin queue, not via the API.
    """

    business_address = serializers.JSONField()

    class Meta:
        model = VendorProfile
        fields = (
            "id",
            "business_name",
            "owner_name",
            "business_type",
            "business_phone",
            "trade_license_number",
            "business_address",
            "status",
            "rejection_reason",
            "store_name",
            "store_slug",
            "store_description",
            "store_contact_email",
            "store_logo",
            "store_banner",
            "vendor_return_policy",
            "low_stock_threshold",
            "approved_at",
        )
        read_only_fields = (
            "id",
            "status",
            "rejection_reason",
            "store_slug",
            "approved_at",
        )


# ====================================================================
# Token response
# ====================================================================
class TokenResponseSerializer(serializers.Serializer):
    """{access, refresh, user} -- what the login view returns.

    Lives here so the OpenAPI schema documents the shape; views build
    the payload via :func:`AuthService.issue_tokens` + the
    ``UserProfileSerializer``.
    """

    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)
    user = UserProfileSerializer(read_only=True)


# ====================================================================
# Vendor document resubmission (PATCH /api/v1/auth/vendor/documents/)
# ====================================================================
class VendorDocumentUploadSerializer(serializers.Serializer):
    """Resubmit KYC documents after INFO_REQUESTED / REJECTED."""

    trade_license_doc = serializers.FileField(required=False)
    nid_doc = serializers.FileField(required=False)

    def validate(self, attrs):
        if not attrs.get("trade_license_doc") and not attrs.get("nid_doc"):
            raise serializers.ValidationError(
                "Provide at least one document (trade license or NID).",
                code="no_documents",
            )
        return attrs


# ====================================================================
# SimpleJWT re-export — referenced from ``settings/base.py``:
#   ``SIMPLE_JWT['TOKEN_OBTAIN_SERIALIZER'] = 'apps.accounts.serializers.JWTClaimsSerializer'``
# so the standard ``/api/v1/auth/token/refresh/`` endpoint keeps the
# custom ``role`` / ``full_name`` claims in the issued access token.
# ====================================================================
class JWTClaimsSerializer(TokenObtainPairSerializer):
    """SimpleJWT serializer that decorates the access token with our
    custom claims. Used by the built-in ``/token/refresh/`` endpoint."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = getattr(user, "role", None)
        token["full_name"] = getattr(user, "full_name", "")
        token["is_verified"] = getattr(user, "is_verified", False)
        return token


# ====================================================================
# Module 9 — Admin user management
# ====================================================================
class AdminUserSerializer(serializers.ModelSerializer):
    """Admin-facing user serializer.

    Surfaces every field the admin Users page needs (including the
    lockout counters and ``is_locked`` flag from Module 9 security).
    Sensitive fields (password hash) are intentionally not exposed.
    """

    is_locked = serializers.BooleanField(read_only=True)
    failed_login_attempts = serializers.IntegerField(read_only=True)
    last_failed_login = serializers.DateTimeField(read_only=True)
    vendor_status = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = (
            "id",
            "email",
            "full_name",
            "phone",
            "role",
            "is_active",
            "is_staff",
            "is_locked",
            "failed_login_attempts",
            "last_failed_login",
            "date_joined",
            "last_login",
            "vendor_status",
        )
        read_only_fields = fields

    def get_vendor_status(self, obj: CustomUser):
        profile = getattr(obj, "vendor_profile", None)
        return profile.status if profile is not None else None


class AdminUserRoleChangeSerializer(serializers.Serializer):
    """Body for ``PATCH /admin/users/{id}/change-role/``."""

    role = serializers.ChoiceField(choices=[r.value for r in UserRole])


# ====================================================================
# Module 9 — admin vendor approval queue
# ====================================================================
class AdminVendorApplicationSerializer(serializers.ModelSerializer):
    """Vendor application row for ``GET /admin/vendors/`` + pending list.

    Read-only. Combines VendorProfile fields with the vendor user's
    account info (joined via select_related in the view).
    """

    vendor_id = serializers.UUIDField(source="pk", read_only=True)
    user_id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    is_user_active = serializers.BooleanField(source="user.is_active", read_only=True)
    status = serializers.CharField(read_only=True)
    business_type = serializers.CharField(read_only=True)
    rejection_reason = serializers.CharField(read_only=True, allow_blank=True)
    approved_at = serializers.DateTimeField(read_only=True)
    approved_by = serializers.SerializerMethodField()
    trade_license_doc = serializers.SerializerMethodField()
    nid_doc = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = VendorProfile
        fields = (
            "vendor_id",
            "user_id",
            "email",
            "full_name",
            "phone",
            "is_user_active",
            "status",
            "business_name",
            "business_type",
            "trade_license_number",
            "trade_license_doc",
            "nid_doc",
            "business_address",
            "store_name",
            "store_slug",
            "store_description",
            "store_contact_email",
            "rejection_reason",
            "approved_at",
            "approved_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_approved_by(self, obj: VendorProfile):
        return str(obj.approved_by_id) if obj.approved_by_id else None

    @staticmethod
    def _absolute_file_url(serializer, obj, field_name):
        """Return an absolute URL for a ``FileField`` (or ``None``).

        Mirrors :meth:`UserInlineSerializer.get_avatar`: swallows
        ``ValueError`` raised by ``FileField.url`` when no file has
        been uploaded yet, and falls back to a relative URL when no
        request is in the serializer context.
        """
        file_field = getattr(obj, field_name, None)
        if not file_field:
            return None
        try:
            url = file_field.url
        except ValueError:
            return None
        request = serializer.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def get_trade_license_doc(self, obj: VendorProfile):
        return self._absolute_file_url(self, obj, "trade_license_doc")

    def get_nid_doc(self, obj: VendorProfile):
        return self._absolute_file_url(self, obj, "nid_doc")


class AdminVendorRejectSerializer(serializers.Serializer):
    """Body for ``POST /admin/vendors/{id}/reject/`` — reason is required."""

    reason = serializers.CharField(min_length=3, max_length=2000, trim_whitespace=True)

# ─────────────────────── OTP / email-verification ───────────────────────
class VerifyOTPSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/auth/verify-email/``.

    Two fields only: the email (used to look up the user) + the 6-digit
    numeric code. ``email`` is case-normalised in ``validate_email``.
    """

    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_code(self, value: str) -> str:
        v = value.strip()
        if not v.isdigit():
            raise serializers.ValidationError(_("Code must be digits only."))
        return v


class RequestOTPResendSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/auth/resend-otp/`` -- email only.

    Used both by the signup flow (re-request the first code) and by
    future password-reset flows (request the reset code).
    """

    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class ChangePasswordSerializer(serializers.Serializer):
    """Body for ``POST /api/v1/auth/change-password/`` (authenticated).

    Mirrors Django's built-in ``PasswordChangeForm`` shape but accepts a
    flat JSON body so the frontend can submit it via axios. We re-validate
    the new password against Django's auth validators (min length, common
    password, similarity, numeric-only) so a weak password is rejected at
    the API boundary instead of relying on the client.
    """

    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8)
    confirm_new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError(
                _("Current password is incorrect."),
                code="invalid_current_password",
            )
        return value

    def validate_new_password(self, value: str) -> str:
        # Reuse the same validators as registration so the policy is
        # uniform: min length 8, not in the common-password list, not
        # entirely numeric, not too similar to the user's personal info.
        user = self.context["request"].user
        try:
            validate_password(value, user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                list(exc.messages),
                code="weak_password",
            ) from exc
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError(
                {"confirm_new_password": "Passwords do not match."},
                code="password_mismatch",
            )
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password must be different from the current one."},
                code="same_password",
            )
        return attrs
