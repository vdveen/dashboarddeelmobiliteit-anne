CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS voi_snapshots (
    captured_at timestamptz PRIMARY KEY,
    collected_at timestamptz NOT NULL DEFAULT now(),
    title text NOT NULL,
    source_url text NOT NULL,
    feature_count integer NOT NULL CHECK (feature_count >= 0)
);

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
