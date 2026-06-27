from django.contrib import admin

from apps.accounts.models import CustomUser, CustomerProfile, VendorProfile


@admin.register(CustomUser)
class CustomUserAdmin(admin.ModelAdmin):
    list_display = ("email", "full_name", "role", "is_verified", "is_active", "date_joined")
    list_filter = ("role", "is_verified", "is_active", "is_staff")
    search_fields = ("email", "full_name", "phone")
    ordering = ("-date_joined",)
    readonly_fields = ("date_joined", "last_login")


@admin.register(CustomerProfile)
class CustomerProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "loyalty_points", "created_at")
    search_fields = ("user__email",)


@admin.register(VendorProfile)
class VendorProfileAdmin(admin.ModelAdmin):
    list_display = ("store_name", "store_slug", "user", "status", "approved_at")
    list_filter = ("status", "business_type")
    search_fields = ("store_name", "store_slug", "user__email", "trade_license_no")