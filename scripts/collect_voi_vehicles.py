#!/usr/bin/env python3
"""Fetch the current Voi vehicle positions and shape them as GeoJSON.

Uses the authenticated park_events endpoint so every snapshot records
is_non_operational per vehicle. The API key comes from the
DASHBOARDDEELMOB_KEY environment variable and is sent as an `apikey`
header; it is never logged or stored in the snapshot.

This module has no command line entry point. `scripts.voi_database` is the
only production path: it floors the capture time to the ten-minute boundary
and stores the snapshot in PostGIS.
"""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_API_URL = "https://api.dashboarddeelmobiliteit.nl/dashboard-api/park_events"
OPERATOR = "voi"
MAX_RESPONSE_BYTES = 20 * 1024 * 1024
MAX_POSITIONS = 100000
API_KEY_ENV = "DASHBOARDDEELMOB_KEY"


def read_api_key(environ: dict[str, str] | None = None) -> str:
    """Return the API key, or raise RuntimeError naming the variable."""
    source = os.environ if environ is None else environ
    api_key = (source.get(API_KEY_ENV) or "").strip()
    if not api_key:
        raise RuntimeError(
            f"{API_KEY_ENV} is not set. Set it to the Dashboard Deelmobiliteit "
            "API key (a Railway service variable in production)."
        )
    return api_key


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


SNAPSHOT_INTERVAL_MINUTES = 10


def floor_to_interval(value: datetime, minutes: int = SNAPSHOT_INTERVAL_MINUTES) -> datetime:
    """Round a timestamp down to the start of its interval.

    The cron fires at :00, :10, ... but container startup delays the request
    by seconds, so every snapshot asks for the exact boundary instead.
    """
    if minutes <= 0 or 60 % minutes:
        raise ValueError("minutes must divide 60")
    return value.replace(minute=value.minute - value.minute % minutes, second=0, microsecond=0)


def iso_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def filename_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def is_coordinate(value: Any, minimum: float, maximum: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and minimum <= value <= maximum
    )


def to_geojson(payload: Any, captured_at: datetime) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("API response must be a JSON object")

    vehicles = payload.get("park_events")
    if not isinstance(vehicles, list):
        raise ValueError("API response has no park_events array")

    if len(vehicles) > MAX_POSITIONS:
        raise ValueError("Vehicle response exceeds the position limit")

    features = []
    skipped = 0
    for index, vehicle in enumerate(vehicles):
        if not isinstance(vehicle, dict):
            # One malformed record must not discard the whole boundary: with
            # restartPolicyType NEVER there is no second chance at this run.
            skipped += 1
            continue

        system_id = vehicle.get("system_id")
        if system_id != OPERATOR:
            continue

        try:
            feature = to_feature(vehicle, index)
        except ValueError:
            skipped += 1
            continue
        features.append(feature)

    timestamp = iso_timestamp(captured_at)
    return {
        "type": "FeatureCollection",
        "title": f"Voi vehicle positions at {timestamp}",
        "captured_at": timestamp,
        "operator": OPERATOR,
        "feature_count": len(features),
        "skipped_count": skipped,
        "features": features,
    }


def to_feature(vehicle: dict[str, Any], index: int = 0) -> dict[str, Any]:
    """Build one GeoJSON feature, or raise ValueError for a bad record."""
    location = vehicle.get("location")
    if not isinstance(location, dict):
        raise ValueError(f"Vehicle {index} has no location object")

    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if not is_coordinate(latitude, -90, 90):
        raise ValueError(f"Vehicle {index} has an invalid latitude")
    if not is_coordinate(longitude, -180, 180):
        raise ValueError(f"Vehicle {index} has an invalid longitude")

    return {
        "type": "Feature",
        "properties": {
            "system_id": OPERATOR,
            "form_factor": vehicle.get("form_factor"),
            **availability_properties(vehicle, index),
        },
        "geometry": {
            "type": "Point",
            "coordinates": [longitude, latitude],
        },
    }


def required_bool(vehicle: dict[str, Any], index: int) -> bool:
    value = vehicle.get("is_non_operational")
    if not isinstance(value, bool):
        raise ValueError(
            f"Vehicle {index} has a missing or non-boolean is_non_operational"
        )
    return value


def optional_bool(value: Any) -> bool | None:
    if value is True or value == "true":
        return True
    if value is False or value == "false":
        return False
    return None


def availability_properties(vehicle: dict[str, Any], index: int = 0) -> dict[str, Any]:
    # park_events always reports is_non_operational; the other fields may be
    # absent, and absence is unknown rather than evidence of availability.
    non_operational = required_bool(vehicle, index)
    reserved = optional_bool(vehicle.get("is_reserved"))
    available = optional_bool(vehicle.get("is_available"))
    if non_operational is True or reserved is True:
        available = False
    return {
        "is_non_operational": non_operational,
        "is_reserved": reserved,
        "is_available": available,
    }


def fetch_payload(
    api_url: str,
    captured_at: datetime,
    timeout: float,
    api_key: str | None = None,
) -> Any:
    if api_key is None:
        api_key = read_api_key()
    query = urlencode(
        {
            "operators": OPERATOR,
            "timestamp": iso_timestamp(captured_at),
        }
    )
    separator = "&" if "?" in api_url else "?"
    request = Request(
        f"{api_url}{separator}{query}",
        headers={
            "Accept": "application/json",
            "User-Agent": "dashboarddeelmobiliteit-voi-monitor/1.0",
            "apikey": api_key,
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with urlopen(request, timeout=timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise ValueError("Vehicle response exceeds 20 MB")
                return json.loads(raw)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            if isinstance(error, HTTPError) and error.code in (401, 403):
                raise RuntimeError(
                    f"API rejected the {API_KEY_ENV} credentials (HTTP {error.code})"
                ) from error
            if isinstance(error, HTTPError) and error.code not in (408, 429) and error.code < 500:
                raise RuntimeError(f"Vehicle API rejected the request (HTTP {error.code})") from error
            last_error = error
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))

    raise RuntimeError(f"API request failed after 3 attempts: {last_error}")
