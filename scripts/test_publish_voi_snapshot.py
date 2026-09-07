import gzip
import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from scripts.publish_voi_snapshot import (
    archive_path,
    encode_snapshot,
    publish_snapshot,
    stage_snapshot,
    update_index,
)


CAPTURED_AT = datetime(2026, 9, 5, 12, 17, 4, tzinfo=timezone.utc)
GEOJSON = {
    "type": "FeatureCollection",
    "title": "Voi vehicle positions at 2026-09-05T12:17:04Z",
    "captured_at": "2026-09-05T12:17:04Z",
    "operator": "voi",
    "feature_count": 0,
    "features": [],
}


def git(arguments, working_directory):
    return subprocess.run(
        ["git", *arguments],
        cwd=working_directory,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


class ArchiveEncodingTest(unittest.TestCase):
    def test_uses_the_capture_time_in_the_archive_path(self):
        self.assertEqual(
            archive_path(CAPTURED_AT),
            "snapshots/2026/09/voi-vehicles-2026-09-05T12-17-04Z.geojson.gz",
        )

    def test_compresses_the_geojson_without_changing_it(self):
        decoded = json.loads(gzip.decompress(encode_snapshot(GEOJSON)))

        self.assertEqual(decoded, GEOJSON)

    def test_updates_and_sorts_the_archive_index(self):
        result = json.loads(
            update_index(
                [
                    {
                        "captured_at": "2026-09-05T13:17:00Z",
                        "path": "snapshots/newer.geojson.gz",
                    }
                ],
                CAPTURED_AT,
                archive_path(CAPTURED_AT),
            )
        )

        self.assertEqual(
            [entry["captured_at"] for entry in result],
            ["2026-09-05T12:17:04Z", "2026-09-05T13:17:00Z"],
        )

    def test_stages_the_snapshot_and_index_once(self):
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            (directory / "index.json").write_text("[]\n", encoding="utf-8")

            snapshot_path, changed = stage_snapshot(directory, GEOJSON, CAPTURED_AT)
            _, changed_again = stage_snapshot(directory, GEOJSON, CAPTURED_AT)

            self.assertTrue(changed)
            self.assertFalse(changed_again)
            self.assertEqual(
                json.loads(gzip.decompress((directory / snapshot_path).read_bytes())),
                GEOJSON,
            )


class PublishSnapshotTest(unittest.TestCase):
    def test_pushes_one_atomic_commit_to_the_archive_branch(self):
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            remote = directory / "remote.git"
            seed = directory / "seed"
            result = directory / "result"

            git(["init", "--bare", str(remote)], directory)
            git(["init", "--initial-branch", "voi-vehicle-data", str(seed)], directory)
            git(["config", "user.name", "Test"], seed)
            git(["config", "user.email", "test@example.com"], seed)
            (seed / "index.json").write_text("[]\n", encoding="utf-8")
            git(["add", "index.json"], seed)
            git(["commit", "-m", "Create archive"], seed)
            git(["remote", "add", "origin", str(remote)], seed)
            git(["push", "origin", "voi-vehicle-data"], seed)

            commit_sha, snapshot_path = publish_snapshot(
                GEOJSON,
                CAPTURED_AT,
                str(remote),
                "voi-vehicle-data",
            )

            git(["clone", "--branch", "voi-vehicle-data", str(remote), str(result)], directory)
            self.assertEqual(git(["rev-parse", "HEAD"], result), commit_sha)
            self.assertEqual(
                json.loads(gzip.decompress((result / snapshot_path).read_bytes())),
                GEOJSON,
            )
            self.assertEqual(
                json.loads((result / "index.json").read_text(encoding="utf-8")),
                [
                    {
                        "captured_at": "2026-09-05T12:17:04Z",
                        "path": snapshot_path,
                    }
                ],
            )


if __name__ == "__main__":
    unittest.main()
