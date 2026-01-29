from rest_framework import serializers


class TripRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_hours_used = serializers.FloatField(
        min_value=0,
        max_value=70,
        default=0,
        required=False,
    )


class StopSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=["pickup", "dropoff", "fuel", "break", "off_duty", "restart"]
    )
    lat = serializers.FloatField()
    lon = serializers.FloatField()
    time_iso = serializers.DateTimeField()
    description = serializers.CharField()


class DutySegmentSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["OFF", "SB", "D", "ON"])
    start_iso = serializers.DateTimeField()
    end_iso = serializers.DateTimeField()


class RemarkEventSerializer(serializers.Serializer):
    start_iso = serializers.DateTimeField()
    end_iso = serializers.DateTimeField(required=False, allow_null=True)
    type = serializers.ChoiceField(
        choices=["pickup", "dropoff", "fuel", "break", "end_of_day", "restart", "drive"]
    )
    location = serializers.CharField()
    reason = serializers.CharField()


class DailyLogSerializer(serializers.Serializer):
    date = serializers.DateField()
    segments = DutySegmentSerializer(many=True)
    remark_events = RemarkEventSerializer(many=True, required=False)


class WaypointSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=["start", "pickup", "dropoff", "fuel", "break", "end_of_day", "restart"]
    )
    lng = serializers.FloatField()
    lat = serializers.FloatField()
    label = serializers.CharField()


class TripPlanResponseSerializer(serializers.Serializer):
    distance_m = serializers.FloatField()
    duration_s = serializers.FloatField()
    geometry = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField())
    )
    stops = StopSerializer(many=True)
    waypoints = WaypointSerializer(many=True, required=False)
    logs = DailyLogSerializer(many=True)
    instructions = serializers.ListField(child=serializers.CharField())


class TripPlanHistoryItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_hours_used = serializers.FloatField()
    departure_datetime = serializers.DateTimeField(allow_null=True, required=False)


class TripPlanHistoryDetailSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_hours_used = serializers.FloatField()
    departure_datetime = serializers.DateTimeField(allow_null=True, required=False)
    plan = TripPlanResponseSerializer()


class DailyLogbookUpsertSerializer(serializers.Serializer):
    """
    Payload the frontend sends when saving a single daily logbook page.
    """

    date = serializers.DateField()
    # 1‑based page index for that calendar date within a trip.
    index = serializers.IntegerField(min_value=1, required=False, default=1)
    # Arbitrary structured answers; values are usually short strings.
    form_data = serializers.DictField(
        child=serializers.CharField(allow_blank=True), required=False
    )


class DailyLogbookSerializer(serializers.Serializer):
    """
    Shape returned to the frontend when reading a saved logbook page.
    """

    id = serializers.IntegerField()
    date = serializers.DateField()
    index = serializers.IntegerField()
    form_data = serializers.DictField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

