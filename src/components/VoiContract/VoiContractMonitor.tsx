import React, { useEffect, useMemo, useState } from 'react';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

import { fetchZoneCounts, ZoneCountsZone } from '../../api/voiZoneCounts';
import {
  BEDRIJVENTERREIN_MUNICIPALITIES,
  BEDRIJVENTERREINEN,
  Bedrijventerrein,
  ContractRegion,
  KNOOPPUNT_END_HOUR,
  KNOOPPUNT_MINIMUM,
  KNOOPPUNT_RADIUS_M,
  KNOOPPUNT_START_HOUR,
  KNOOPPUNT_TARGET_SHARE,
  KNOOPPUNTEN,
  REGION_BEDRIJVENTERREIN_MINIMUM,
  REGION_KNOOPPUNT_MINIMUM,
  REGION_NAMES,
} from '../../config/voiContractZones';
import { loadServiceAreas, splitServiceAreasForMap } from '../../helpers/service-areas';
import ChartSkeleton from '../Chart/ChartSkeleton';
import { Button } from '../ui/button';
import VoiContractChart, { MET_COLOR, UNMET_COLOR } from './VoiContractChart';
import {
  ContractWeek,
  ShareResult,
  ZoneCountsResponse,
  chartRows,
  isoWeekNumber,
  knooppuntPolygon,
  knooppuntResult,
  knooppuntWindows,
  noonMoments,
  regionIds,
  requestWindow,
  shiftWeek,
  terreinPolygon,
  terreinResult,
  weekOf,
  weeklyAverage,
} from './voiContract';

import './VoiContract.css';

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const REGIONS: ContractRegion[] = ['amersfoort', 'gooi'];

const dayFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam',
});

const formatShare = (result: ShareResult) =>
  result.share === null ? '-' : `${Math.round(result.share * 100)}%`;

const statusColor = (met: boolean | null) => {
  if (met === null) return undefined;
  return met ? MET_COLOR : UNMET_COLOR;
};

const KNOOPPUNT_POLYGONS = Object.fromEntries(KNOOPPUNTEN.map((knooppunt) => [
  knooppunt.id, knooppuntPolygon(knooppunt, KNOOPPUNTEN, KNOOPPUNT_RADIUS_M),
]));

/**
 * Voi's current hubs inside each bedrijventerrein, the dropzones Eis 39 counts.
 * Null while loading; an empty object when the service areas failed to load.
 */
function useTerreinHubs(): Record<string, [number, number][]> | null {
  const [hubs, setHubs] = useState<Record<string, [number, number][]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadServiceAreas(BEDRIJVENTERREIN_MUNICIPALITIES.join(','), ['voi'])
      .then((serviceAreas) => {
        if (cancelled) return;
        const points = splitServiceAreasForMap(serviceAreas).hubPoints.features
          .map((feature) => (feature.geometry as GeoJSON.Point).coordinates as [number, number]);
        setHubs(Object.fromEntries(BEDRIJVENTERREINEN.map((terrein) => [
          terrein.id,
          points.filter((point) => booleanPointInPolygon(point, terreinPolygon(terrein))),
        ])));
      })
      .catch((error) => {
        console.error('Unable to load Voi hubs for the bedrijventerreinen', error);
        if (!cancelled) setHubs({});
      });
    return () => { cancelled = true; };
  }, []);
  return hubs;
}

const mapLink = ([lon, lat]: [number, number]) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;

