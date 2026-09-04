export interface GitHubReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  published_at: string | null;
  assets: GitHubReleaseAsset[];
}

export interface VoiSnapshot {
  id: number;
  name: string;
  capturedAt: string;
  downloadUrl: string;
  size: number;
}

export interface VoiFeatureCollection extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  title?: string;
  captured_at?: string;
  operator?: string;
  feature_count?: number;
}

const REPOSITORY = 'vdveen/dashboarddeelmobiliteit-anne';
const RELEASE_PREFIX = 'voi-snapshots-';
const SNAPSHOT_NAME = /^voi-vehicles-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.geojson\.gz$/;
const MAX_MONTHLY_RELEASES = 4;

export function parseVoiSnapshotAsset(asset: GitHubReleaseAsset): VoiSnapshot | null {
  const match = SNAPSHOT_NAME.exec(asset.name);
  if (!match) return null;

  const capturedAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  const capturedTime = Date.parse(capturedAt);
  if (!Number.isFinite(capturedTime)) return null;

  return {
    id: asset.id,
    name: asset.name,
    capturedAt,
    downloadUrl: asset.browser_download_url,
    size: asset.size,
  };
}

export function snapshotsFromReleases(releases: GitHubRelease[]): VoiSnapshot[] {
  const recentReleases = releases
    .filter((release) => release.tag_name.startsWith(RELEASE_PREFIX))
    .sort((left, right) => right.tag_name.localeCompare(left.tag_name))
    .slice(0, MAX_MONTHLY_RELEASES);

  return recentReleases
    .flatMap((release) => release.assets)
    .map(parseVoiSnapshotAsset)
    .filter((snapshot): snapshot is VoiSnapshot => snapshot !== null)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

export async function listVoiSnapshots(signal?: AbortSignal): Promise<VoiSnapshot[]> {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`,
    {
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub gaf status ${response.status} bij het laden van de metingen.`);
  }

  return snapshotsFromReleases(await response.json() as GitHubRelease[]);
}

export async function downloadVoiSnapshot(
  snapshot: VoiSnapshot,
  signal?: AbortSignal
): Promise<VoiFeatureCollection> {
  const response = await fetch(snapshot.downloadUrl, { signal });
  if (!response.ok) {
    throw new Error(`De meting kon niet worden geladen. Status ${response.status}.`);
  }
  if (!response.body) {
    throw new Error('De meting heeft geen leesbare inhoud.');
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Deze browser kan het gecomprimeerde GeoJSON-bestand niet openen.');
  }

  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
  const geojson = await new Response(decompressed).json() as VoiFeatureCollection;

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('De meting is geen geldige GeoJSON FeatureCollection.');
  }

  return geojson;
}
