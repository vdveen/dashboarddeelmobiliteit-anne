import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  renderServiceAreas,
  removeServiceAreasFromMap,
  renderParkingHubs,
  removeParkingHubsFromMap,
} from '../Map/MapUtils/map.service_areas';
import { applyDataLayerOrderWhenReady } from '../Map/MapUtils/dataLayerOrder';
import { loadServiceAreas, splitServiceAreasForMap } from '../../helpers/service-areas';
import { getAvailableOperators } from '../../api/service-areas';
import { selectDataLayerOrder } from '../../helpers/layerSelectors';
import { DISPLAYMODE_SERVICE_AREAS } from '../../reducers/layers.js';

import { StateType } from '../../types/StateType';
import { ServiceArea } from '../../types/ServiceArea';

interface DdServiceAreasOverlayProps {
  map: any;
  // Draw areas and border bands ("Servicegebieden")
  showAreas: boolean;
  // Draw parking hub circles with a parking icon ("Parkeerhubs")
  showHubs: boolean;
}

/**
 * Renders service areas and parking hubs as overlay layers. On
 * /map/servicegebieden it only draws the hubs, for the operator chosen there;
 * DdServiceAreasLayer owns the areas and the version history. On other map
 * pages it follows the operators selected in the Aanbieders filter.
 */
const DdServiceAreasOverlay = ({
  map,
  showAreas,
  showHubs
}: DdServiceAreasOverlayProps): JSX.Element => {
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [availableOperators, setAvailableOperators] = useState<string[]>([]);

  const gebied = useSelector((state: StateType) => state.filter?.gebied || '');
  const aanbiedersexclude = useSelector((state: StateType) => state.filter?.aanbiedersexclude || '');
  const serviceAreasPageOperators = useSelector((state: StateType) => {
    return state.service_areas ? state.service_areas.visible_operators : null;
  });
  const mapStyle = useSelector((state: StateType) => state.layers?.map_style || null);
  const displayMode = useSelector((state: StateType) => state.layers?.displaymode || '');
  const dataLayerOrder = useSelector(selectDataLayerOrder);

  const isServiceAreasPage = displayMode === DISPLAYMODE_SERVICE_AREAS;

  // Operators that publish a service area in this municipality
  useEffect(() => {
    if (!gebied || isServiceAreasPage) {
      setAvailableOperators([]);
      return;
    }

    let isStale = false;
    getAvailableOperators(gebied).then((response) => {
      if (isStale) return;
      setAvailableOperators(response?.operators_with_service_area || []);
    });

    return () => {
      isStale = true;
    };
  }, [gebied, isServiceAreasPage]);

  // Comma-joined so the load effect only reruns when the selection changes
  const operatorsKey = useMemo(() => {
    if (isServiceAreasPage) {
      return (serviceAreasPageOperators || []).join(',');
    }
    const excluded = aanbiedersexclude.split(',');
    return availableOperators.filter((operator) => !excluded.includes(operator)).join(',');
  }, [isServiceAreasPage, serviceAreasPageOperators, aanbiedersexclude, availableOperators]);

  // Load service areas for the selected municipality and operators
  useEffect(() => {
    if (!gebied || !operatorsKey) {
      setServiceAreas([]);
      return;
    }

    let isStale = false;

    loadServiceAreas(gebied, operatorsKey.split(','))
      .then((service_areas) => {
        if (isStale) return;
        setServiceAreas(service_areas.filter((x) => x.municipality === gebied));
      })
      .catch((error) => {
        console.error('Error loading service areas:', error);
      });

    return () => {
      isStale = true;
    };
  }, [gebied, operatorsKey]);

  const mapData = useMemo(() => splitServiceAreasForMap(serviceAreas), [serviceAreas]);

  // The selector returns a new object on every call; compare by value
  const dataLayerOrderKey = JSON.stringify(dataLayerOrder[displayMode] || null);

  // Render service areas on the map
  useEffect(() => {
    if (!map || !showAreas) return;

    if (mapData.areas.features.length === 0) {
      removeServiceAreasFromMap(map);
      return;
    }

    renderServiceAreas(map, mapData.areas);

    // Re-apply the user-defined z-order now that the layers exist
    applyDataLayerOrderWhenReady(map, JSON.parse(dataLayerOrderKey) || undefined, displayMode);
  }, [map, showAreas, mapData, mapStyle, displayMode, dataLayerOrderKey]);

  // Render parking hubs on the map
  useEffect(() => {
    if (!map || !showHubs) return;

    if (mapData.hubs.features.length === 0) {
      removeParkingHubsFromMap(map);
      return;
    }

    renderParkingHubs(map, mapData.hubs, mapData.hubPoints);
    applyDataLayerOrderWhenReady(map, JSON.parse(dataLayerOrderKey) || undefined, displayMode);
  }, [map, showHubs, mapData, mapStyle, displayMode, dataLayerOrderKey]);

  // Remove a layer when it is switched off or the overlay unmounts
  useEffect(() => {
    if (!map || !showAreas) return;
    return () => removeServiceAreasFromMap(map);
  }, [map, showAreas]);

  useEffect(() => {
    if (!map || !showHubs) return;
    return () => removeParkingHubsFromMap(map);
  }, [map, showHubs]);

  return <></>;
}

export default DdServiceAreasOverlay;
