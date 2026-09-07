import {
  parseVoiSnapshotEntry,
  snapshotsFromIndex,
} from './voiSnapshots';

const entry = (name: string) => ({
  captured_at: 'not-used-for-parsing',
  path: `snapshots/${name}`,
});

describe('parseVoiSnapshotEntry', () => {
  it('reads the UTC capture time from the GeoJSON filename', () => {
    expect(parseVoiSnapshotEntry(
      entry('voi-vehicles-2026-09-04T11-18-17Z.geojson')
    )).toEqual({
      name: 'voi-vehicles-2026-09-04T11-18-17Z.geojson',
      capturedAt: '2026-09-04T11:18:17Z',
      downloadUrl: 'https://voi-snapshot-api-production.up.railway.app/snapshots/voi-vehicles-2026-09-04T11-18-17Z.geojson',
    });
  });

  it('ignores files that do not follow the snapshot filename format', () => {
    expect(parseVoiSnapshotEntry(entry('notes.txt'))).toBeNull();
  });
});

describe('snapshotsFromIndex', () => {
  it('returns valid snapshots in time order', () => {
    const entries = [
      entry('voi-vehicles-2026-09-04T11-18-17Z.geojson'),
      entry('notes.txt'),
      entry('voi-vehicles-2026-09-03T17-10-15Z.geojson'),
    ];

    const snapshots = snapshotsFromIndex(entries);

    expect(snapshots.map((snapshot) => snapshot.capturedAt)).toEqual([
      '2026-09-03T17:10:15Z',
      '2026-09-04T11:18:17Z',
    ]);
  });
});
