"""Validation and output for the hub-counts endpoint, which feeds Drukte.

The Drukte view of the Aanbod map asks how many Voi vehicles stood in each
parking hub, or in each place (a group of hubs), at every snapshot. A vehicle
within HUB_RADIUS_M of a zone's polygons stands in it, as in Parkeernaleving.

The query joins vehicles and zones on a grid of CELL_DEGREES, so each vehicle
is tested only against the zones near it; an all-pairs join over hundreds of
hubs and a week of positions does not fit the statement timeout.

This module imports neither Flask nor psycopg, so it can be unit tested anywhere.
"""

from __future__ import annotations

import json
from typing import Any

from scripts.voi_availability import ValidationError, validate_polygon
from scripts.voi_zone_counts import HUB_RADIUS_M

# Grid cells of 0.001 degree: about 68 m east-west and 111 m north-south here
CELL_DEGREES = 0.001
# Margin around a zone's bounding box when listing its cells. More than
# HUB_RADIUS_M in degrees of longitude at Dutch latitudes (20 m is 0.0003).
MARGIN_DEGREES = 0.0004

__all__ = ["CELL_DEGREES", "HUB_RADIUS_M", "MARGIN_DEGREES", "bounds", "build_series", "parse_zones"]


def parse_zones(value: Any) -> list[dict[str, str]]:
    """The zones of a request: a unique id and a Polygon or MultiPolygon."""
    if not isinstance(value, list) or not value:
        raise ValidationError("zones must be a non-empty list")
    zones = []
    seen = set()
    for zone in value:
        if not isinstance(zone, dict):
            raise ValidationError("Each zone must be a JSON object")
        zone_id = zone.get("id")
        if not isinstance(zone_id, str) or not zone_id.strip():
            raise ValidationError("Each zone needs a string id")
        if zone_id in seen:
            raise ValidationError(f"Zone id {zone_id} appears twice")
        seen.add(zone_id)
        zones.append({"id": zone_id, "geojson": json.dumps(validate_polygon(zone.get("polygon")))})
    return zones


def bounds(zones: list[dict[str, str]]) -> tuple[float, float, float, float]:
    """West, south, east and north edge around every zone, plus the margin."""
    lons, lats = [], []

    def collect(value: Any) -> None:
        if value and isinstance(value[0], (int, float)):
            lons.append(value[0])
            lats.append(value[1])
        else:
            for item in value:
                collect(item)

    for zone in zones:
        collect(json.loads(zone["geojson"])["coordinates"])
    return (min(lons) - MARGIN_DEGREES, min(lats) - MARGIN_DEGREES,
            max(lons) + MARGIN_DEGREES, max(lats) + MARGIN_DEGREES)


def build_series(moments: list[Any], rows: list[tuple[str, Any, int, int]]) -> dict[str, dict[str, list[int]]]:
    """Per zone, the snapshots with vehicles and their counts, as columns.

    Most hubs are empty most of the time, so only snapshots with at least one
    vehicle are listed: `i` indexes into captured_at, `total` counts every
    vehicle and `operational` the non-defect ones. A missing index is zero.
    """
    position = {moment: index for index, moment in enumerate(moments)}
    series: dict[str, dict[str, list[int]]] = {}
    for zone_id, moment, operational, total in sorted(
            rows, key=lambda row: (row[0], position.get(row[1], -1))):
        index = position.get(moment)
        if index is None:
            continue
        zone = series.setdefault(zone_id, {"i": [], "operational": [], "total": []})
        zone["i"].append(index)
        zone["operational"].append(operational)
        zone["total"].append(total)
    return series
