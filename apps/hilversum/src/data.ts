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
export const fetchServiceAreas = async (operators: string[]): Promise<ServiceArea[]> => {
  if (operators.length === 0) return [];
  const params = [
    ...MUNICIPALITIES.map((m) => `municipalities=${m.code}`),
    ...operators.map((operator) => `operators=${encodeURIComponent(operator)}`)
  ].join('&');
  return getJson<ServiceArea[]>(`${getMdsPublicUrl()}/service_area?${params}`);
};
