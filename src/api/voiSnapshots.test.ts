import {
  GitHubRelease,
  parseVoiSnapshotAsset,
  snapshotsFromReleases,
} from './voiSnapshots';

const asset = (id: number, name: string) => ({
  id,
  name,
  browser_download_url: `https://example.test/${name}`,
  size: 9000,
});

describe('parseVoiSnapshotAsset', () => {
  it('reads the UTC capture time from the compressed GeoJSON filename', () => {
    expect(parseVoiSnapshotAsset(
      asset(1, 'voi-vehicles-2026-09-04T11-18-17Z.geojson.gz')
    )).toEqual({
      id: 1,
      name: 'voi-vehicles-2026-09-04T11-18-17Z.geojson.gz',
      capturedAt: '2026-09-04T11:18:17Z',
      downloadUrl: 'https://example.test/voi-vehicles-2026-09-04T11-18-17Z.geojson.gz',
      size: 9000,
    });
  });

  it('ignores files that do not follow the snapshot filename format', () => {
    expect(parseVoiSnapshotAsset(asset(1, 'notes.txt'))).toBeNull();
  });
});

describe('snapshotsFromReleases', () => {
  it('returns snapshots from the four newest monthly releases in time order', () => {
    const releases: GitHubRelease[] = [
      {
        id: 1,
        tag_name: 'voi-snapshots-2026-09',
        published_at: '2026-09-01T00:00:00Z',
        assets: [
          asset(2, 'voi-vehicles-2026-09-04T11-18-17Z.geojson.gz'),
          asset(1, 'voi-vehicles-2026-09-03T17-10-15Z.geojson.gz'),
        ],
      },
      ...['08', '07', '06', '05'].map((month, index) => ({
        id: index + 2,
        tag_name: `voi-snapshots-2026-${month}`,
        published_at: `2026-${month}-01T00:00:00Z`,
        assets: [asset(
          index + 3,
          `voi-vehicles-2026-${month}-01T00-00-00Z.geojson.gz`
        )],
      })),
      {
        id: 9,
        tag_name: 'v1.0.0',
        published_at: '2026-09-01T00:00:00Z',
        assets: [asset(99, 'voi-vehicles-2026-09-01T00-00-00Z.geojson.gz')],
      },
    ];

    const snapshots = snapshotsFromReleases(releases);

    expect(snapshots.map((snapshot) => snapshot.capturedAt)).toEqual([
      '2026-06-01T00:00:00Z',
      '2026-07-01T00:00:00Z',
      '2026-08-01T00:00:00Z',
      '2026-09-03T17:10:15Z',
      '2026-09-04T11:18:17Z',
    ]);
  });
});
