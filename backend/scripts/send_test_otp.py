"""End-to-end OTP delivery smoke test.

Hits the same register_customer path the frontend uses. After this script
returns, check /tmp/celery.log for the
"[INFO] apps.accounts.tasks.send_verification_email ... notified=N" line.

Usage:
    python manage.py shell < scripts/send_test_otp.py
"""
from apps.accounts.models import CustomUser, CustomerProfile
from apps.accounts.services import AuthService, AuthServiceError

EMAIL = "saikot.emon16@gmail.com"
PASSWORD = "Test1234!pwd"

u = CustomUser.all_objects.filter(email=EMAIL).first()
if u is None:
    u = CustomUser.objects.create_user(
        email=EMAIL,
        password=PASSWORD,
        full_name="Live OTP Test",
        phone="01700000000",
    )
    CustomerProfile.objects.create(user=u)
    print(f"created user id={u.id}")
else:
    print(f"existing user id={u.id} active={u.is_active} verified={u.is_verified}")
    # Reset to unverified so register_customer takes the upsert branch.
    u.is_active = False
    u.is_verified = False
    u.save(update_fields=["is_active", "is_verified"])

payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "full_name": "Live OTP Test",
    "phone": "01700000000",
}

user, _profile = AuthService.register_customer(payload)
print(f"register_customer ok user_id={user.id} active={user.is_active} verified={user.is_verified}")
