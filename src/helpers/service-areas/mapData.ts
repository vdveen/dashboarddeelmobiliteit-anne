import { ServiceArea } from '../../types/ServiceArea';
import { getProviderColorForProvider } from '../providers';
import { classifyServiceAreaFeatures, hubCenter } from './roles';

// Kept apart from index.ts so the Hilversum viewer can bundle it without the
// fetch helpers and moment.

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
