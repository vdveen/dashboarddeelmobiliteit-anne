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
import { getMapStyles } from '../components/Map/MapUtils/map';
import { Button } from '../components/ui/button';

import './VoiVehicleHistory.css';

const EMPTY_GEOJSON: VoiFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
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
  map.addSource('voi-history', {
    type: 'geojson',
    data: EMPTY_GEOJSON,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 34,
  });

  map.addLayer({
    id: 'voi-history-clusters',
    type: 'circle',
    source: 'voi-history',
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
    source: 'voi-history',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
  });

  map.addLayer({
    id: 'voi-history-points',
    type: 'circle',
    source: 'voi-history',
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
    const source = map.getSource('voi-history') as maplibregl.GeoJSONSource;
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

function VoiVehicleHistory() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const dataRef = useRef<VoiFeatureCollection>(EMPTY_GEOJSON);
  const cacheRef = useRef(new Map<string, Promise<VoiFeatureCollection>>());
  const wheelTimeRef = useRef(0);

  const [snapshots, setSnapshots] = useState<VoiSnapshot[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [geojson, setGeojson] = useState<VoiFeatureCollection>(EMPTY_GEOJSON);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSnapshot = snapshots[selectedIndex] ?? null;

  const loadSnapshot = useCallback((snapshot: VoiSnapshot) => {
    const cached = cacheRef.current.get(snapshot.downloadUrl);
    if (cached) return cached;

    const request = downloadVoiSnapshot(snapshot).catch((requestError) => {
      cacheRef.current.delete(snapshot.downloadUrl);
      throw requestError;
    });
    cacheRef.current.set(snapshot.downloadUrl, request);
    return request;
  }, []);

  const loadSnapshotList = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);
    try {
      const nextSnapshots = await listVoiSnapshots();
      setSnapshots(nextSnapshots);
      setSelectedIndex(Math.max(0, nextSnapshots.length - 1));
      if (nextSnapshots.length === 0) {
        setError('Er zijn nog geen openbare Voi-metingen beschikbaar.');
      }
    } catch (listError) {
      setError(listError instanceof Error ? listError.message : 'De metingen konden niet worden geladen.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshotList();
  }, [loadSnapshotList]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyles().base as maplibregl.StyleSpecification,
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
      const source = map.getSource('voi-history') as maplibregl.GeoJSONSource;
      source.setData(dataRef.current);
    });

    return () => {
      mapLoadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedSnapshot) return;

    let stillSelected = true;
    setIsLoadingSnapshot(true);
    setError(null);

    loadSnapshot(selectedSnapshot)
      .then((nextGeojson) => {
        if (!stillSelected) return;
        dataRef.current = nextGeojson;
        setGeojson(nextGeojson);
        if (mapLoadedRef.current && mapRef.current) {
          const source = mapRef.current.getSource('voi-history') as maplibregl.GeoJSONSource;
          source?.setData(nextGeojson);
        }
      })
      .catch((snapshotError) => {
        if (!stillSelected) return;
        setError(snapshotError instanceof Error ? snapshotError.message : 'De meting kon niet worden geladen.');
        setIsPlaying(false);
      })
      .finally(() => {
        if (stillSelected) setIsLoadingSnapshot(false);
      });

    const nextSnapshot = snapshots[selectedIndex + 1];
    if (nextSnapshot) loadSnapshot(nextSnapshot).catch(() => undefined);

    return () => {
      stillSelected = false;
    };
  }, [selectedSnapshot, selectedIndex, snapshots, loadSnapshot]);

  useEffect(() => {
    if (!isPlaying || snapshots.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setSelectedIndex((currentIndex) => {
        if (currentIndex >= snapshots.length - 1) {
          setIsPlaying(false);
          return currentIndex;
        }
        return currentIndex + 1;
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying, snapshots.length]);

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
    if (isLoadingSnapshot) return 'Meting laden...';
    if (!selectedSnapshot) return 'Geen meting geselecteerd';
    return `${featureCount.toLocaleString('nl-NL')} voertuigen`;
  }, [featureCount, isLoadingList, isLoadingSnapshot, selectedSnapshot]);

  return (
    <main className="VoiVehicleHistory">
      <div ref={mapContainerRef} className="VoiVehicleHistory-map" aria-label="Kaart met Voi-voertuigposities" />

      <header className="VoiVehicleHistory-heading">
        <div className="VoiVehicleHistory-kicker">Voi-monitor</div>
        <h1>Voertuigen door de tijd</h1>
        <div className="VoiVehicleHistory-headingMeta">
          <span className="VoiVehicleHistory-liveDot" aria-hidden="true" />
          {statusText}
        </div>
      </header>

      {error && (
        <div className="VoiVehicleHistory-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={loadSnapshotList}>
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
            <time dateTime={selectedSnapshot?.capturedAt}>
              {selectedSnapshot ? formatDateTime(selectedSnapshot.capturedAt) : 'Geen metingen'}
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

          {selectedSnapshot && (
            <a
              className="VoiVehicleHistory-download"
              href={selectedSnapshot.downloadUrl}
              download={selectedSnapshot.name}
              aria-label="Download de geselecteerde meting"
              title="Download GeoJSON.gz"
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
