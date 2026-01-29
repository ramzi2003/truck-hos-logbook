from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any


def _to_utc_iso(dt: datetime) -> str:
    """Return ISO string in UTC (00 GMT) so the frontend chart uses one clock."""
    if dt.tzinfo is None:
        return dt.isoformat()
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# Constants based on FMCSA property‑carrying assumptions
MAX_DRIVING_HOURS_PER_DAY = 11.0
MAX_ON_DUTY_HOURS_PER_DAY = 14.0
MIN_OFF_DUTY_BETWEEN_DAYS_HOURS = 10.0
BREAK_AFTER_DRIVING_HOURS = 8.0
FUEL_EVERY_MILES = 1000.0
FUEL_STOP_MINUTES = 30.0
PICKUP_DROPOFF_ON_DUTY_MINUTES = 60.0
RESTART_HOURS = 34.0
MAX_CYCLE_HOURS = 70.0  # 70hr / 8 day


@dataclass
class DutySegment:
    status: str  # "OFF" | "SB" | "D" | "ON"
    start: datetime
    end: datetime


def _add_segment(segments: List[DutySegment], status: str, start: datetime, end: datetime):
    if end <= start:
        return
    if segments and segments[-1].status == status and segments[-1].end == start:
        segments[-1].end = end
    else:
        segments.append(DutySegment(status=status, start=start, end=end))


