import { ServiceAreaHistoryEvent } from '../../types/ServiceAreaHistoryEvent';
import { ServiceArea } from '../../types/ServiceArea';
import { ServiceAreaDelta } from '../../types/ServiceAreaDelta';
import moment from 'moment';
import { fetchJson } from '../../api/fetchJson';
import { getMdsPublicUrl } from '../mdsUrl';
import { getProviderColorForProvider } from '../providers';
import { classifyServiceAreaFeatures, hubCenter } from './roles';

export const loadServiceAreas = async (
  gebied: string,
  visible_operators: string[]
): Promise<ServiceArea[]> => {
  return await fetchServiceAreas(gebied, visible_operators);
};

export const loadServiceAreasHistory = async (
  gebied: string,
  visible_operators: string[]
): Promise<ServiceAreaHistoryEvent[]> => {
  const history = await fetchServiceAreasHistory(gebied, visible_operators);
  return keepOneEventPerDay(history);
};

export const loadServiceAreaDeltas = async (
  visible_operators: string[],
  searchParams: URLSearchParams
): Promise<ServiceAreaDelta | null> => {
  const versionId = searchParams.get('version');
  if (!versionId) {
    return null;
  }
  return await fetchServiceAreaDelta(versionId);
};

// The API reads a comma-joined value as one operator name, so repeat the
// parameter: operators=check&operators=voi
const operatorsQueryParam = (visible_operators: string[] | null | undefined): string | null => {
  if (!visible_operators || visible_operators.length === 0) {
    return null;
  }
  return visible_operators
    .map((x) => `operators=${encodeURIComponent(x.toLowerCase().replace(' ', ''))}`)
    .join('&');
};

const fetchServiceAreas = async (
  gebied: string,
  visible_operators: string[]
): Promise<ServiceArea[]> => {
  const operatorsString = operatorsQueryParam(visible_operators);
  if (!gebied || !operatorsString) {
    return [];
  }

  const url = `${getMdsPublicUrl()}/service_area?municipalities=${encodeURIComponent(gebied)}&${operatorsString}`;

  try {
    return await fetchJson<ServiceArea[]>(url);
  } catch (error) {
    console.error('Failed to load service areas:', error);
    return [];
  }
};

const fetchServiceAreasHistory = async (
  gebied: string,
  visible_operators: string[]
): Promise<ServiceAreaHistoryEvent[]> => {
  const operatorsString = operatorsQueryParam(visible_operators);
  if (!gebied || !operatorsString) {
    return [];
  }

  const startDate = '2024-10-01';
  const endDate = moment().format('YYYY-MM-DD');
  const url = `${getMdsPublicUrl()}/service_area/history?municipalities=${encodeURIComponent(gebied)}&${operatorsString}&start_date=${startDate}&end_date=${endDate}`;

  try {
    return await fetchJson<ServiceAreaHistoryEvent[]>(url);
  } catch (error) {
    console.error('Failed to load service areas history:', error);
    return [];
  }
};

const fetchServiceAreaDelta = async (
  service_area_version_id: string
): Promise<ServiceAreaDelta | null> => {
  if (!service_area_version_id || service_area_version_id === 'null') {
    return null;
  }

  const url = `${getMdsPublicUrl()}/service_area/delta/${encodeURIComponent(service_area_version_id)}`;

  try {
    return await fetchJson<ServiceAreaDelta>(url);
  } catch (error) {
    console.error('Failed to load service area delta:', error);
    return null;
  }
};

export const mergeServiceAreasToGeoJson = (
  service_areas: ServiceArea[]
): GeoJSON.FeatureCollection => {
  const features = service_areas.flatMap((service_area) =>
    (service_area.geometries?.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        municipality: service_area.municipality,
        operator: service_area.operator,
        valid_from: service_area.valid_from,
        service_area_version_id: service_area.service_area_version_id,
      },
    }))
  );

  return {
    type: 'FeatureCollection',
    features,
  };
};

export interface ServiceAreaMapData {
  areas: GeoJSON.FeatureCollection;
  hubs: GeoJSON.FeatureCollection;
  hubPoints: GeoJSON.FeatureCollection;
}

/**
 * Split service areas into what the map draws: areas and border bands for
 * Servicegebieden, hub circles and their centre points for Parkeerhubs. The
 * mask around the whole region is dropped; its hole is the service area,
 * which is already drawn.
 */
export const splitServiceAreasForMap = (
  service_areas: ServiceArea[]
): ServiceAreaMapData => {
  const areas: GeoJSON.Feature[] = [];
  const hubs: GeoJSON.Feature[] = [];
  const hubPoints: GeoJSON.Feature[] = [];

  service_areas.forEach((service_area) => {
    const features = service_area.geometries?.features || [];
    const roles = classifyServiceAreaFeatures(features);
    const color = getProviderColorForProvider(service_area.operator);

    features.forEach((feature, i) => {
      const role = roles[i];
      const properties = {
        ...feature.properties,
        operator: service_area.operator,
        color,
        role
      };
      if (role === 'mask') return;
      if (role !== 'hub') {
        areas.push({ ...feature, properties });
        return;
      }
      hubs.push({ ...feature, properties });
      const center = hubCenter(feature);
      if (center) {
        hubPoints.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: center },
          properties
        });
      }
    });
  });

  return {
    areas: { type: 'FeatureCollection', features: areas },
    hubs: { type: 'FeatureCollection', features: hubs },
    hubPoints: { type: 'FeatureCollection', features: hubPoints }
  };
};

export const downloadServiceAreasAsGeoJson = (
  service_areas: ServiceArea[],
  gebied: string,
  visible_operators: string[]
): boolean => {
  if (!service_areas || service_areas.length === 0) {
    return false;
  }

  const geojson = mergeServiceAreasToGeoJson(service_areas);
  const blob = new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' });
  const url = window.URL.createObjectURL(blob);

  const operatorsPart = visible_operators.join('-');
  const filename = `servicegebieden-${operatorsPart}-${gebied}-${moment().format('YYYY-MM-DD-HHmm')}.geojson`;

  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  return true;
};

const keepOneEventPerDay = (full_history: ServiceAreaHistoryEvent[]) => {
  const eventsByDay = new Map<string, ServiceAreaHistoryEvent>();

  const sortedHistory = [...full_history].sort(
    (a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime()
  );

  sortedHistory.forEach((event) => {
    const dateKey = new Date(event.valid_from).toISOString().split('T')[0];
    if (
      !eventsByDay.has(dateKey) ||
      new Date(event.valid_from) > new Date(eventsByDay.get(dateKey)!.valid_from)
    ) {
      eventsByDay.set(dateKey, event);
    }
  });

  return Array.from(eventsByDay.values());
};
