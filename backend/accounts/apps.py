from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    # App lives in the top-level "accounts" package (under backend/ on disk)
    name = "accounts"