def plan_hos_schedule(
    distance_miles: float,
    duration_hours: float,
    departure: datetime,
    current_cycle_hours_used: float,
    legs: List[Dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    """
    Very simplified HOS scheduler that approximates FMCSA rules and produces
    duty segments, daily logs, and high‑level textual instructions.

    When legs is provided (list of 2: current→pickup, pickup→dropoff), the schedule is:
    Drive to pickup → 1h ON at pickup → Drive to dropoff → 1h ON at dropoff.
    Otherwise: 1h ON "pickup" at start → Drive → 1h ON at dropoff (legacy).
    """
    current_time = departure
    segments: List[DutySegment] = []
    instructions: List[str] = []

    cycle_hours_used = current_cycle_hours_used
    miles_since_fuel = 0.0
    day_driving = 0.0
    day_on_duty = 0.0
    driving_since_break = 0.0

    # When we have two legs: drive to pickup first, then 1h pickup, then drive to dropoff.
    use_legs = legs is not None and len(legs) == 2
    if use_legs:
        drive_to_pickup_hours = max(legs[0]["duration_s"] / 3600.0, 0.01)
        drive_to_pickup_miles = legs[0]["distance_m"] / 1609.34
        drive_to_dropoff_hours = max(legs[1]["duration_s"] / 3600.0, 0.01)
        drive_to_dropoff_miles = legs[1]["distance_m"] / 1609.34
    else:
        drive_to_pickup_hours = 0.0
        drive_to_pickup_miles = 0.0
        drive_to_dropoff_hours = duration_hours
        drive_to_dropoff_miles = distance_miles

    def do_drive_phase(
        remaining_total: float,
        distance_phase: float,
        duration_phase: float,
    ) -> None:
        """Drive a phase (hours). Only driving segments reduce rem; end-of-day and breaks do not."""
        nonlocal current_time, cycle_hours_used, day_driving, day_on_duty
        nonlocal driving_since_break, miles_since_fuel
        rem = remaining_total
        dist_mi = distance_phase
        dur_hr = max(duration_phase, 0.01)
        while rem > 0:
            if cycle_hours_used >= MAX_CYCLE_HOURS:
                restart_duration = timedelta(hours=RESTART_HOURS)
                restart_start = current_time
                restart_end = current_time + restart_duration
                _add_segment(segments, "OFF", restart_start, restart_end)
                instructions.append(
                    f"{restart_start.isoformat(timespec='minutes')}: 34‑hour OFF restart due to cycle limit."
                )
                current_time = restart_end
                cycle_hours_used = 0.0
                day_driving = 0.0
                day_on_duty = 0.0
                driving_since_break = 0.0
                continue
            remaining_drive_today = min(
                MAX_DRIVING_HOURS_PER_DAY - day_driving,
                MAX_ON_DUTY_HOURS_PER_DAY - day_on_duty,
                rem,
            )
            if remaining_drive_today <= 0:
                # End of day: 10h OFF at current location. Do NOT decrement rem –
                # the driver stops here; next day continues from this same point.
                off_duration = timedelta(hours=MIN_OFF_DUTY_BETWEEN_DAYS_HOURS)
                off_start = current_time
                off_end = current_time + off_duration
                _add_segment(segments, "OFF", off_start, off_end)
                instructions.append(
                    f"{off_start.isoformat(timespec='minutes')}: End of day – 10 hours OFF. Stop here; resume next day from this location."
                )
                current_time = off_end
                day_driving = 0.0
                day_on_duty = 0.0
                driving_since_break = 0.0
                continue
            if driving_since_break >= BREAK_AFTER_DRIVING_HOURS:
                break_duration = timedelta(minutes=30)
                break_start = current_time
                break_end = current_time + break_duration
                _add_segment(segments, "OFF", break_start, break_end)
                instructions.append(
                    f"{break_start.isoformat(timespec='minutes')}: 30‑minute break (OFF duty)."
                )
                current_time = break_end
                driving_since_break = 0.0
                continue
            driving_chunk = min(2.0, remaining_drive_today, rem)
            drive_start = current_time
            drive_end = current_time + timedelta(hours=driving_chunk)
            _add_segment(segments, "D", drive_start, drive_end)
            instructions.append(
                f"{drive_start.isoformat(timespec='minutes')}: Drive for {driving_chunk:.1f} hours."
            )
            current_time = drive_end
            rem -= driving_chunk
            day_driving += driving_chunk
            day_on_duty += driving_chunk
            cycle_hours_used += driving_chunk
            driving_since_break += driving_chunk
            avg_speed = dist_mi / dur_hr
            miles_travelled = avg_speed * driving_chunk
            miles_since_fuel += miles_travelled
            # Skip fuel stop when almost at destination (remaining drive < 30 min) so day 2
            # is one continuous drive to drop-off (e.g. 5:30 AM start, 6:28 AM Atlanta).
            if miles_since_fuel >= FUEL_EVERY_MILES and rem > 0.5:
                fuel_start = current_time
                fuel_end = current_time + timedelta(minutes=FUEL_STOP_MINUTES)
                _add_segment(segments, "ON", fuel_start, fuel_end)
                instructions.append(
                    f"{fuel_start.isoformat(timespec='minutes')}: Fuel stop – 30 minutes ON duty."
                )
                current_time = fuel_end
                day_on_duty += FUEL_STOP_MINUTES / 60.0
                cycle_hours_used += FUEL_STOP_MINUTES / 60.0
                miles_since_fuel = 0.0
                if FUEL_STOP_MINUTES >= 30:
                    driving_since_break = 0.0

    # Phase 1: If drive-then-pickup, drive from current to pickup first.
    if use_legs and drive_to_pickup_hours > 0:
        do_drive_phase(drive_to_pickup_hours, drive_to_pickup_miles, drive_to_pickup_hours)

    # Pickup: 1h ON at pickup location (or at start if legacy)
    pickup_duration = timedelta(minutes=PICKUP_DROPOFF_ON_DUTY_MINUTES)
    _add_segment(segments, "ON", current_time, current_time + pickup_duration)
    instructions.append(
        f"{current_time.isoformat(timespec='minutes')}: Pickup – 1 hour ON duty."
    )
    current_time += pickup_duration
    cycle_hours_used += PICKUP_DROPOFF_ON_DUTY_MINUTES / 60.0
    day_on_duty += PICKUP_DROPOFF_ON_DUTY_MINUTES / 60.0
    driving_since_break = 0.0

    # Phase 2: Drive from pickup to dropoff (or full route if legacy)
    if drive_to_dropoff_hours > 0:
        do_drive_phase(drive_to_dropoff_hours, drive_to_dropoff_miles, drive_to_dropoff_hours)

    # If cycle is already at or over 70 before drop‑off, insert 34‑hour restart first.
    if cycle_hours_used >= MAX_CYCLE_HOURS:
        restart_duration = timedelta(hours=RESTART_HOURS)
        restart_start = current_time
        restart_end = current_time + restart_duration
        _add_segment(segments, "OFF", restart_start, restart_end)
        instructions.append(
            f"{restart_start.isoformat(timespec='minutes')}: 34‑hour OFF restart due to cycle limit."
        )
        current_time = restart_end
        cycle_hours_used = 0.0

    # Drop‑off ON duty hour at the end
    drop_start = current_time
    drop_end = current_time + timedelta(minutes=PICKUP_DROPOFF_ON_DUTY_MINUTES)
    _add_segment(segments, "ON", drop_start, drop_end)
    instructions.append(
        f"{drop_start.isoformat(timespec='minutes')}: Drop‑off – 1 hour ON duty."
    )
    cycle_hours_used += PICKUP_DROPOFF_ON_DUTY_MINUTES / 60.0

    # Build daily logs keyed by date
    logs_by_date: Dict[str, List[DutySegment]] = {}
    for seg in segments:
        day_key = seg.start.date().isoformat()
        logs_by_date.setdefault(day_key, []).append(seg)

    daily_logs: List[Dict[str, Any]] = []
    for day, segs in sorted(logs_by_date.items()):
        daily_logs.append(
            {
                "date": day,
                "segments": [
                    {
                        "status": s.status,
                        "start_iso": _to_utc_iso(s.start),
                        "end_iso": _to_utc_iso(s.end),
                    }
                    for s in segs
                ],
            }
        )

    return {
        "segments": [
            {
                "status": s.status,
                "start_iso": _to_utc_iso(s.start),
                "end_iso": _to_utc_iso(s.end),
            }
            for s in segments
        ],
        "daily_logs": daily_logs,
        "instructions": instructions,
    }

