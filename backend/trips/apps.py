from django.apps import AppConfig


class TripsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    # App lives in the top-level "trips" package (under backend/ on disk)
    name = "trips"

