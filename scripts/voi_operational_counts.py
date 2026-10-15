"""Which areas the non-defect count cache serves, and how it counts.

The dashboard's availability chart asks park_events for every day it shows,
only to count the vehicles that are not defect. A past moment never changes,
so voi-snapshot-api keeps those Voi counts for the region's municipalities and
regions, and asks the dashboard API only for moments it has not seen.

This module imports neither Flask nor psycopg, so it can be unit tested anywhere.
"""

from datetime import datetime, timedelta
from typing import Any

from scripts.voi_availability import ValidationError, parse_iso

# The dashboard's municipality zones (zone_type 'municipality') in the region
MUNICIPALITY_ZONE_IDS = {
    "GM0307": 34148,  # Amersfoort
    "GM0308": 34149,  # Baarn
    "GM0317": 34153,  # Eemnes
    "GM0342": 34160,  # Soest
    "GM0376": 34175,  # Blaricum
    "GM0402": 34188,  # Hilversum
    "GM0406": 34190,  # Huizen
    "GM0417": 34193,  # Laren
    "GM1696": 34353,  # Wijdemeren
    "GM1942": 34401,  # Gooise Meren
}
_AMERSFOORT = ("GM0307", "GM0308", "GM0317", "GM0342")
_GOOI_EN_VECHTSTREEK = ("GM0376", "GM0402", "GM0406", "GM0417", "GM1696", "GM1942")


def area_key(zone_ids: Any) -> str:
    """The sorted zone_ids string the cache stores an area under."""
    if not isinstance(zone_ids, str):
        raise ValidationError("zone_ids must be a comma-separated string")
    try:
        ids = sorted({int(part) for part in zone_ids.split(",") if part.strip()})
    except ValueError:
        raise ValidationError("zone_ids must be integers") from None
    return ",".join(str(zone_id) for zone_id in ids)


def _key(codes):
    return area_key(",".join(str(MUNICIPALITY_ZONE_IDS[code]) for code in codes))


# Each municipality, Regio Amersfoort, Regio Gooi en Vechtstreek and Regio GV&A
CACHED_AREAS = frozenset(
    [_key([code]) for code in MUNICIPALITY_ZONE_IDS]
    + [_key(_AMERSFOORT), _key(_GOOI_EN_VECHTSTREEK), _key(_AMERSFOORT + _GOOI_EN_VECHTSTREEK)]
)


def parse_request(body: Any) -> tuple[str, list[datetime]]:
    """The area key and the distinct moments a request asks for."""
    if not isinstance(body, dict):
        raise ValidationError("The request body must be a JSON object")
    key = area_key(body.get("zone_ids"))
    if key not in CACHED_AREAS:
        raise ValidationError("zone_ids is not an area this cache serves")
    timestamps = body.get("timestamps")
    if not isinstance(timestamps, list):
        raise ValidationError("timestamps must be a list")
    moments = sorted({parse_iso(value, "timestamps") for value in timestamps})
    return key, moments


def is_settled(moment: datetime, now: datetime) -> bool:
    """Whether the source's answer for a moment is final and may be stored.

    The day must have passed, as the chart counts it. A day's margin also
    leaves time for late park events to arrive.
    """
    return moment <= now - timedelta(days=1)


def _is_non_operational(value: Any) -> bool:
    return value is True or value == "true"


def count_park_events(payload: Any) -> dict[str, dict[str, int]]:
    """Operational and total Voi vehicles per form factor in a park_events answer."""
    events = payload.get("park_events") if isinstance(payload, dict) else None
    if not isinstance(events, list):
        raise ValueError("API response has no park_events array")
    counts: dict[str, dict[str, int]] = {}
    for event in events:
        if not isinstance(event, dict) or event.get("system_id") != "voi":
            continue
        form_factor = event.get("form_factor") if isinstance(event.get("form_factor"), str) else ""
        entry = counts.setdefault(form_factor, {"operational": 0, "total": 0})
        entry["total"] += 1
        if not _is_non_operational(event.get("is_non_operational")):
            entry["operational"] += 1
    return counts
