import base64
import gzip
import json
import unittest
from datetime import datetime, timezone

from scripts.publish_voi_snapshot import (
    archive_path,
    encode_snapshot,
    publish_snapshot,
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


class PublishSnapshotTest(unittest.TestCase):
    def test_commits_the_snapshot_and_index_in_one_branch_update(self):
        calls = []
        blob_count = 0
        current_index = [
            {
                "captured_at": "2026-09-05T11:17:00Z",
                "path": "snapshots/older.geojson.gz",
            }
        ]

        def request(method, path, token, payload):
            nonlocal blob_count
            calls.append((method, path, token, payload))
            if path.endswith("/git/ref/heads/voi-vehicle-data"):
                return {"object": {"sha": "base-commit"}}
            if path.endswith("/git/commits/base-commit"):
                return {"tree": {"sha": "base-tree"}}
            if "/contents/index.json" in path:
                return {
                    "content": base64.b64encode(
                        json.dumps(current_index).encode("utf-8")
                    ).decode("ascii")
                }
            if path.endswith("/git/blobs"):
                blob_count += 1
                return {"sha": f"blob-{blob_count}"}
            if path.endswith("/git/trees"):
                return {"sha": "new-tree"}
            if path.endswith("/git/commits"):
                return {"sha": "new-commit"}
            if path.endswith("/git/refs/heads/voi-vehicle-data"):
                return {"object": {"sha": "new-commit"}}
            self.fail(f"Unexpected request: {method} {path}")

        commit_sha, snapshot_path = publish_snapshot(
            GEOJSON,
            CAPTURED_AT,
            "vdveen/dashboarddeelmobiliteit-anne",
            "voi-vehicle-data",
            "test-token",
            request,
        )

        self.assertEqual(commit_sha, "new-commit")
        self.assertEqual(snapshot_path, archive_path(CAPTURED_AT))
        tree_payload = next(
            payload for method, path, _, payload in calls
            if method == "POST" and path.endswith("/git/trees")
        )
        self.assertEqual(
            [entry["path"] for entry in tree_payload["tree"]],
            [archive_path(CAPTURED_AT), "index.json"],
        )
        ref_update = calls[-1]
        self.assertEqual(ref_update[0], "PATCH")
        self.assertEqual(ref_update[3], {"sha": "new-commit", "force": False})


if __name__ == "__main__":
    unittest.main()
