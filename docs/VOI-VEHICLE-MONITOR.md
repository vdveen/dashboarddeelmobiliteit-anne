# Use the Voi vehicle monitor

The `Monitor Voi vehicle positions` GitHub Actions workflow queries the public
vehicle API at 17 minutes past each hour. Each run stores one GeoJSON artifact
for 90 days. The API response has anonymous positions, vehicle type, and the
Voi operator ID. It does not have vehicle IDs.

The capture time is UTC. It appears in the artifact name, the `.geojson`
filename, the GeoJSON `title`, and the `captured_at` field.

## Download a snapshot

1. Open the repository's **Actions** page.
2. Select **Monitor Voi vehicle positions**.
3. Open a workflow run.
4. Download the `voi-vehicles-<timestamp>` artifact from **Artifacts**.

GitHub packages the GeoJSON file in a ZIP archive for download.

## Run the collector now

Open the workflow on the **Actions** page and select **Run workflow**. GitHub
stores manual runs with the same 90-day retention period.

To collect a local snapshot, run:

```bash
python3 scripts/collect_voi_vehicles.py
```

The command writes the file to `voi-vehicle-snapshots/`. Use `--output-dir`
to select another directory.
