import math
from datetime import datetime, timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    TripRequestSerializer,
    TripPlanResponseSerializer,
    TripPlanHistoryItemSerializer,
    TripPlanHistoryDetailSerializer,
    DailyLogbookUpsertSerializer,
    DailyLogbookSerializer,
)
from .mapbox_service import geocode_place, get_route, reverse_geocode, autocomplete_places, MapboxError
from .hos_engine import plan_hos_schedule
from .models import TripPlan, DailyLogbook


def _drive_fraction_at(segments, dt):
    """
    Return fraction (0..1) of total drive completed by time dt.
    Uses only 'D' (driving) segments so end-of-day is placed by distance driven, not clock time.
    Returns None if no driving segments.
    """
    if not segments:
        return None
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None
    total_drive_s = 0.0
    drive_before_s = 0.0
    for seg in segments:
        if seg.get("status") != "D":
            continue
        start_str = seg.get("start_iso") or ""
        end_str = seg.get("end_iso") or ""
        if not start_str or not end_str:
            continue
        try:
            start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            dur_s = (end_dt - start_dt).total_seconds()
            if dur_s <= 0:
                continue
            total_drive_s += dur_s
            if end_dt <= dt:
                drive_before_s += dur_s
            elif start_dt < dt < end_dt:
                drive_before_s += (dt - start_dt).total_seconds()
        except Exception:
            continue
    if total_drive_s <= 0:
        return None
    return max(0.0, min(1.0, drive_before_s / total_drive_s))


def _interpolate_route(geometry, fraction):
    """Return [lon, lat] at fraction (0..1) along the route. Uses distance-weighted interpolation."""
    if not geometry or fraction <= 0:
        return geometry[0][:2] if geometry else [0.0, 0.0]
    if fraction >= 1:
        return geometry[-1][:2] if geometry else [0.0, 0.0]
    # Cumulative distances (approximate, in degree units)
    cumul = [0.0]
    for i in range(1, len(geometry)):
        a, b = geometry[i - 1], geometry[i]
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        cumul.append(cumul[-1] + seg)
    total = cumul[-1]
    if total <= 0:
        return geometry[0][:2]
    target = fraction * total
    for i in range(len(cumul) - 1):
        if cumul[i + 1] >= target:
            t = (target - cumul[i]) / (cumul[i + 1] - cumul[i]) if cumul[i + 1] > cumul[i] else 1.0
            lon = geometry[i][0] + t * (geometry[i + 1][0] - geometry[i][0])
            lat = geometry[i][1] + t * (geometry[i + 1][1] - geometry[i][1])
            return [lon, lat]
    return geometry[-1][:2]


