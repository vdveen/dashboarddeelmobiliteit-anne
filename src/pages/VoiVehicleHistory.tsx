import { VoiSnapshotCache } from '../api/voiSnapshotCache';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  downloadVoiSnapshot,
  listVoiSnapshots,
  VoiFeatureCollection,
  VoiSnapshot,
} from '../api/voiSnapshots';
import { Button } from '../components/ui/button';

import './VoiVehicleHistory.css';

const EMPTY_GEOJSON: VoiFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type VehicleView = 'clusters' | 'heatmap';

const CLUSTER_SOURCE_ID = 'voi-history';
const HEATMAP_SOURCE_ID = 'voi-history-heatmap';
const HEATMAP_LAYER_ID = 'voi-history-heatmap';
const CLUSTER_LAYER_IDS = [
  'voi-history-clusters',
  'voi-history-cluster-count',
  'voi-history-points',
];

const VOI_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://a.tiles.mapbox.com/v4/fontstack/{fontstack}/{range}.pbf?access_token=pk.eyJ1IjoiYmFydHdyIiwiYSI6ImNsaXVqYnoybTE1ZGQzZW90YXNwNXE0YTMifQ.xdC_OTxwV95tNVjovRv9yg',
  sources: {
    'pdok-background': {
      type: 'raster',
      tiles: [
        'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Kaartgegevens: <a href="https://www.pdok.nl/">PDOK</a>',
    },
  },
  layers: [
    {
      id: 'pdok-background',
      type: 'raster',
      source: 'pdok-background',
    },
  ],
};

const dateTimeFormatter = new Intl.DateTimeFormat('nl-NL', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'Europe/Amsterdam',
});

const shortDateTimeFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
});

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function formatShortDateTime(value: string): string {
  return shortDateTimeFormatter.format(new Date(value));
}

function addVehicleLayers(map: maplibregl.Map) {
  map.addSource(HEATMAP_SOURCE_ID, {
    type: 'geojson',
    data: EMPTY_GEOJSON,
  });

  map.addSource(CLUSTER_SOURCE_ID, {
    type: 'geojson',
    data: EMPTY_GEOJSON,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 34,
  });

  map.addLayer({
    id: HEATMAP_LAYER_ID,
    type: 'heatmap',
    source: HEATMAP_SOURCE_ID,
    layout: {
      visibility: 'none',
    },
    paint: {
      // These expressions depend only on zoom. Every snapshot uses the same
      // weight, intensity, radius, and density-to-color mapping.
      'heatmap-weight': 1,
      'heatmap-intensity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 0.35,
        8, 0.7,
        11, 1.1,
        15, 1.5,
      ],
      'heatmap-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 8,
        8, 14,
        11, 22,
        15, 34,
      ],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(37, 92, 116, 0)',
        0.12, '#58a8c4',
        0.35, '#58c49c',
        0.58, '#f7d154',
        0.8, '#f1844f',
        1, '#bd3043',
      ],
      'heatmap-opacity': 0.88,
    },
  });

  map.addLayer({
    id: 'voi-history-clusters',
    type: 'circle',
    source: CLUSTER_SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#f26961',
      'circle-opacity': 0.88,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        16,
        25,
        21,
        100,
        28,
      ],
    },
  });

  map.addLayer({
    id: 'voi-history-cluster-count',
    type: 'symbol',
    source: CLUSTER_SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Arial Unicode MS Regular'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });

  map.addLayer({
    id: 'voi-history-points',
    type: 'circle',
    source: CLUSTER_SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#f26961',
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        7,
        3,
        14,
        7,
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });

  map.on('click', 'voi-history-clusters', (event) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.cluster_id;
    const source = map.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource;
    if (clusterId === undefined || !source) return;

    const coordinates = (feature.geometry as GeoJSON.Point).coordinates;
    source.getClusterExpansionZoom(clusterId, (clusterError, zoom) => {
      if (clusterError || zoom === null || zoom === undefined) return;
      map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
    });
  });

  map.on('mouseenter', 'voi-history-clusters', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'voi-history-clusters', () => {
    map.getCanvas().style.cursor = '';
  });
}

function setVehicleData(map: maplibregl.Map, data: VoiFeatureCollection) {
  [CLUSTER_SOURCE_ID, HEATMAP_SOURCE_ID].forEach((sourceId) => {
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
  });
}

function setVehicleView(map: maplibregl.Map, view: VehicleView) {
  if (!map.getLayer(HEATMAP_LAYER_ID)) return;

  map.setLayoutProperty(
    HEATMAP_LAYER_ID,
    'visibility',
    view === 'heatmap' ? 'visible' : 'none'
  );
  CLUSTER_LAYER_IDS.forEach((layerId) => {
    map.setLayoutProperty(
      layerId,
      'visibility',
      view === 'clusters' ? 'visible' : 'none'
    );
  });
  map.getCanvas().style.cursor = '';
}

