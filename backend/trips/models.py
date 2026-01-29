from django.db import models
from django.conf import settings


class Placeholder(models.Model):
    """
    Placeholder model to keep app migrations consistent.
    """

    created_at = models.DateTimeField(auto_now_add=True)


class TripPlan(models.Model):
    """
    Persisted trip plan history for a user.
    Stores both the request and the computed response as JSON.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trip_plans"
    )

    # Request fields
    current_location = models.CharField(max_length=255)
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    current_cycle_hours_used = models.FloatField()
    departure_datetime = models.DateTimeField(null=True, blank=True)

    # Stored computed plan payload (validated shape from TripPlanResponseSerializer)
    response_payload = models.JSONField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class DailyLogbook(models.Model):
    """
    Per‑day logbook page for a planned trip.
    Stores the driver's handwritten‑style answers that appear on the PDF/SVG:
    header info (From/To, carrier, terminal, etc.), recap, remarks, and any
    other structured fields you decide to capture on the frontend.

    Longer trips can have multiple logbook pages for the same trip plan, and
    even multiple pages for the same calendar date (index field).
    """

    trip_plan = models.ForeignKey(
        TripPlan, on_delete=models.CASCADE, related_name="logbooks"
    )
    # Date shown on the log form
    date = models.DateField()
    # For multi‑page days, 1‑based index: 1, 2, 3, ...
    index = models.PositiveIntegerField(default=1)

    # Arbitrary structured answers – the frontend can send a JSON object such as:
    # {
    #   "from_location": "...",
    #   "to_location": "...",
    #   "carrier_name": "...",
    #   "main_office_address": "...",
    #   "home_terminal_address": "...",
    #   "truck_numbers": "...",
    #   "total_miles_driving_today": "...",
    #   ...
    # }
    form_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["trip_plan", "date", "index"]
        unique_together = ("trip_plan", "date", "index")

    def __str__(self) -> str:  # pragma: no cover - convenience only
        return f"Logbook {self.trip_plan_id} {self.date} (#{self.index})"

