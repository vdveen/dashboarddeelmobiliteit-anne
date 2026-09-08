import JSConfetti from 'js-confetti'
import moment from 'moment';
import maplibregl from 'maplibre-gl';
import localization from 'moment/locale/nl'

import { createVehiclePopup, createVehicleOverlapPopup } from './vehiclePopup';

// Set language for momentJS
moment.updateLocale('nl', localization);

const jsConfetti = new JSConfetti()
window.showConfetti = () => {
  jsConfetti.addConfetti()
  jsConfetti.addConfetti({
    emojis: ['🚲', '🚲', '🚴‍♀️', '🛵', '🛴', '🚗', '🚙', '✨', '✨'],
    emojiSize: 30,
    confettiNumber: 100,
  })
}

const removeExistingPopups = () => {
  // Only remove on mobile
  if(window.innerWidth > 640) return;
  // Remove existing popups
  const existingPopups = document.getElementsByClassName("mapboxgl-popup");
  if(existingPopups.length) {
    existingPopups[0].remove();
  }
}

export const initPopupLogic = (
  theMap,
  providers,
  canSeeVehicleId,
  filterDate,
  hidePopupProviderTitle = false
) => {
  // Docs: https://maplibre.org/maplibre-gl-js-docs/example/popup-on-click/
  const layerNamesToApplyPopupLogicTo = [
    'vehicles-point',
    'vehicles-clusters-point',
    'rentals-origins-point',
    'rentals-origins-clusters-point',
    'rentals-destinations-point',
    'rentals-destinations-clusters-point',
  ];

  let popup;

  const cleanups = [];
  layerNamesToApplyPopupLogicTo.forEach((layerName) => {
    // When a click event occurs on a feature in the places layer, open a popup at the
    // location of the feature, with its external values rendered as text.
    function clickHandler (e) {
      // Remove popups
      if(popup) popup.remove();
      // Remove popups in an other way,
      // because on mobile popup doesn't get removed on map click
      // Reason has to do with both maplibre + mapbox gl draw are installed
      removeExistingPopups();

      // Safety: MapLibre should always provide at least one feature, but avoid hard crashes.
      const features = e.features || [];
      if(! features.length) return;

      const properties = features[0].properties || {};
      const options = { canSeeVehicleId, filterDate, hideProviderTitle: hidePopupProviderTitle };
      const coordinatesFor = (feature) => {
        if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;
        const coordinates = feature.geometry.coordinates.slice();
        if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
        // Display the popup on the visible copy when the map wraps around.
        coordinates[0] += Math.round((e.lngLat.lng - coordinates[0]) / 360) * 360;
        return coordinates;
      };
      const coordinates = coordinatesFor(features[0]);
      if (!coordinates) return;
      const showVehicle = (feature) => {
        const selectedCoordinates = coordinatesFor(feature);
        if (!selectedCoordinates) return;
        popup.setLngLat(selectedCoordinates)
          .setDOMContent(createVehiclePopup(feature.properties || {}, providers, options));
      };
      const showOverlap = (layerName === 'vehicles-point' || layerName === 'vehicles-clusters-point')
        && properties.vehicle_id && features.length > 1;
      const contents = showOverlap
        ? createVehicleOverlapPopup(features, providers, options, showVehicle)
        : createVehiclePopup(properties, providers, options);
      popup = new maplibregl.Popup().setLngLat(coordinates).setDOMContent(contents).addTo(theMap);
    }
    const enter = () => { theMap.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { theMap.getCanvas().style.cursor = ''; };
    for (const [event, handler] of [['click', clickHandler], ['mouseenter', enter], ['mouseleave', leave]]) {
      theMap.on(event, layerName, handler);
      cleanups.push(() => theMap.off(event, layerName, handler));
    }
  });
  // MapLibre emits click for a tap too. Installing touchend as well opens twice.
  theMap.on('zoomstart', removeExistingPopups);
  theMap.on('movestart', removeExistingPopups);
  return () => {
    cleanups.forEach(cleanup => cleanup());
    theMap.off('zoomstart', removeExistingPopups);
    theMap.off('movestart', removeExistingPopups);
    if (popup) { popup.remove(); popup = null; }
  };
}
