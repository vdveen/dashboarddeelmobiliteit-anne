import { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import maplibregl from 'maplibre-gl';

import { isOccupancyMaatstaf, kpiValue } from '../../helpers/rideEndPeaks';
import { whenMapLayersMutable } from '../Map/MapUtils/mapGuards';
import {
  KIND_COLORS,
  MAATSTAF_LABELS,
  describeSpot,
  formatInterval,
  formatKpi,
  kindLabel,
  spotName,
  useDrukteView,
  useSpotNames
} from '../Drukte/useDrukteSpots';
import { getPrettyProviderName } from '../../helpers/providers.js';
import { StateType } from '../../types/StateType';

const SOURCE = 'drukte-spots';
const TOO_FULL_COLOR = '#B0001C';
const CIRCLES = 'drukte-spots-circle';
const LABELS = 'drukte-spots-label';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const removeLayers = (map: any) => {
  if (!map?.getStyle?.()) return;
  [LABELS, CIRCLES].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
};

/**
 * The Drukte view of the Aanbod map: a circle per hub, place or spot outside
 * the hubs, sized by the chosen measure. Spots with no positive value (for
 * Boven normaal or Netto aankomst) are small and faded; for the vehicle
 * measures, hubs that were too full are red and the others faded.
 */
const DdDrukteLayer = ({ map }: { map: any }): JSX.Element => {
  const dispatch = useDispatch();
  const view = useDrukteView();
  const { settings, result } = view;
  const mapStyle = useSelector((state: StateType) => state.layers?.map_style || null);
  const names = useSpotNames(view.spots.slice(0, 40));
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const geojson = useMemo(() => {
    const hours = result?.hours || 0;
    return {
      type: 'FeatureCollection',
      features: view.spots.map((spot) => {
        const value = kpiValue(spot, settings.maatstaf, hours);
        // For the vehicle measures only the hubs that were too full stand out
        const tooFull = isOccupancyMaatstaf(settings.maatstaf) && (spot.occupancy?.overSnapshots || 0) > 0;
        const highlighted = isOccupancyMaatstaf(settings.maatstaf) ? tooFull : value > 0;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [spot.lon, spot.lat] },
          properties: {
            id: spot.id,
            color: tooFull ? TOO_FULL_COLOR : KIND_COLORS[spot.kind],
            rel: view.maxValue > 0 && value > 0 ? Math.sqrt(value / view.maxValue) : 0,
            positive: highlighted,
            label: formatKpi(spot, settings.maatstaf, hours),
            selected: settings.selected === spot.id
          }
        };
      })
    };
  }, [view.spots, view.maxValue, settings.maatstaf, settings.selected, result]);

  // Keep the newest spots for the click handler
  const spotsRef = useRef(view);
  spotsRef.current = view;
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    whenMapLayersMutable(map, () => {
      if (cancelled) return;
      const source = map.getSource(SOURCE);
      if (source) {
        source.setData(geojson);
        return;
      }
      map.addSource(SOURCE, { type: 'geojson', data: geojson });
      map.addLayer({
        id: CIRCLES,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['get', 'rel'], 0, 7, 1, 30],
          'circle-opacity': ['case', ['get', 'positive'], 0.85, 0.35],
          'circle-stroke-color': ['case', ['get', 'selected'], '#111827', '#FFFFFF'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5]
        }
      });
      map.addLayer({
        id: LABELS,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['get', 'rel'], 0, 10, 1, 14],
          'text-allow-overlap': true,
          'symbol-sort-key': ['-', 1, ['get', 'rel']]
        },
        paint: { 'text-color': '#FFFFFF' }
      });
    });
    return () => { cancelled = true; };
  }, [map, geojson, mapStyle]);

  // Remove the layers when the view closes
  useEffect(() => () => {
    popupRef.current?.remove();
    removeLayers(map);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onClick = (e: any) => {
      const id = e.features?.[0]?.properties?.id;
      const { spots, settings: s, result: r } = spotsRef.current;
      const spot = spots.find((x) => x.id === id);
      if (!spot || !r) return;
      dispatch({ type: 'SET_DRUKTE_SELECTED', payload: spot.id });
      const operators = Object.entries(spot.perOperator)
        .sort((a, b) => b[1] - a[1])
        .map(([op, n]) => `<li><span>${esc(getPrettyProviderName(op) || op)}</span> <b>${n}</b></li>`)
        .join('');
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: '300px' })
        .setLngLat([spot.lon, spot.lat])
        .setHTML(
          `<div class="text-sm font-bold">${esc(spotName(spot, namesRef.current) || 'Drukke plek')}</div>`
          + `<div class="text-xs text-gray-600">${esc(kindLabel(spot))}</div>`
          + `<div class="text-sm mt-1">${esc(MAATSTAF_LABELS[s.maatstaf].name)}: <b>${esc(formatKpi(spot, s.maatstaf, r.hours))}</b></div>`
          + `<div class="text-xs mt-1">${esc(describeSpot(spot, s.maatstaf, r.hours, s.druk_per_uur, s.te_vol))}</div>`
          + (spot.occupancy && spot.occupancy.intervals.length
            ? `<div class="text-xs mt-1 font-bold">Meer dan ${s.te_vol} voertuigen</div>`
              + `<ul class="text-xs" style="max-height:140px;overflow-y:auto">${spot.occupancy.intervals
                .map((x) => `<li>${esc(formatInterval(x))}</li>`).join('')}</ul>`
            : '')
          + `<ul class="text-xs mt-1">${operators}</ul>`
        )
        .addTo(map);
    };
    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', CIRCLES, onClick);
    map.on('mouseenter', CIRCLES, onEnter);
    map.on('mouseleave', CIRCLES, onLeave);
    return () => {
      map.off('click', CIRCLES, onClick);
      map.off('mouseenter', CIRCLES, onEnter);
      map.off('mouseleave', CIRCLES, onLeave);
    };
  }, [map, dispatch]);

  return <></>;
};

export default DdDrukteLayer;
