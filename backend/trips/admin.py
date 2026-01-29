from django.contrib import admin
from .models import Placeholder, TripPlan, DailyLogbook


@admin.register(Placeholder)
class PlaceholderAdmin(admin.ModelAdmin):
    """Admin for Placeholder model"""

    list_display = ("id", "created_at")
    list_filter = ("created_at",)
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"


class DailyLogbookInline(admin.TabularInline):
    model = DailyLogbook
    extra = 0
    fields = ("date", "index", "form_data", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    ordering = ("date", "index")


@admin.register(TripPlan)
class TripPlanAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "created_at",
        "current_location",
        "pickup_location",
        "dropoff_location",
        "current_cycle_hours_used",
    )
    list_filter = ("created_at",)
    search_fields = (
        "user__username",
        "current_location",
        "pickup_location",
        "dropoff_location",
    )
    readonly_fields = ("created_at",)
    inlines = [DailyLogbookInline]


@admin.register(DailyLogbook)
class DailyLogbookAdmin(admin.ModelAdmin):
    list_display = ("id", "trip_plan", "date", "index", "created_at", "updated_at")
    list_filter = ("date", "created_at")
    search_fields = ("trip_plan__id", "trip_plan__user__username")
    ordering = ("-created_at",)