def _parse_instruction(line):
    """Parse 'ISO: text' into (datetime or None, type or None, label). Types: pickup, dropoff, fuel, break, end_of_day, restart."""
    idx = line.find(": ")
    if idx <= 0:
        return None, None, ""
    time_str = line[:idx].replace("Z", "+00:00")
    text = line[idx + 2 :].strip()
    try:
        dt = datetime.fromisoformat(time_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None, None, text
    # Normalize unicode dashes/hyphens to ASCII so "Drop‑off" and "Drop–off" match
    clean = (
        text.replace("\u2010", "-")  # hyphen
        .replace("\u2011", "-")  # non-breaking hyphen
        .replace("\u2012", "-")  # figure dash
        .replace("\u2013", "-")  # en dash
        .replace("\u2014", "-")  # em dash
        .lower()
    )
    if "pickup" in clean and "1 hour" in clean:
        return dt, "pickup", "Pickup"
    if "drop-off" in clean or "drop off" in clean:
        return dt, "dropoff", "Drop-off"
    if "fuel stop" in clean:
        return dt, "fuel", "Fuel stop"
    if "minute break" in clean:
        return dt, "break", "Break"
    if "end of day" in clean:
        return dt, "end_of_day", "End of day"
    if "34" in clean and "restart" in clean:
        return dt, "restart", "34-hour restart"
    return dt, None, text


def _build_waypoints(
    instructions,
    segments,
    departure,
    geometry,
    current_lon,
    current_lat,
    pickup_lon,
    pickup_lat,
    drop_lon,
    drop_lat,
    current_location_label,
):
    """Build list of waypoint dicts: { type, lng, lat, label } for map markers."""
    waypoints = []
    # Start marker (current location)
    waypoints.append({
        "type": "start",
        "lng": current_lon,
        "lat": current_lat,
        "label": current_location_label or "Start",
    })
    if not segments:
        # Dropoff only if no segments
        waypoints.append({
            "type": "dropoff",
            "lng": drop_lon,
            "lat": drop_lat,
            "label": "Drop-off",
        })
        return waypoints
    trip_end_str = segments[-1].get("end_iso")
    try:
        trip_end = datetime.fromisoformat(trip_end_str.replace("Z", "+00:00"))
        if trip_end.tzinfo is None:
            trip_end = trip_end.replace(tzinfo=timezone.utc)
    except Exception:
        trip_end = departure
    trip_duration_s = max((trip_end - departure).total_seconds(), 1.0)
    # Parse instructions and add waypoints for pickup, dropoff, fuel, break, end_of_day, restart
    has_dropoff = False
    for line in instructions:
        dt, wtype, label = _parse_instruction(line)
        if dt is None or wtype is None:
            continue
        if wtype == "pickup":
            waypoints.append({"type": "pickup", "lng": pickup_lon, "lat": pickup_lat, "label": label})
            continue
        if wtype == "dropoff":
            waypoints.append({"type": "dropoff", "lng": drop_lon, "lat": drop_lat, "label": label})
            has_dropoff = True
            continue
        # Interpolate along route by drive fraction (distance driven), not clock time,
        # so end-of-day after 11h drive is at ~85% of route (Alabama), not ~52% (Jackson).
        fraction = _drive_fraction_at(segments, dt)
        if fraction is None:
            elapsed = (dt - departure).total_seconds()
            fraction = max(0.0, min(1.0, elapsed / trip_duration_s))
        lon, lat = _interpolate_route(geometry, fraction)
        waypoints.append({"type": wtype, "lng": lon, "lat": lat, "label": label})
    # Ensure dropoff marker is always present (e.g. if instruction text format changed)
    if not has_dropoff:
        waypoints.append({
            "type": "dropoff",
            "lng": drop_lon,
            "lat": drop_lat,
            "label": "Drop-off",
        })
    return waypoints


def _remark_end_time(dt, wtype):
    """Return end datetime for a remark event (start + duration by type)."""
    from datetime import timedelta
    if wtype == "pickup" or wtype == "dropoff":
        return dt + timedelta(hours=1)
    if wtype == "fuel" or wtype == "break":
        return dt + timedelta(minutes=30)
    if wtype == "end_of_day":
        return dt + timedelta(hours=10)
    if wtype == "restart":
        return dt + timedelta(hours=34)
    return None


def _build_remark_events(
    instructions,
    current_location,
    pickup_location,
    dropoff_location,
    geometry=None,
    departure=None,
    trip_duration_s=None,
    segments=None,
):
    """Build per-date remark events for the logbook: { date: [ { start_iso, end_iso?, type, location, reason } ] }.
    For fuel/break/end_of_day, interpolates position by drive fraction and reverse-geocodes to get City, State."""
    events_by_date = {}
    for line in instructions:
        dt, wtype, label = _parse_instruction(line)
        if dt is None or wtype is None:
            continue
        date_key = dt.date().isoformat()
        if date_key not in events_by_date:
            events_by_date[date_key] = []
        if wtype == "pickup":
            location = pickup_location or ""
        elif wtype == "dropoff":
            location = dropoff_location or ""
        elif wtype in ("fuel", "break"):
            location = _location_for_route_event(
                dt, geometry, departure, trip_duration_s, segments=segments, fallback="En route"
            )
        elif wtype == "end_of_day":
            location = _location_for_route_event(
                dt, geometry, departure, trip_duration_s, segments=segments, fallback="Off duty"
            )
        elif wtype == "restart":
            location = _location_for_route_event(
                dt, geometry, departure, trip_duration_s, segments=segments, fallback="Off duty"
            )
        else:
            location = current_location or ""
        start_iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt.tzinfo else dt.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_dt = _remark_end_time(dt, wtype)
        if end_dt:
            end_dt = end_dt.astimezone(timezone.utc) if end_dt.tzinfo else end_dt.replace(tzinfo=timezone.utc)
            end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        else:
            end_iso = None
        events_by_date[date_key].append({
            "start_iso": start_iso,
            "end_iso": end_iso,
            "type": wtype,
            "location": location,
            "reason": label,
        })
    return events_by_date


def _location_for_route_event(dt, geometry, departure, trip_duration_s, segments=None, fallback=""):
    """Interpolate position at dt along route (by drive fraction) and return reverse-geocoded 'City, State' or fallback."""
    if not geometry:
        return fallback
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        fraction = _drive_fraction_at(segments or [], dt)
        if fraction is None and departure is not None and trip_duration_s and trip_duration_s > 0:
            elapsed = (dt - departure).total_seconds()
            fraction = max(0.0, min(1.0, elapsed / trip_duration_s))
        if fraction is None:
            return fallback
        lon, lat = _interpolate_route(geometry, fraction)
        location = reverse_geocode(lon, lat)
        return location if location else fallback
    except Exception:
        return fallback


class TripPlanView(APIView):
    """
    POST /api/trips/plan
    Authenticated endpoint that returns a trip plan including route info,
    HOS‑compliant daily logs, and high‑level instructions.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = TripRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        current_location = data["current_location"]
        pickup_location = data["pickup_location"]
        dropoff_location = data["dropoff_location"]
        current_cycle_hours_used = data.get("current_cycle_hours_used", 0.0)

        # Fixed departure time: 07:00 (00 GMT / UTC). Removed from user inputs.
        # Use today's date in UTC with a fixed 07:00 start.
        departure = datetime.now(timezone.utc).replace(
            hour=7, minute=0, second=0, microsecond=0
        )

        try:
            current_lat, current_lon = geocode_place(current_location)
            pickup_lat, pickup_lon = geocode_place(pickup_location)
            drop_lat, drop_lon = geocode_place(dropoff_location)
        except MapboxError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        # Full route: current -> pickup -> dropoff
        coords = [
            (current_lat, current_lon),
            (pickup_lat, pickup_lon),
            (drop_lat, drop_lon),
        ]

        try:
            route = get_route(coords)
        except MapboxError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        # Approximate miles and hours
        distance_m = route["distance_m"]
        duration_s = route["duration_s"]
        distance_miles = distance_m / 1609.34
        duration_hours = max(duration_s / 3600.0, 0.1)

        # When route has 2 legs (current→pickup, pickup→dropoff), drive to pickup first, then 1h pickup, then drive to dropoff.
        legs = route.get("legs") or []
        hos_result = plan_hos_schedule(
            distance_miles=distance_miles,
            duration_hours=duration_hours,
            departure=departure,
            current_cycle_hours_used=current_cycle_hours_used,
            legs=legs if len(legs) == 2 else None,
        )

        waypoints = _build_waypoints(
            instructions=hos_result["instructions"],
            segments=hos_result.get("segments", []),
            departure=departure,
            geometry=route["geometry"],
            current_lon=current_lon,
            current_lat=current_lat,
            pickup_lon=pickup_lon,
            pickup_lat=pickup_lat,
            drop_lon=drop_lon,
            drop_lat=drop_lat,
            current_location_label=current_location,
        )

        segments = hos_result.get("segments", [])
        trip_duration_s = None
        if segments:
            trip_end_str = segments[-1].get("end_iso")
            try:
                trip_end = datetime.fromisoformat(trip_end_str.replace("Z", "+00:00"))
                if trip_end.tzinfo is None:
                    trip_end = trip_end.replace(tzinfo=timezone.utc)
                trip_duration_s = max((trip_end - departure).total_seconds(), 1.0)
            except Exception:
                trip_duration_s = max(duration_s, 1.0)
        else:
            trip_duration_s = max(duration_s, 1.0)

        remark_events_by_date = _build_remark_events(
            hos_result["instructions"],
            current_location,
            pickup_location,
            dropoff_location,
            geometry=route["geometry"],
            departure=departure,
            trip_duration_s=trip_duration_s,
            segments=hos_result.get("segments", []),
        )
        daily_logs_with_remarks = [
            {
                **daily,
                "remark_events": remark_events_by_date.get(daily.get("date", ""), []),
            }
            for daily in hos_result["daily_logs"]
        ]

        response_payload = {
            "distance_m": distance_m,
            "duration_s": duration_s,
            "geometry": route["geometry"],
            "stops": [],
            "waypoints": waypoints,
            "logs": daily_logs_with_remarks,
            "instructions": hos_result["instructions"],
        }

        # Normalize ISO datetimes: use "+00:00" instead of "Z" so DRF/Django parse on all Python versions.
        for log in response_payload["logs"]:
            for seg in log.get("segments", []):
                for key in ("start_iso", "end_iso"):
                    if isinstance(seg.get(key), str):
                        seg[key] = seg[key].replace("Z", "+00:00")
            for ev in log.get("remark_events", []):
                for key in ("start_iso", "end_iso"):
                    if ev.get(key) and isinstance(ev[key], str):
                        ev[key] = ev[key].replace("Z", "+00:00")

        out_serializer = TripPlanResponseSerializer(data=response_payload)
        if not out_serializer.is_valid():
            # Flatten nested validation errors for a readable message.
            def flatten_errors(errors, prefix=""):
                parts = []
                if isinstance(errors, dict):
                    for k, v in errors.items():
                        parts.extend(flatten_errors(v, f"{prefix}.{k}" if prefix else k))
                elif isinstance(errors, list):
                    for i, v in enumerate(errors):
                        parts.extend(flatten_errors(v, f"{prefix}[{i}]" if prefix else str(i)))
                else:
                    parts.append(f"{prefix}: {errors}" if prefix else str(errors))
                return parts

            detail = "; ".join(flatten_errors(out_serializer.errors))
            return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)

        trip_plan = TripPlan.objects.create(
            user=request.user,
            current_location=current_location,
            pickup_location=pickup_location,
            dropoff_location=dropoff_location,
            current_cycle_hours_used=current_cycle_hours_used,
            departure_datetime=departure,
            response_payload=out_serializer.data,
        )
        # Pre‑create one DailyLogbook row per HOS day so the "View logs"
        # screen can immediately show editable pages for this trip.
        # We start with index=1 and empty form_data; the driver can later
        # update each page via TripLogbookView.
        for daily in hos_result.get("daily_logs", []):
            day_str = daily.get("date")
            if not day_str:
                continue
            try:
                # Parse ISO date string (YYYY‑MM‑DD) using datetime.date.fromisoformat
                from datetime import date as _date  # local import to avoid top‑level clash

                parsed = _date.fromisoformat(day_str)
            except Exception:
                continue
            DailyLogbook.objects.get_or_create(
                trip_plan=trip_plan,
                date=parsed,
                index=1,
                defaults={"form_data": {}},
            )

        return Response({**out_serializer.data, "trip_id": trip_plan.id})


class TripHistoryView(APIView):
    """
    GET /api/trips/history/?limit=10
    Returns the authenticated user's saved trip plans (latest first).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        limit = int(request.query_params.get("limit", "10"))
        limit = max(1, min(limit, 100))

        qs = TripPlan.objects.filter(user=request.user).order_by("-created_at")[:limit]
        items = [
            {
                "id": tp.id,
                "created_at": tp.created_at,
                "current_location": tp.current_location,
                "pickup_location": tp.pickup_location,
                "dropoff_location": tp.dropoff_location,
                "current_cycle_hours_used": tp.current_cycle_hours_used,
                "departure_datetime": tp.departure_datetime,
            }
            for tp in qs
        ]
        serializer = TripPlanHistoryItemSerializer(data=items, many=True)
        serializer.is_valid(raise_exception=True)
        return Response({"results": serializer.data})


class TripHistoryDetailView(APIView):
    """
    GET /api/trips/history/<id>/
    Returns one saved trip plan (only if it belongs to the authenticated user).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, trip_id: int, *args, **kwargs):
        try:
            tp = TripPlan.objects.get(id=trip_id, user=request.user)
        except TripPlan.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        payload = {
            "id": tp.id,
            "created_at": tp.created_at,
            "current_location": tp.current_location,
            "pickup_location": tp.pickup_location,
            "dropoff_location": tp.dropoff_location,
            "current_cycle_hours_used": tp.current_cycle_hours_used,
            "departure_datetime": tp.departure_datetime,
            "plan": tp.response_payload,
        }

        serializer = TripPlanHistoryDetailSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)


class LocationAutocompleteView(APIView):
    """
    GET /api/trips/autocomplete?q=query
    Authenticated endpoint that returns location autocomplete suggestions.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        query = request.query_params.get("q", "").strip()
        limit = int(request.query_params.get("limit", "5"))

        if not query or len(query) < 2:
            return Response({"suggestions": []})

        try:
            suggestions = autocomplete_places(query, limit=limit)
            return Response({"suggestions": suggestions})
        except MapboxError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


class TripLogbookView(APIView):
    """
    POST /api/trips/<trip_id>/logbooks/
    - Creates or updates a single daily logbook page for the given trip.
      Use this when the driver fills out the questions on the right‑hand side.

    GET /api/trips/<trip_id>/logbooks/
    - Returns all saved logbook pages for that trip (useful when re‑loading).
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_trip(self, request, trip_id: int) -> TripPlan:
        try:
            return TripPlan.objects.get(id=trip_id, user=request.user)
        except TripPlan.DoesNotExist:
            raise  # Let caller handle and convert to HTTP 404

    def post(self, request, trip_id: int, *args, **kwargs):
        try:
            trip = self._get_trip(request, trip_id)
        except TripPlan.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = DailyLogbookUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        date = data["date"]
        index = data.get("index", 1)
        # IMPORTANT: don't overwrite the whole JSON blob with a partial payload.
        # The frontend often sends only the fields the driver just edited.
        logbook, created = DailyLogbook.objects.get_or_create(
            trip_plan=trip,
            date=date,
            index=index,
            defaults={"form_data": data.get("form_data", {}) if "form_data" in data else {}},
        )
        if not created and "form_data" in data:
            incoming = data.get("form_data") or {}
            merged = {**(logbook.form_data or {}), **incoming}
            logbook.form_data = merged
            logbook.save(update_fields=["form_data", "updated_at"])

        out_payload = {
            "id": logbook.id,
            "date": logbook.date,
            "index": logbook.index,
            "form_data": logbook.form_data,
            "created_at": logbook.created_at,
            "updated_at": logbook.updated_at,
        }
        out = DailyLogbookSerializer(data=out_payload)
        out.is_valid(raise_exception=True)
        return Response(out.data, status=status.HTTP_200_OK)

    def get(self, request, trip_id: int, *args, **kwargs):
        try:
            trip = self._get_trip(request, trip_id)
        except TripPlan.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Optional filters
        date_str = request.query_params.get("date")
        qs = DailyLogbook.objects.filter(trip_plan=trip).order_by("date", "index")
        if date_str:
            try:
                # Let DRF's DateField parse for us via a tiny serializer.
                tmp = DailyLogbookUpsertSerializer(data={"date": date_str})
                tmp.is_valid(raise_exception=True)
                qs = qs.filter(date=tmp.validated_data["date"])
            except Exception:
                # If filter date is invalid, just return empty list instead of 500.
                qs = qs.none()

        items = [
            {
                "id": lb.id,
                "date": lb.date,
                "index": lb.index,
                "form_data": lb.form_data,
                "created_at": lb.created_at,
                "updated_at": lb.updated_at,
            }
            for lb in qs
        ]
        out = DailyLogbookSerializer(data=items, many=True)
        out.is_valid(raise_exception=True)
        return Response({"results": out.data})

