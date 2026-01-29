import os
from typing import List, Tuple, Dict, Any

import requests


MAPBOX_BASE_URL = "https://api.mapbox.com"


class MapboxError(Exception):
    pass


def _get_token() -> str:
    token = os.getenv("MAPBOX_ACCESS_TOKEN")
    if not token:
        raise MapboxError("MAPBOX_ACCESS_TOKEN environment variable is not set.")
    return token


def reverse_geocode(lon: float, lat: float) -> str | None:
    """
    Return "City, State" (or place + region) for coordinates, or None on failure.
    Uses Mapbox Geocoding v5 reverse endpoint.
    """
    token = _get_token()
    url = f"{MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/{lon},{lat}.json"
    params = {"access_token": token, "limit": 1}
    try:
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        features = data.get("features") or []
        if not features:
            return None
        feat = features[0]
        # Prefer place_formatted (v6) or build from context (v5)
        place_formatted = feat.get("properties", {}).get("place_formatted")
        if place_formatted:
            # "City, State 12345, Country" -> take first two parts for "City, State"
            parts = [p.strip() for p in place_formatted.split(",")]
            if len(parts) >= 2:
                return f"{parts[0]}, {parts[1]}"
            return parts[0] if parts else place_formatted
        context = feat.get("context") or []
        if isinstance(context, list):
            place_part = region_part = None
            for ctx in context:
                ctx_id = (ctx.get("id") or "").lower()
                text = (ctx.get("text") or "").strip()
                if ctx_id.startswith("place."):
                    place_part = text
                elif ctx_id.startswith("region."):
                    region_part = text
            if place_part and region_part:
                return f"{place_part}, {region_part}"
            if place_part:
                return place_part
            if region_part:
                return region_part
        # Fallback: use place_name (full address)
        place_name = feat.get("place_name") or feat.get("text", "")
        if place_name:
            parts = [p.strip() for p in str(place_name).split(",")]
            if len(parts) >= 2:
                return f"{parts[0]}, {parts[1]}"
            return str(place_name)
        return None
    except Exception:
        return None


def geocode_place(name: str) -> Tuple[float, float]:
    """
    Return (lat, lon) for a human-readable place name using Mapbox Geocoding API.
    """
    token = _get_token()
    url = f"{MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/{requests.utils.quote(name)}.json"
    params = {"access_token": token, "limit": 1}
    resp = requests.get(url, params=params, timeout=10)
    if resp.status_code != 200:
        raise MapboxError(f"Geocoding failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    features = data.get("features") or []
    if not features:
        raise MapboxError(f"No geocoding results for '{name}'.")
    lon, lat = features[0]["center"]
    return lat, lon


def get_route(coords: List[Tuple[float, float]]) -> Dict[str, Any]:
    """
    Given a list of (lat, lon) coordinates, call Mapbox Directions API and
    return a simplified structure with distance, duration, and geometry
    as a list of [lon, lat] points.
    """
    if len(coords) < 2:
        raise ValueError("At least two coordinates are required for routing.")

    token = _get_token()
    # Mapbox expects "lon,lat" pairs joined with ';'
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coords)
    url = f"{MAPBOX_BASE_URL}/directions/v5/mapbox/driving-traffic/{coord_str}"
    params = {
        "access_token": token,
        "geometries": "geojson",
        "overview": "full",
    }
    resp = requests.get(url, params=params, timeout=15)
    if resp.status_code != 200:
        raise MapboxError(f"Directions failed: {resp.status_code} - {resp.text}")

    data = resp.json()
    routes = data.get("routes") or []
    if not routes:
        raise MapboxError("No route found for the given coordinates.")

    route = routes[0]
    distance_m = route.get("distance", 0.0)
    duration_s = route.get("duration", 0.0)
    geometry = route.get("geometry", {}).get("coordinates", [])

    # Ensure geometry is a list of [lon, lat] pairs
    if not isinstance(geometry, list):
        geometry = []

    # Per-leg duration/distance when we have 3+ waypoints (current → pickup → dropoff)
    legs = []
    for leg in route.get("legs", []):
        legs.append({
            "distance_m": float(leg.get("distance", 0.0)),
            "duration_s": float(leg.get("duration", 0.0)),
        })

    return {
        "distance_m": float(distance_m),
        "duration_s": float(duration_s),
        "geometry": geometry,
        "legs": legs,
    }


def autocomplete_places(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Return autocomplete suggestions for a place query using Mapbox Geocoding API.
    Returns a list of suggestions with place_name and center coordinates.
    """
    if not query or len(query.strip()) < 2:
        return []

    token = _get_token()
    url = f"{MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/{requests.utils.quote(query)}.json"
    params = {
        "access_token": token,
        "limit": str(limit),
        "types": "place,address,poi",
    }
    resp = requests.get(url, params=params, timeout=10)
    if resp.status_code != 200:
        raise MapboxError(f"Autocomplete failed: {resp.status_code} - {resp.text}")

    data = resp.json()
    features = data.get("features") or []

    return [
        {
            "place_name": feat.get("place_name", ""),
            "center": feat.get("center", [0, 0]),
        }
        for feat in features
    ]

