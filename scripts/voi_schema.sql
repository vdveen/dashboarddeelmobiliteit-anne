CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS voi_snapshots (
    captured_at timestamptz PRIMARY KEY,
    collected_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    source_url text NOT NULL,
    feature_count integer NOT NULL CHECK (feature_count >= 0)
);
-- Added after the first snapshots: existing databases upgrade on initialize().
ALTER TABLE voi_snapshots ADD COLUMN IF NOT EXISTS skipped_count integer;
COMMENT ON COLUMN voi_snapshots.skipped_count IS
    'Records dropped from this snapshot for a bad location, coordinate, or status. NULL for snapshots stored before the column existed.';

CREATE TABLE IF NOT EXISTS voi_positions (
    objectid integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    captured_at timestamptz NOT NULL REFERENCES voi_snapshots(captured_at),
    system_id text NOT NULL,
    form_factor text,
    is_non_operational boolean,
    is_reserved boolean,
    is_available boolean,
    geom geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS voi_positions_capture_idx ON voi_positions(captured_at);
CREATE INDEX IF NOT EXISTS voi_positions_geom_idx ON voi_positions USING gist(geom);
COMMENT ON COLUMN voi_positions.is_non_operational IS
    'Dashboard non_operational status. NULL means not provided by the source.';
COMMENT ON COLUMN voi_positions.is_available IS
    'Explicit availability, or false when disabled/reserved. NULL is unknown; non-defect alone does not establish availability.';

-- Non-defect Voi counts per area at a past moment, as the dashboard API's
-- park_events answered them. The dashboard's availability chart reads these
-- instead of asking park_events again for every day it shows.
CREATE TABLE IF NOT EXISTS voi_operational_counts (
    zone_ids text NOT NULL,
    measured_at timestamptz NOT NULL,
    form_factor text NOT NULL,
    operational integer NOT NULL CHECK (operational >= 0),
    total integer NOT NULL CHECK (total >= operational),
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (zone_ids, measured_at, form_factor)
);
COMMENT ON COLUMN voi_operational_counts.zone_ids IS
    'Sorted, comma-separated dashboard zone_ids of the area, as the dashboard requests them.';
COMMENT ON COLUMN voi_operational_counts.form_factor IS
    'Vehicle form factor; an empty string when the source gave none.';
