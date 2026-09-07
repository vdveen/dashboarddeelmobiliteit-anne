#!/usr/bin/env python3
"""Collect a Voi snapshot and publish it to the public archive branch."""

from __future__ import annotations

import gzip
import json
import os
import shlex
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
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
GITHUB_META_URL = "https://api.github.com/meta"


class GitCommandError(RuntimeError):
    """A Git command failed."""


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


def stage_snapshot(
    archive_directory: Path,
    geojson: dict[str, Any],
    captured_at: datetime,
) -> tuple[str, bool]:
    snapshot_path = archive_path(captured_at)
    snapshot_file = archive_directory / snapshot_path
    if snapshot_file.exists():
        return snapshot_path, False

    index_file = archive_directory / "index.json"
    current_index = json.loads(index_file.read_text(encoding="utf-8"))
    snapshot_file.parent.mkdir(parents=True, exist_ok=True)
    snapshot_file.write_bytes(encode_snapshot(geojson))
    index_file.write_bytes(update_index(current_index, captured_at, snapshot_path))
    return snapshot_path, True


def run_git(
    arguments: list[str],
    working_directory: Path | None = None,
    environment: dict[str, str] | None = None,
) -> str:
    result = subprocess.run(
        ["git", *arguments],
        cwd=working_directory,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown error"
        raise GitCommandError(f"git {arguments[0]} failed: {detail[-1200:]}")
    return result.stdout.strip()


def fetch_github_ssh_keys() -> list[str]:
    request = Request(
        GITHUB_META_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "dashboarddeelmobiliteit-voi-monitor/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            keys = json.load(response).get("ssh_keys")
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not load GitHub SSH host keys: {error}") from error

    if not isinstance(keys, list) or not keys:
        raise RuntimeError("GitHub metadata returned no SSH host keys")
    key_types = {"ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"}
    if not all(
        isinstance(key, str) and key.split(" ", 1)[0] in key_types
        for key in keys
    ):
        raise RuntimeError("GitHub metadata returned invalid SSH host keys")
    return keys


def configure_ssh(
    directory: Path,
    private_key: str,
) -> dict[str, str]:
    key_file = directory / "archive-deploy-key"
    key_file.write_text(private_key.rstrip("\n") + "\n", encoding="utf-8")
    key_file.chmod(0o600)

    known_hosts_file = directory / "known_hosts"
    known_hosts_file.write_text(
        "".join(f"[ssh.github.com]:443 {key}\n" for key in fetch_github_ssh_keys()),
        encoding="utf-8",
    )

    environment = os.environ.copy()
    environment["GIT_SSH_COMMAND"] = " ".join(
        [
            "ssh",
            "-p 443",
            f"-i {shlex.quote(str(key_file))}",
            "-o IdentitiesOnly=yes",
            "-o StrictHostKeyChecking=yes",
            f"-o UserKnownHostsFile={shlex.quote(str(known_hosts_file))}",
        ]
    )
    return environment


def publish_snapshot(
    geojson: dict[str, Any],
    captured_at: datetime,
    remote_url: str,
    branch: str,
    private_key: str | None = None,
) -> tuple[str, str]:
    for attempt in range(1, 4):
        with tempfile.TemporaryDirectory(prefix="voi-archive-") as directory_name:
            directory = Path(directory_name)
            environment = (
                configure_ssh(directory, private_key)
                if private_key is not None
                else os.environ.copy()
            )
            archive_directory = directory / "archive"
            run_git(
                [
                    "clone",
                    "--depth",
                    "1",
                    "--single-branch",
                    "--branch",
                    branch,
                    remote_url,
                    str(archive_directory),
                ],
                environment=environment,
            )
            snapshot_path, changed = stage_snapshot(
                archive_directory,
                geojson,
                captured_at,
            )
            if not changed:
                return run_git(["rev-parse", "HEAD"], archive_directory), snapshot_path

            run_git(
                ["config", "user.name", "voi-vehicle-monitor[bot]"],
                archive_directory,
            )
            run_git(
                [
                    "config",
                    "user.email",
                    "voi-vehicle-monitor[bot]@users.noreply.github.com",
                ],
                archive_directory,
            )
            run_git(["add", "index.json", snapshot_path], archive_directory)
            run_git(
                ["commit", "-m", f"Add Voi snapshot {iso_timestamp(captured_at)}"],
                archive_directory,
            )
            commit_sha = run_git(["rev-parse", "HEAD"], archive_directory)
            try:
                run_git(
                    ["push", "origin", f"HEAD:{branch}"],
                    archive_directory,
                    environment,
                )
                return commit_sha, snapshot_path
            except GitCommandError:
                if attempt == 3:
                    raise

    raise RuntimeError("Archive branch changed during all three publish attempts")


def main() -> int:
    private_key = os.environ.get("VOI_ARCHIVE_SSH_PRIVATE_KEY", "").strip()
    if not private_key:
        print("VOI_ARCHIVE_SSH_PRIVATE_KEY is required", file=sys.stderr)
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
    remote_url = f"ssh://git@ssh.github.com:443/{repository}.git"

    try:
        payload = fetch_payload(api_url, captured_at, timeout=30)
        geojson = to_geojson(payload, captured_at)
        commit_sha, snapshot_path = publish_snapshot(
            geojson,
            captured_at,
            remote_url,
            branch,
            private_key,
        )
    except (GitCommandError, KeyError, OSError, RuntimeError, ValueError) as error:
        print(f"Voi snapshot publish failed: {error}", file=sys.stderr)
        return 1

    print(
        f"Published {geojson['feature_count']} Voi positions to {snapshot_path} "
        f"at commit {commit_sha}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
