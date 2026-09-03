#!/usr/bin/env python3
"""Download the current public Voi vehicle positions as GeoJSON."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_API_URL = (
    "https://api.dashboarddeelmobiliteit.nl/"
    "dashboard-api/public/vehicles_in_public_space"
)
OPERATOR = "voi"


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


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

    vehicles = payload.get("vehicles_in_public_space")
    if not isinstance(vehicles, list):
        raise ValueError("API response has no vehicles_in_public_space array")

    features = []
    for index, vehicle in enumerate(vehicles):
        if not isinstance(vehicle, dict):
            raise ValueError(f"Vehicle {index} must be a JSON object")

        system_id = vehicle.get("system_id")
        if system_id != OPERATOR:
            continue

        location = vehicle.get("location")
        if not isinstance(location, dict):
            raise ValueError(f"Vehicle {index} has no location object")

        latitude = location.get("latitude")
        longitude = location.get("longitude")
        if not is_coordinate(latitude, -90, 90):
            raise ValueError(f"Vehicle {index} has an invalid latitude")
        if not is_coordinate(longitude, -180, 180):
            raise ValueError(f"Vehicle {index} has an invalid longitude")

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "system_id": OPERATOR,
                    "form_factor": vehicle.get("form_factor"),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                },
            }
        )

    timestamp = iso_timestamp(captured_at)
    return {
        "type": "FeatureCollection",
        "title": f"Voi vehicle positions at {timestamp}",
        "captured_at": timestamp,
        "operator": OPERATOR,
        "feature_count": len(features),
        "features": features,
    }


def fetch_payload(api_url: str, captured_at: datetime, timeout: float) -> Any:
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
        },
    )

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))

    raise RuntimeError(f"API request failed after 3 attempts: {last_error}")


def write_geojson(geojson: dict[str, Any], output_dir: Path, captured_at: datetime) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"voi-vehicles-{filename_timestamp(captured_at)}.geojson"

    descriptor, temporary_name = tempfile.mkstemp(
        dir=output_dir,
        prefix=f".{output_path.name}.",
        suffix=".tmp",
        text=True,
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            json.dump(geojson, output_file, ensure_ascii=False, separators=(",", ":"))
            output_file.write("\n")
        os.replace(temporary_name, output_path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise

    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the current public Voi positions as GeoJSON."
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help="Vehicle API endpoint",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("voi-vehicle-snapshots"),
        help="Directory for the GeoJSON snapshot",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30,
        help="Timeout for each API request in seconds",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    captured_at = utc_now()

    try:
        payload = fetch_payload(args.api_url, captured_at, args.timeout)
        geojson = to_geojson(payload, captured_at)
        output_path = write_geojson(geojson, args.output_dir, captured_at)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Voi snapshot failed: {error}", file=sys.stderr)
        return 1

    print(output_path.resolve())
    print(
        f"Stored {geojson['feature_count']} Voi positions captured at "
        f"{geojson['captured_at']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