function VoiVehicleHistory() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const dataRef = useRef<VoiFeatureCollection>(EMPTY_GEOJSON);
  const viewRef = useRef<VehicleView>('heatmap');
  const cacheRef = useRef(new VoiSnapshotCache());
  const listControllerRef = useRef<AbortController | null>(null);
  const wheelTimeRef = useRef(0);

  const [snapshots, setSnapshots] = useState<VoiSnapshot[]>([]);
  const [displayedSnapshot, setDisplayedSnapshot] = useState<VoiSnapshot | null>(null);
  const [retry, setRetry] = useState(0);
  const [failedKind, setFailedKind] = useState<'list' | 'snapshot'>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [geojson, setGeojson] = useState<VoiFeatureCollection>(EMPTY_GEOJSON);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vehicleView, setVehicleViewState] = useState<VehicleView>('heatmap');
  const [error, setError] = useState<string | null>(null);

  const selectedSnapshot = snapshots[selectedIndex] ?? null;

  const loadSnapshotList = useCallback(async () => {
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    setIsPlaying(false);
    setIsLoadingList(true);
    setError(null);
    try {
      const nextSnapshots = await listVoiSnapshots(controller.signal);
      if (controller.signal.aborted) return;
      setSnapshots(nextSnapshots);
      setSelectedIndex(Math.max(0, nextSnapshots.length - 1));
      if (nextSnapshots.length === 0) {
        setError('Er zijn nog geen openbare Voi-metingen beschikbaar.');
      }
    } catch (listError) {
      if (controller.signal.aborted) return;
      setFailedKind('list');
      setError(listError instanceof Error ? listError.message : 'De metingen konden niet worden geladen.');
    } finally {
      if (!controller.signal.aborted) setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshotList();
    return () => { listControllerRef.current?.abort(); cacheRef.current.clear(); };
  }, [loadSnapshotList]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: VOI_MAP_STYLE,
      center: [5.35, 52.15],
      zoom: 6.7,
      minZoom: 5,
      maxZoom: 19,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('load', () => {
      if (mapRef.current !== map) return;
      addVehicleLayers(map);
      mapLoadedRef.current = true;
      setVehicleData(map, dataRef.current);
      setVehicleView(map, viewRef.current);
    });

    return () => {
      mapLoadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    viewRef.current = vehicleView;
    if (mapLoadedRef.current && mapRef.current) {
      setVehicleView(mapRef.current, vehicleView);
    }
  }, [vehicleView]);

  useEffect(() => {
    if (!selectedSnapshot) return;

    let stillSelected = true;
    const controller = new AbortController();
    setIsLoadingSnapshot(true);
    setError(null);

    const cached = cacheRef.current.get(selectedSnapshot.downloadUrl);
    (cached ? Promise.resolve(cached) : downloadVoiSnapshot(selectedSnapshot, controller.signal))
      .then((nextGeojson) => {
        if (!stillSelected) return;
        cacheRef.current.put(selectedSnapshot.downloadUrl, nextGeojson);
        setDisplayedSnapshot(selectedSnapshot);
        dataRef.current = nextGeojson;
        setGeojson(nextGeojson);
        if (mapLoadedRef.current && mapRef.current) {
          setVehicleData(mapRef.current, nextGeojson);
        }
      })
      .catch((snapshotError) => {
        if (!stillSelected) return;
        setFailedKind('snapshot');
        setError(snapshotError instanceof Error ? snapshotError.message : 'De meting kon niet worden geladen.');
        setIsPlaying(false);
      })
      .finally(() => {
        if (stillSelected) setIsLoadingSnapshot(false);
      });

    return () => { stillSelected = false; controller.abort(); };
  }, [selectedSnapshot, retry]);

  useEffect(() => {
    if (!isPlaying || isLoadingSnapshot || error || displayedSnapshot !== selectedSnapshot) return;
    if (selectedIndex >= snapshots.length - 1) { setIsPlaying(false); return; }
    const timer = window.setTimeout(() => setSelectedIndex(index => index + 1), 900);
    return () => window.clearTimeout(timer);
  }, [isPlaying, isLoadingSnapshot, error, displayedSnapshot, selectedSnapshot, selectedIndex, snapshots.length]);

  const selectPrevious = useCallback(() => {
    setIsPlaying(false);
    setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);

  const selectNext = useCallback(() => {
    setIsPlaying(false);
    setSelectedIndex((currentIndex) => Math.min(snapshots.length - 1, currentIndex + 1));
  }, [snapshots.length]);

  const handleTimelineWheel = useCallback((event: React.WheelEvent) => {
    if (snapshots.length < 2 || Math.abs(event.deltaY) < 4) return;
    event.preventDefault();

    const now = Date.now();
    if (now - wheelTimeRef.current < 120) return;
    wheelTimeRef.current = now;
    setIsPlaying(false);
    setSelectedIndex((currentIndex) => {
      const direction = event.deltaY > 0 ? 1 : -1;
      return Math.max(0, Math.min(snapshots.length - 1, currentIndex + direction));
    });
  }, [snapshots.length]);

  const featureCount = geojson.feature_count ?? geojson.features.length;
  const timelineStart = snapshots[0];
  const timelineEnd = snapshots[snapshots.length - 1];
  const statusText = useMemo(() => {
    if (isLoadingList) return 'Metingen ophalen...';
    if (isLoadingSnapshot) return `Meting laden: ${selectedSnapshot ? formatDateTime(selectedSnapshot.capturedAt) : ''}. De kaart toont de laatst geladen meting.`;
    if (!selectedSnapshot) return 'Geen meting geselecteerd';
    return `${featureCount.toLocaleString('nl-NL')} voertuigen`;
  }, [featureCount, isLoadingList, isLoadingSnapshot, selectedSnapshot]);

  return (
    <main className="VoiVehicleHistory">
      <div
        ref={mapContainerRef}
        className="VoiVehicleHistory-map"
        aria-label={`Kaart met Voi-voertuigposities als ${vehicleView}`}
      />

      <header className="VoiVehicleHistory-heading">
        <div className="VoiVehicleHistory-kicker">Voi-monitor</div>
        <h1>Voertuigen door de tijd</h1>
        <div className="VoiVehicleHistory-headingMeta">
          <span className="VoiVehicleHistory-liveDot" aria-hidden="true" />
          {statusText}
        </div>
        <div className="VoiVehicleHistory-viewToggle" role="group" aria-label="Kaartweergave">
          <button
            type="button"
            aria-pressed={vehicleView === 'clusters'}
            onClick={() => setVehicleViewState('clusters')}
          >
            Clusters
          </button>
          <button
            type="button"
            aria-pressed={vehicleView === 'heatmap'}
            onClick={() => setVehicleViewState('heatmap')}
          >
            Heatmap
          </button>
        </div>
        {vehicleView === 'heatmap' && (
          <div
            className="VoiVehicleHistory-heatmapLegend"
            aria-label="Vaste heatmapschaal van lage naar hoge voertuigdichtheid"
          >
            <div className="VoiVehicleHistory-heatmapLegendHeading">
              <span>Voertuigdichtheid</span>
              <span>Vaste schaal</span>
            </div>
            <div className="VoiVehicleHistory-heatmapLegendScale" aria-hidden="true" />
            <div className="VoiVehicleHistory-heatmapLegendLabels" aria-hidden="true">
              <span>lager</span>
              <span>hoger</span>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="VoiVehicleHistory-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => failedKind === 'snapshot' ? setRetry(value => value + 1) : loadSnapshotList()}>
            <ReloadIcon /> Opnieuw
          </Button>
        </div>
      )}

      <section
        className="VoiVehicleHistory-timeline"
        aria-label="Tijdlijn"
        onWheel={handleTimelineWheel}
      >
        <div className="VoiVehicleHistory-current">
          <div>
            <div className="VoiVehicleHistory-currentLabel">Geselecteerde meting</div>
            <time dateTime={displayedSnapshot?.capturedAt}>
              {displayedSnapshot ? formatDateTime(displayedSnapshot.capturedAt) : 'Nog geen meting geladen'}
            </time>
          </div>
          <div className="VoiVehicleHistory-position">
            {snapshots.length > 0 ? `${selectedIndex + 1} van ${snapshots.length}` : '0 metingen'}
          </div>
        </div>

        <div className="VoiVehicleHistory-controls">
          <Button
            variant="outline"
            size="icon"
            onClick={selectPrevious}
            disabled={selectedIndex <= 0}
            aria-label="Vorige meting"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            className="VoiVehicleHistory-play"
            size="icon"
            onClick={() => setIsPlaying((playing) => !playing)}
            disabled={snapshots.length < 2 || selectedIndex >= snapshots.length - 1}
            aria-label={isPlaying ? 'Afspelen stoppen' : 'Metingen afspelen'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={selectNext}
            disabled={selectedIndex >= snapshots.length - 1}
            aria-label="Volgende meting"
          >
            <ChevronRightIcon />
          </Button>

          <div className="VoiVehicleHistory-rangeWrap">
            <input
              className="VoiVehicleHistory-range"
              type="range"
              min={0}
              max={Math.max(0, snapshots.length - 1)}
              value={selectedIndex}
              disabled={snapshots.length < 2}
              onChange={(event) => {
                setIsPlaying(false);
                setSelectedIndex(Number(event.target.value));
              }}
              aria-label="Selecteer een meting"
            />
            <div className="VoiVehicleHistory-rangeLabels" aria-hidden="true">
              <span>{timelineStart ? formatShortDateTime(timelineStart.capturedAt) : ''}</span>
              <span>{timelineEnd ? formatShortDateTime(timelineEnd.capturedAt) : ''}</span>
            </div>
          </div>

          {displayedSnapshot && (
            <a
              className="VoiVehicleHistory-download"
              href={displayedSnapshot.downloadUrl}
              download={displayedSnapshot.name}
              aria-label="Download de geselecteerde meting"
              title="Download GeoJSON"
            >
              <DownloadIcon />
            </a>
          )}
        </div>

        <p className="VoiVehicleHistory-hint">Sleep de tijdlijn of scroll boven dit paneel.</p>
      </section>
    </main>
  );
}

export default VoiVehicleHistory;
