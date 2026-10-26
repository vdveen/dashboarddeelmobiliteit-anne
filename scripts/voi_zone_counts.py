"""Validation for the zone-counts endpoint, which feeds the contract monitor.

The dashboard's Prestaties aanbieders page checks Voi's contract requirements
per zone: knooppunten (a walking radius around a station or P+R) and
bedrijventerreinen (a polygon with a minimum number of occupied dropzones).
One request carries every zone, so the database reads each snapshot once.

This module imports neither Flask nor psycopg, so it can be unit tested anywhere.
"""

from __future__ import annotations

import json
import math
from typing import Any

from scripts.voi_availability import ValidationError, validate_polygon

# A bike within this distance of a hub is parked in it. The Parkeernaleving
# view of the Aanbod map uses the same band (src/helpers/parkingCompliance.ts).
HUB_RADIUS_M = 20


def _hub(position: Any) -> list[float]:
    if (not isinstance(position, list) or len(position) < 2
            or not all(isinstance(number, (int, float)) and not isinstance(number, bool)
                       for number in position[:2])):
        raise ValidationError("hubs must be [longitude, latitude] positions")
    lon, lat = position[:2]
    if not math.isfinite(lon) or not math.isfinite(lat) or abs(lon) > 180 or abs(lat) > 90:
        raise ValidationError("hubs must be finite WGS84 positions")
    return [float(lon), float(lat)]


def parse_zones(value: Any) -> list[dict[str, Any]]:
    """The zones of a request: a unique id, a polygon and optional hub positions."""
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
        hubs = zone.get("hubs") or []
        if not isinstance(hubs, list):
            raise ValidationError("hubs must be a list")
        zones.append({
            "id": zone_id,
            "geojson": json.dumps(validate_polygon(zone.get("polygon"))),
            "hubs": [_hub(position) for position in hubs],
        })
    return zones


def hub_rows(zones: list[dict[str, Any]]) -> tuple[list[str], list[int], list[float], list[float]]:
    """Hub positions as parallel arrays for unnest(): zone id, hub index, lon, lat."""
    ids, indexes, lons, lats = [], [], [], []
    for zone in zones:
        for index, (lon, lat) in enumerate(zone["hubs"]):
            ids.append(zone["id"])
            indexes.append(index)
            lons.append(lon)
            lats.append(lat)
    return ids, indexes, lons, lats


def build_series(zones: list[dict[str, Any]], moments: list[Any],
                 counts: list[tuple[str, Any, int]],
                 occupied: list[tuple[str, Any, int]]) -> dict[str, dict[str, list[int]]]:
    """Per zone, the operational count and occupied hubs at every snapshot.

    The queries return only (zone, snapshot) pairs with vehicles, so a missing
    pair is zero. A zone without hubs gets no occupied_hubs series.
    """
    position = {moment: index for index, moment in enumerate(moments)}
    series: dict[str, dict[str, list[int]]] = {}
    for zone in zones:
        series[zone["id"]] = {"operational": [0] * len(moments)}
        if zone["hubs"]:
            series[zone["id"]]["occupied_hubs"] = [0] * len(moments)
    for key, rows in (("operational", counts), ("occupied_hubs", occupied)):
        for zone_id, moment, value in rows:
            index = position.get(moment)
            if index is not None and key in series.get(zone_id, {}):
                series[zone_id][key][index] = value
    return series
