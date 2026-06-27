from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    verbose_name = "Accounts & Auth"

    def ready(self) -> None:
        # Connect signal handlers (post_save → ensure_profile_for_role).
        # Wrapping the import in ready() is the canonical Django pattern:
        # the decorator runs at import time, so without this the handler
        # wouldn't be wired up.
        from . import signals  # noqa: F401 -- import side effect only