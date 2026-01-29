from django.urls import path

from .views import (
    TripPlanView,
    LocationAutocompleteView,
    TripHistoryView,
    TripHistoryDetailView,
    TripLogbookView,
)


app_name = "trips"


urlpatterns = [
    path("plan/", TripPlanView.as_view(), name="plan"),
    path("autocomplete/", LocationAutocompleteView.as_view(), name="autocomplete"),
    path("history/", TripHistoryView.as_view(), name="history"),
    path("history/<int:trip_id>/", TripHistoryDetailView.as_view(), name="history-detail"),
    path("<int:trip_id>/logbooks/", TripLogbookView.as_view(), name="logbooks"),
]