const VoiContractMonitor: React.FC = () => {
  const [week, setWeek] = useState<ContractWeek>(() => weekOf(Date.now()));
  const [data, setData] = useState<ZoneCountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const terreinHubs = useTerreinHubs();

  const currentWeek = weekOf(Date.now());
  const isCurrentWeek = week.start === currentWeek.start;

  useEffect(() => {
    if (terreinHubs === null) return undefined;
    const controller = new AbortController();
    const zones: ZoneCountsZone[] = [
      ...KNOOPPUNTEN.map((knooppunt) => ({ id: knooppunt.id, polygon: KNOOPPUNT_POLYGONS[knooppunt.id] })),
      ...BEDRIJVENTERREINEN.map((terrein) => ({
        id: terrein.id,
        polygon: terreinPolygon(terrein),
        hubs: terreinHubs[terrein.id],
      })),
    ];
    const { from, to } = requestWindow(week, Date.now());
    setIsLoading(true);
    setError(null);
    setData(null);
    fetchZoneCounts(zones, from, to, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'De metingen konden niet worden geladen.');
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [week, terreinHubs, reloadKey]);

  const knooppuntResults = useMemo(() => (data
    ? Object.fromEntries(KNOOPPUNTEN.map((knooppunt) => [knooppunt.id, knooppuntResult(data, knooppunt.id)]))
    : {}), [data]);
  const terreinResults = useMemo(() => (data
    ? Object.fromEntries(BEDRIJVENTERREINEN.map((terrein) => [terrein.id, terreinResult(data, terrein)]))
    : {}), [data]);

  const weekLabel = `Week ${isoWeekNumber(week)}: ${dayFormatter.format(new Date(week.start))} t/m ${dayFormatter.format(new Date(week.end - 1))}`;
  const hubsUnknown = terreinHubs !== null && Object.keys(terreinHubs).length === 0;

  const toggle = (id: string) => setOpenZone((current) => (current === id ? null : id));

  const renderChartRow = (id: string, columns: number, terrein?: Bedrijventerrein) => {
    if (openZone !== id || !data) return null;
    return (
      <tr className="VoiContract-chartRow">
        <td colSpan={columns}>
          <VoiContractChart
            id={id}
            rows={chartRows(data, id)}
            minimum={terrein ? terrein.minimum : KNOOPPUNT_MINIMUM}
            windows={terrein ? [] : knooppuntWindows(week)}
            moments={terrein ? noonMoments(week) : []}
            showHubs={Boolean(terrein)}
          />
        </td>
      </tr>
    );
  };

  const renderRegionSummary = (region: ContractRegion) => {
    const knooppuntAverage = data ? weeklyAverage(data, regionIds(KNOOPPUNTEN, region)) : null;
    const terreinMinimum = REGION_BEDRIJVENTERREIN_MINIMUM[region];
    const terreinAverage = data && terreinMinimum !== null
      ? weeklyAverage(data, regionIds(BEDRIJVENTERREINEN, region))
      : null;
    const line = (label: string, average: number | null, minimum: number) => (
      <div className="VoiContract-summaryLine">
        <span>{label}</span>
        <strong style={{ color: average === null ? undefined : statusColor(average >= minimum) }}>
          {average === null ? '-' : average.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}
        </strong>
        <span className="VoiContract-muted">{`minimum ${minimum}`}</span>
      </div>
    );
    return (
      <div key={region} className="VoiContract-summaryCard">
        <h3>{REGION_NAMES[region]}</h3>
        {line('Knooppuntfietsen', knooppuntAverage, REGION_KNOOPPUNT_MINIMUM[region])}
        {terreinMinimum !== null && line('Bedrijventerreinfietsen', terreinAverage, terreinMinimum)}
      </div>
    );
  };

  return (
    <div className="VoiContract">
      <div className="VoiContract-header">
        <div>
          <h1>Contractnaleving Voi</h1>
          <p className="VoiContract-muted">
            Beschikbare (niet-defecte) Voi-fietsen per knooppunt en bedrijventerrein, uit het meetarchief van tien minuten.
          </p>
        </div>
        <div className="VoiContract-weekNav" role="group" aria-label="Week">
          <Button variant="outline" size="sm" onClick={() => setWeek((value) => shiftWeek(value, -1))}>
            Vorige week
          </Button>
          <span className="VoiContract-weekLabel">{weekLabel}</span>
          <Button variant="outline" size="sm" disabled={isCurrentWeek} onClick={() => setWeek((value) => shiftWeek(value, 1))}>
            Volgende week
          </Button>
          {!isCurrentWeek && (
            <Button variant="outline" size="sm" onClick={() => setWeek(currentWeek)}>Deze week</Button>
          )}
        </div>
      </div>

      {isCurrentWeek && (
        <p className="VoiContract-muted">Deze week loopt nog: de cijfers gaan tot de laatste meting.</p>
      )}

      {error && (
        <div className="VoiContract-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>Opnieuw</Button>
        </div>
      )}

      {(isLoading || terreinHubs === null) && <ChartSkeleton height="240px" />}

      {data && (
        <>
          <section>
            <h2>Gemiddelde over de week (Eis 2)</h2>
            <p className="VoiContract-muted">
              Gemiddeld aantal beschikbare fietsen over alle metingen van maandag 0:00 tot zondag 23:59.
            </p>
            <div className="VoiContract-summary">{REGIONS.map(renderRegionSummary)}</div>
          </section>

          <section>
            <h2>Knooppunten (Eis 36)</h2>
            <p className="VoiContract-muted">
              {`Aandeel van de metingen tussen ${KNOOPPUNT_START_HOUR}:00 en ${KNOOPPUNT_END_HOUR}:00 met minstens ${KNOOPPUNT_MINIMUM} beschikbare fietsen binnen ${KNOOPPUNT_RADIUS_M} m. Norm: ${Math.round(KNOOPPUNT_TARGET_SHARE * 100)}%. Waar twee knooppunten binnen ${2 * KNOOPPUNT_RADIUS_M} m liggen, telt een fiets bij het dichtstbijzijnde. Klik op een rij voor de grafiek.`}
            </p>
            <div className="VoiContract-tableWrap">
              <table className="VoiContract-table">
                <thead>
                  <tr>
                    <th>Knooppunt</th>
                    {WEEKDAYS.map((day) => <th key={day}>{day}</th>)}
                    <th>Week</th>
                  </tr>
                </thead>
                <tbody>
                  {REGIONS.map((region) => (
                    <React.Fragment key={region}>
                      <tr className="VoiContract-regionRow"><td colSpan={9}>{REGION_NAMES[region]}</td></tr>
                      {KNOOPPUNTEN.filter((knooppunt) => knooppunt.region === region).map((knooppunt) => {
                        const result = knooppuntResults[knooppunt.id];
                        const metOf = (share: ShareResult) => (share.share === null ? null : share.share >= KNOOPPUNT_TARGET_SHARE);
                        return (
                          <React.Fragment key={knooppunt.id}>
                            <tr
                              className={`VoiContract-zoneRow${openZone === knooppunt.id ? ' is-open' : ''}`}
                              onClick={() => toggle(knooppunt.id)}
                            >
                              <td>
                                {knooppunt.name}
                                {' '}
                                <a
                                  href={mapLink(knooppunt.point)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  title={knooppunt.unverified ? 'Locatie is een Voi-hub; controleer de plek' : 'Bekijk de plek op de kaart'}
                                >
                                  {knooppunt.unverified ? 'kaart (controleren)' : 'kaart'}
                                </a>
                              </td>
                              {result.days.map((day, index) => (
                                <td key={WEEKDAYS[index]} style={{ color: statusColor(metOf(day)) }}>{formatShare(day)}</td>
                              ))}
                              <td style={{ color: statusColor(metOf(result.week)) }}>
                                <strong>{formatShare(result.week)}</strong>
                              </td>
                            </tr>
                            {renderChartRow(knooppunt.id, 9)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Bedrijventerreinen (Eis 39)</h2>
            <p className="VoiContract-muted">
              {'Beschikbare fietsen en bezette dropzones (Voi-hubs met een fiets binnen 20 m) op werkdagen om 12:00. Norm: het minimum uit tabel 4, verdeeld over minstens 3 dropzones. Dropzones zijn de huidige Voi-hubs in het terrein. Klik op een rij voor de grafiek.'}
              {hubsUnknown && ' De Voi-hubs konden niet worden geladen, dus alleen het aantal fietsen is getoetst.'}
            </p>
            <div className="VoiContract-tableWrap">
              <table className="VoiContract-table">
                <thead>
                  <tr>
                    <th>Bedrijventerrein</th>
                    <th>Minimum</th>
                    <th>Hubs</th>
                    {WEEKDAYS.slice(0, 5).map((day) => <th key={day}>{day}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {BEDRIJVENTERREINEN.map((terrein) => (
                    <React.Fragment key={terrein.id}>
                      <tr
                        className={`VoiContract-zoneRow${openZone === terrein.id ? ' is-open' : ''}`}
                        onClick={() => toggle(terrein.id)}
                      >
                        <td>{terrein.name}</td>
                        <td>{terrein.minimum}</td>
                        <td style={{ color: statusColor(hubsUnknown ? null : (terreinHubs?.[terrein.id]?.length ?? 0) >= terrein.minimumDropzones) }}>
                          {hubsUnknown ? '-' : terreinHubs?.[terrein.id]?.length ?? 0}
                        </td>
                        {terreinResults[terrein.id].map((day, index) => (
                          <td key={WEEKDAYS[index]} style={{ color: statusColor(day.met) }}>
                            {day.operational === null ? '-' : (
                              <>
                                {day.operational}
                                {day.occupiedHubs !== null && (
                                  <span className="VoiContract-muted">{` (${day.occupiedHubs} dz)`}</span>
                                )}
                              </>
                            )}
                          </td>
                        ))}
                      </tr>
                      {renderChartRow(terrein.id, 8, terrein)}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default VoiContractMonitor;
