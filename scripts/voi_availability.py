"""Validation helpers for the availability endpoint.

Pure Python on purpose: no Flask and no psycopg, so the rules can be unit
tested without a database driver installed.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any

DEFAULT_WINDOW_DAYS = 7
MAX_WINDOW_DAYS = 31
MAX_POLYGON_VERTICES = 5000
POLYGON_TYPES = ("Polygon", "MultiPolygon")


class ValidationError(ValueError):
    """A request the API answers with HTTP 400."""


def parse_iso(value: str, field: str) -> datetime:
    """Parse an ISO-8601 timestamp and return it in UTC.

    A timestamp without an offset is read as UTC.
    """
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field} must be an ISO-8601 timestamp")
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise ValidationError(f"{field} is not a valid ISO-8601 timestamp") from None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_window(from_value: Any, to_value: Any, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return the (from, to) window, defaulting to the last seven days."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    end = parse_iso(to_value, "to") if to_value not in (None, "") else now
    if from_value not in (None, ""):
        start = parse_iso(from_value, "from")
    else:
        start = end - timedelta(days=DEFAULT_WINDOW_DAYS)
    if start > end:
        raise ValidationError("from must not be later than to")
    if end - start > timedelta(days=MAX_WINDOW_DAYS):
        raise ValidationError(f"The maximum window is {MAX_WINDOW_DAYS} days")
    return start, end


def _count_ring(ring: Any) -> int:
    if not isinstance(ring, list) or len(ring) < 4:
        raise ValidationError("Each polygon ring needs at least four positions")
    for position in ring:
        if (not isinstance(position, list) or len(position) < 2
                or not all(isinstance(number, (int, float)) and not isinstance(number, bool)
                           for number in position[:2])):
            raise ValidationError("Polygon positions must be [longitude, latitude] numbers")
    if ring[0][:2] != ring[-1][:2]:
        raise ValidationError("Polygon rings must be closed")
    for lon, lat, *_ in ring:
        if not math.isfinite(lon) or not math.isfinite(lat) or abs(lon) > 180 or abs(lat) > 90:
            raise ValidationError("Polygon coordinates must be finite WGS84 positions")
    return len(ring)


def _count_polygon(rings: Any) -> int:
    if not isinstance(rings, list) or not rings:
        raise ValidationError("A polygon needs at least one ring")
    return sum(_count_ring(ring) for ring in rings)


def validate_polygon(polygon: Any) -> dict[str, Any]:
    """Check the GeoJSON shape and vertex cap, and return the geometry."""
    if isinstance(polygon, str):
        try:
            polygon = json.loads(polygon)
        except ValueError:
            raise ValidationError("polygon is not valid JSON") from None
    if not isinstance(polygon, dict):
        raise ValidationError("polygon must be a GeoJSON geometry object")
    if isinstance(polygon.get("geometry"), dict) and polygon.get("type") == "Feature":
        polygon = polygon["geometry"]
    kind = polygon.get("type")
    if kind not in POLYGON_TYPES:
        raise ValidationError("polygon must be a GeoJSON Polygon or MultiPolygon")
    coordinates = polygon.get("coordinates")
    if kind == "Polygon":
        vertices = _count_polygon(coordinates)
    else:
        if not isinstance(coordinates, list) or not coordinates:
            raise ValidationError("A MultiPolygon needs at least one polygon")
        vertices = sum(_count_polygon(part) for part in coordinates)
    if vertices > MAX_POLYGON_VERTICES:
        raise ValidationError(
            f"polygon has {vertices} vertices; the limit is {MAX_POLYGON_VERTICES}"
        )
    return {"type": kind, "coordinates": coordinates}
