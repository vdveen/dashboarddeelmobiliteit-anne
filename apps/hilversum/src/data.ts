import { getMdsPublicUrl } from '../../../src/helpers/mdsUrl';
import { ServiceArea } from '../../../src/types/ServiceArea';

// Only public endpoints of dashboarddeelmobiliteit.nl. They need no key and
// send `Access-Control-Allow-Origin: *`.
const MAIN_API_URL = (process.env.REACT_APP_MAIN_API_URL || 'https://api.dashboarddeelmobiliteit.nl').replace(/\/$/, '');
const PUBLIC_API_URL = `${MAIN_API_URL}/dashboard-api/public`;

// Wijdemeren merges with Hilversum, so the viewer shows both. Zone ids come
// from /dashboard-api/public/municipalities.
export const MUNICIPALITIES = [
  { code: 'GM0402', zoneId: 34188, name: 'Hilversum' },
  { code: 'GM1696', zoneId: 34353, name: 'Wijdemeren' }
];

// Other municipalities where Voi publishes parking spots. In bike mode their
// P signs show too, so people can see where they can ride to. The service
// area API needs a municipalities list, and asking Voi's areas for all 356
// municipalities returns 8 MB, so the list is kept here. Found on 2026-10-10:
// Voi's areas exist in 63 municipalities, hubs in these 9 plus the region.
export const VOI_HUB_OPERATOR = 'voi';
export const VOI_HUB_MUNICIPALITIES = [
  { code: 'GM0307', name: 'Amersfoort' },
  { code: 'GM0308', name: 'Baarn' },
  { code: 'GM0376', name: 'Blaricum' },
  { code: 'GM0317', name: 'Eemnes' },
  { code: 'GM1942', name: 'Gooise Meren' },
  { code: 'GM0014', name: 'Groningen' },
  { code: 'GM0406', name: 'Huizen' },
  { code: 'GM0417', name: 'Laren' },
  { code: 'GM0342', name: 'Soest' }
];

export const municipalityName = (code: string): string =>
  [...MUNICIPALITIES, ...VOI_HUB_MUNICIPALITIES].find((m) => m.code === code)?.name || code;

// Bounding box of both municipalities, so the first frame is already framed
export const REGION_BOUNDS: [number, number, number, number] = [5.0213, 52.1659, 5.219, 52.2855];

export type Category = 'bike' | 'moped' | 'car';

// Shared cars in the public feed are limited to the Greenwheels and MyWheels
// pilot
const PILOT_CAR_OPERATORS = ['greenwheels', 'mywheels'];

export interface PublicVehicle {
  system_id: string;
  form_factor?: string;
  location: { latitude: number; longitude: number };
}

export const categoryOf = (vehicle: PublicVehicle): Category | null => {
  switch (vehicle.form_factor) {
    case 'bicycle':
    case 'cargo_bicycle':
      return 'bike';
    case 'moped':
      return 'moped';
    case 'car':
      return PILOT_CAR_OPERATORS.includes(vehicle.system_id) ? 'car' : null;
    default:
      return null;
  }
};

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json() as Promise<T>;
};

export const fetchVehicles = async (): Promise<PublicVehicle[]> => {
  const zoneIds = MUNICIPALITIES.map((m) => m.zoneId).join(',');
  const data = await getJson<{ vehicles_in_public_space?: PublicVehicle[] }>(
    `${PUBLIC_API_URL}/vehicles_in_public_space?zone_ids=${zoneIds}`
  );
  if (!Array.isArray(data.vehicles_in_public_space)) throw new Error('Invalid vehicle response');
  return data.vehicles_in_public_space;
};

export const fetchMunicipalityBorders = async (): Promise<GeoJSON.FeatureCollection> => {
  const zoneIds = MUNICIPALITIES.map((m) => m.zoneId).join(',');
  const data = await getJson<{ zones: { zone_id: number; name: string; geojson: GeoJSON.Geometry }[] }>(
    `${PUBLIC_API_URL}/zones?zone_ids=${zoneIds}&include_geojson=true`
  );
  return {
    type: 'FeatureCollection',
    features: data.zones.map((zone) => ({
      type: 'Feature',
      geometry: zone.geojson,
      properties: { name: zone.name }
    }))
  };
};

// The API reads a comma-joined value as one name, so repeat each parameter
export const fetchServiceAreas = async (
  operators: string[],
  municipalityCodes: string[] = MUNICIPALITIES.map((m) => m.code)
): Promise<ServiceArea[]> => {
  if (operators.length === 0 || municipalityCodes.length === 0) return [];
  const params = [
    ...municipalityCodes.map((code) => `municipalities=${code}`),
    ...operators.map((operator) => `operators=${encodeURIComponent(operator)}`)
  ].join('&');
  return getJson<ServiceArea[]>(`${getMdsPublicUrl()}/service_area?${params}`);
};

// Hubs that the municipality itself set out in the dashboard. The endpoint
// reads only the last `municipality` parameter, so ask per municipality.
// Older versions of a moved hub stay in the feed as `retirement_concept`;
// `phases=active` leaves those out.
interface PolicyZone {
  zone_id: number;
  name: string;
  municipality: string;
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  stop?: {
    location?: GeoJSON.Feature<GeoJSON.Point>;
    capacity?: Record<string, number>;
  };
}

export interface PolicyHubData {
  shapes: GeoJSON.Feature[];
  points: GeoJSON.Feature[];
}

const CAPACITY_CATEGORIES: Record<string, Category> = {
  bicycle: 'bike',
  cargo_bicycle: 'bike',
  moped: 'moped',
  car: 'car'
};

export const fetchPolicyHubs = async (): Promise<PolicyHubData> => {
  const zones = (await Promise.all(MUNICIPALITIES.map(({ code }) =>
    getJson<PolicyZone[]>(`${getMdsPublicUrl()}/zones?municipality=${code}&geography_types=stop&phases=active`)
  ))).flat();
  const result: PolicyHubData = { shapes: [], points: [] };
  zones.forEach((zone) => {
    const capacity: Partial<Record<Category, number>> = {};
    Object.entries(zone.stop?.capacity || {}).forEach(([formFactor, places]) => {
      const category = CAPACITY_CATEGORIES[formFactor];
      if (category && places > 0) capacity[category] = (capacity[category] || 0) + places;
    });
    const properties = {
      id: zone.zone_id,
      name: zone.name,
      municipality: municipalityName(zone.municipality),
      capacity: JSON.stringify(capacity),
      // One flag per category, for the map filters
      bike: 'bike' in capacity,
      moped: 'moped' in capacity,
      car: 'car' in capacity
    };
    result.shapes.push({ type: 'Feature', geometry: zone.area.geometry, properties });
    if (zone.stop?.location) {
      result.points.push({ type: 'Feature', geometry: zone.stop.location.geometry, properties });
    }
  });
  return result;
};
