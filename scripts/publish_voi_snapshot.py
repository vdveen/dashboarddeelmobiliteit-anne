#!/usr/bin/env python3
"""Collect a Voi snapshot and publish it to the public archive branch."""

from __future__ import annotations

import base64
import gzip
import json
import os
import sys
from datetime import datetime
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from scripts.collect_voi_vehicles import (
    DEFAULT_API_URL,
    fetch_payload,
    filename_timestamp,
    iso_timestamp,
    to_geojson,
    utc_now,
)


DEFAULT_REPOSITORY = "vdveen/dashboarddeelmobiliteit-anne"
DEFAULT_ARCHIVE_BRANCH = "voi-vehicle-data"
DEFAULT_GITHUB_API_URL = "https://api.github.com"


class GitHubApiError(RuntimeError):
    """A GitHub API request returned an error response."""

    def __init__(self, status: int, method: str, path: str, message: str):
        super().__init__(
            f"GitHub API {method} {path} returned status {status}: {message}"
        )
        self.status = status


def github_request(
    method: str,
    path: str,
    token: str,
    payload: dict[str, Any] | None = None,
    api_url: str = DEFAULT_GITHUB_API_URL,
) -> Any:
    data = None
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    request = Request(
        f"{api_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "dashboarddeelmobiliteit-voi-monitor/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except HTTPError as error:
        try:
            response_body = json.load(error)
            message = response_body.get("message", error.reason)
        except (json.JSONDecodeError, AttributeError):
            message = error.reason
        raise GitHubApiError(error.code, method, path, str(message)) from error
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"GitHub API {method} {path} failed: {error}") from error


def archive_path(captured_at: datetime) -> str:
    timestamp = filename_timestamp(captured_at)
    return (
        f"snapshots/{captured_at:%Y/%m}/"
        f"voi-vehicles-{timestamp}.geojson.gz"
    )


def encode_snapshot(geojson: dict[str, Any]) -> bytes:
    contents = json.dumps(
        geojson,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8") + b"\n"
    return gzip.compress(contents, compresslevel=9, mtime=0)


def update_index(
    current_index: Any,
    captured_at: datetime,
    snapshot_path: str,
) -> bytes:
    if not isinstance(current_index, list):
        raise ValueError("Archive index must be a JSON array")

    entries = [
        entry
        for entry in current_index
        if isinstance(entry, dict) and entry.get("path") != snapshot_path
    ]
    entries.append(
        {
            "captured_at": iso_timestamp(captured_at),
            "path": snapshot_path,
        }
    )
    entries.sort(key=lambda entry: str(entry.get("captured_at", "")))
    return json.dumps(entries, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"


RequestFunction = Callable[[str, str, str, dict[str, Any] | None], Any]


def publish_snapshot(
    geojson: dict[str, Any],
    captured_at: datetime,
    repository: str,
    branch: str,
    token: str,
    request_function: RequestFunction = github_request,
) -> tuple[str, str]:
    encoded_repository = "/".join(
        quote(part, safe="") for part in repository.split("/", 1)
    )
    encoded_branch = quote(branch, safe="")
    snapshot_path = archive_path(captured_at)
    snapshot_contents = encode_snapshot(geojson)

    for attempt in range(1, 4):
        ref = request_function(
            "GET",
            f"/repos/{encoded_repository}/git/ref/heads/{encoded_branch}",
            token,
            None,
        )
        base_commit_sha = ref["object"]["sha"]
        base_commit = request_function(
            "GET",
            f"/repos/{encoded_repository}/git/commits/{base_commit_sha}",
            token,
            None,
        )
        index_file = request_function(
            "GET",
            f"/repos/{encoded_repository}/contents/index.json?ref={base_commit_sha}",
            token,
            None,
        )
        current_index = json.loads(
            base64.b64decode(index_file["content"]).decode("utf-8")
        )

        if any(
            isinstance(entry, dict) and entry.get("path") == snapshot_path
            for entry in current_index
        ):
            return base_commit_sha, snapshot_path

        index_contents = update_index(current_index, captured_at, snapshot_path)
        snapshot_blob = request_function(
            "POST",
            f"/repos/{encoded_repository}/git/blobs",
            token,
            {
                "content": base64.b64encode(snapshot_contents).decode("ascii"),
                "encoding": "base64",
            },
        )
        index_blob = request_function(
            "POST",
            f"/repos/{encoded_repository}/git/blobs",
            token,
            {
                "content": index_contents.decode("utf-8"),
                "encoding": "utf-8",
            },
        )
        tree = request_function(
            "POST",
            f"/repos/{encoded_repository}/git/trees",
            token,
            {
                "base_tree": base_commit["tree"]["sha"],
                "tree": [
                    {
                        "path": snapshot_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": snapshot_blob["sha"],
                    },
                    {
                        "path": "index.json",
                        "mode": "100644",
                        "type": "blob",
                        "sha": index_blob["sha"],
                    },
                ],
            },
        )
        commit = request_function(
            "POST",
            f"/repos/{encoded_repository}/git/commits",
            token,
            {
                "message": f"Add Voi snapshot {iso_timestamp(captured_at)}",
                "tree": tree["sha"],
                "parents": [base_commit_sha],
            },
        )

        try:
            request_function(
                "PATCH",
                f"/repos/{encoded_repository}/git/refs/heads/{encoded_branch}",
                token,
                {"sha": commit["sha"], "force": False},
            )
            return commit["sha"], snapshot_path
        except GitHubApiError as error:
            if error.status != 422 or attempt == 3:
                raise

    raise RuntimeError("Archive branch changed during all three publish attempts")


def main() -> int:
    token = os.environ.get("VOI_ARCHIVE_GITHUB_TOKEN", "").strip()
    if not token:
        print("VOI_ARCHIVE_GITHUB_TOKEN is required", file=sys.stderr)
        return 1

    repository = os.environ.get(
        "VOI_ARCHIVE_REPOSITORY",
        DEFAULT_REPOSITORY,
    )
    branch = os.environ.get(
        "VOI_ARCHIVE_BRANCH",
        DEFAULT_ARCHIVE_BRANCH,
    )
    api_url = os.environ.get("VOI_API_URL", DEFAULT_API_URL)
    captured_at = utc_now()

    try:
        payload = fetch_payload(api_url, captured_at, timeout=30)
        geojson = to_geojson(payload, captured_at)
        commit_sha, snapshot_path = publish_snapshot(
            geojson,
            captured_at,
            repository,
            branch,
            token,
        )
    except (GitHubApiError, KeyError, OSError, RuntimeError, ValueError) as error:
        print(f"Voi snapshot publish failed: {error}", file=sys.stderr)
        return 1

    print(
        f"Published {geojson['feature_count']} Voi positions to {snapshot_path} "
        f"at commit {commit_sha}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
