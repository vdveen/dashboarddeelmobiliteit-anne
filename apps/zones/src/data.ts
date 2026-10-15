import { getMdsPublicUrl } from '../../../src/helpers/mdsUrl';

// Only public endpoints of dashboarddeelmobiliteit.nl. They need no key and
// send `Access-Control-Allow-Origin: *`.
const MAIN_API_URL = (process.env.REACT_APP_MAIN_API_URL || 'https://api.dashboarddeelmobiliteit.nl').replace(/\/$/, '');
const PUBLIC_API_URL = `${MAIN_API_URL}/dashboard-api/public`;

// The vehicle types of the dashboard's public filter, without "Onbekend"
// (cPublicVoertuigTypes in src/poll-api/metadataAccessControlList.js)
export const MODALITIES = [
  { id: 'bicycle', label: 'Fiets' },
  { id: 'cargo_bicycle', label: 'Bakfiets' },
  { id: 'moped', label: 'Scooter' },
  { id: 'car', label: 'Auto' }
] as const;

export type Modality = typeof MODALITIES[number]['id'];

// A stop with is_virtual false is a physical hub, one with is_virtual true a
// parking zone without anything on the street
export type ZoneKind = 'hub' | 'parking' | 'no_parking';

export interface Municipality {
  code: string;
  name: string;
  zoneId: string;
}

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json() as Promise<T>;
};

// The place list of the dashboard (loadPublicGebieden in
// src/poll-api/metadataAccessControlList.js), in the order the API returns it
export const fetchMunicipalities = async (): Promise<Municipality[]> => {
  const data = await getJson<{ municipalities?: { municipality?: string; gm_code?: string; name: string; zone_id: string }[] }>(
    `${PUBLIC_API_URL}/municipalities`
  );
  return (data.municipalities || [])
    .map((m) => ({ code: m.gm_code || m.municipality || '', name: m.name, zoneId: m.zone_id }))
    .filter((m) => m.code);
};

export const fetchMunicipalityBorder = async (zoneId: string): Promise<GeoJSON.Geometry | null> => {
  const data = await getJson<{ zones: { geojson: GeoJSON.Geometry }[] }>(
    `${PUBLIC_API_URL}/zones?zone_ids=${encodeURIComponent(zoneId)}&include_geojson=true`
  );
  return data.zones[0]?.geojson || null;
};

interface MdsZone {
  zone_id: number;
  name: string;
  municipality: string;
  geography_type: string;
  affected_modalities?: string[];
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  stop?: {
    is_virtual?: boolean;
    location?: GeoJSON.Feature<GeoJSON.Point>;
  };
}

export interface ZoneData {
  // Areas per kind, and the stop location of each hub and parking zone
  areas: Record<ZoneKind, GeoJSON.Feature[]>;
  points: Record<Exclude<ZoneKind, 'no_parking'>, GeoJSON.Feature[]>;
}

// Bounding box area in square degrees: enough to tell nested zones apart
const sizeOf = (geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number => {
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  const points = rings.flat();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

const kindOf = (zone: MdsZone): ZoneKind | null => {
  if (zone.geography_type === 'no_parking') return 'no_parking';
  if (zone.geography_type !== 'stop') return null;
  return zone.stop?.is_virtual === false ? 'hub' : 'parking';
};

// The whole national feed in one request (about 0.7 MB compressed). Moved
// zones keep their older version as `retirement_concept` next to the new one,
// so only active zones are asked for.
export const fetchZones = async (): Promise<ZoneData> => {
  const zones = await getJson<MdsZone[]>(`${getMdsPublicUrl()}/zones?phases=active`);
  const data: ZoneData = {
    areas: { hub: [], parking: [], no_parking: [] },
    points: { hub: [], parking: [] }
  };
  zones.forEach((zone) => {
    const kind = kindOf(zone);
    if (!kind || !zone.area?.geometry) return;
    const modalities = zone.affected_modalities || [];
    const properties: GeoJSON.GeoJsonProperties = {
      id: zone.zone_id,
      name: zone.name,
      kind,
      municipality: zone.municipality,
      modalities: modalities.join(','),
      size: sizeOf(zone.area.geometry)
    };
    // One flag per modality, for the map filters
    MODALITIES.forEach(({ id }) => {
      properties[`m_${id}`] = modalities.includes(id);
    });
    data.areas[kind].push({ type: 'Feature', geometry: zone.area.geometry, properties });
    if (kind !== 'no_parking' && zone.stop?.location?.geometry) {
      data.points[kind].push({ type: 'Feature', geometry: zone.stop.location.geometry, properties });
    }
  });
  return data;
};
