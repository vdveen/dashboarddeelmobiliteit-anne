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
  formatShare,
  isoWeekNumber,
  knooppuntPolygon,
  knooppuntMetOf,
  knooppuntResult,
  knooppuntWindows,
  mergeResponses,
  monthOf,
  noonMoments,
  regionIds,
  requestWindow,
  shiftMonth,
  shiftWeek,
  sumShares,
  terreinPolygon,
  terreinResult,
  weekOf,
  weekParts,
  weeklyAverage,
} from './voiContract';

import './VoiContract.css';

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const REGIONS: ContractRegion[] = ['amersfoort', 'gooi'];

const dayFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam',
});

const monthFormatter = new Intl.DateTimeFormat('nl-NL', {
  month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam',
});

type PeriodMode = 'week' | 'maand';

const periodOf = (mode: PeriodMode, epochMs: number) =>
  (mode === 'week' ? weekOf(epochMs) : monthOf(epochMs));

// Week requests at once. voi-snapshot-api runs two workers, which also serve the Aanbod chart.
const REQUEST_CONCURRENCY = 2;

const formatAverage = (average: number | null) =>
  (average === null ? '-' : average.toLocaleString('nl-NL', { maximumFractionDigits: 1 }));

const statusColor = (met: boolean | null) => {
  if (met === null) return undefined;
  return met ? MET_COLOR : UNMET_COLOR;
};

const minuteCount = (minutes: number) => minutes.toLocaleString('nl-NL', { maximumFractionDigits: 1 });

/** The same minute totals, coverage and verdict in day, week and month cells. */
const MinuteShare: React.FC<{ result: ShareResult; strong?: boolean }> = ({ result, strong }) => {
  const status = knooppuntMetOf(result);
  const detail = result.totalMinutes === 0 ? 'Nog geen minuten in deze periode.' : [
    `${minuteCount(result.metMinutes)} van ${minuteCount(result.measuredMinutes)} minuten met meetgegevens hadden minstens ${KNOOPPUNT_MINIMUM} niet-defecte fietsen.`,
    `${minuteCount(result.measuredMinutes)} van ${minuteCount(result.totalMinutes)} minuten gedekt door metingen; ${minuteCount(result.unknownMinutes)} minuten onbekend en niet meegerekend.`,
    status === null ? 'Onvoldoende gegevens voor een oordeel.' : (status ? 'Norm gehaald.' : 'Norm niet gehaald.'),
  ].join(' ');
  return (
    <td style={{ color: statusColor(status) }} title={detail}>
      {strong ? <strong>{formatShare(result)}</strong> : formatShare(result)}
      {result.unknownMinutes > 0 && (
        <span className="VoiContract-coverage">{`${minuteCount(result.unknownMinutes)} min onbekend`}</span>
      )}
    </td>
  );
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
  const [mode, setMode] = useState<PeriodMode>('week');
  const [period, setPeriod] = useState<ContractWeek>(() => weekOf(Date.now()));
  // One response per calendar week of the period, in order
  const [responses, setResponses] = useState<ZoneCountsResponse[] | null>(null);
  const [parts, setParts] = useState<ContractWeek[]>([]);
  const [loadedParts, setLoadedParts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const terreinHubs = useTerreinHubs();

  const currentPeriod = periodOf(mode, Date.now());
  const isCurrentPeriod = period.start === currentPeriod.start;

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
    const now = Date.now();
    // A week per request keeps each query far below the API's timeout, and a
    // month (31 days plus the hour of a clock change) above its 31-day window.
    const periodParts = weekParts(period, now);
    setParts(periodParts);
    setLoadedParts(0);
    setIsLoading(true);
    setError(null);
    setResponses(null);

    const results: ZoneCountsResponse[] = [];
    let next = 0;
    const worker = async () => {
      while (next < periodParts.length) {
        const index = next;
        next += 1;
        const { from, to } = requestWindow(periodParts[index], now);
        results[index] = await fetchZoneCounts(zones, from, to, controller.signal);
        if (!controller.signal.aborted) setLoadedParts((count) => count + 1);
      }
    };
    Promise.all(Array.from({ length: REQUEST_CONCURRENCY }, worker))
      .then(() => {
        if (controller.signal.aborted) return;
        setResponses(results);
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setError(fetchError instanceof Error ? fetchError.message : 'De metingen konden niet worden geladen.');
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [period, terreinHubs, reloadKey]);

  const data = useMemo(() => (responses ? mergeResponses(responses) : null), [responses]);

  const switchMode = (next: PeriodMode) => {
    if (next === mode) return;
    setMode(next);
    setPeriod(periodOf(next, Math.min(Date.now(), period.end - 1)));
  };
  const shiftPeriod = (steps: number) =>
    setPeriod((value) => (mode === 'week' ? shiftWeek(value, steps) : shiftMonth(value, steps)));

  const partLabel = (part: ContractWeek) => (
    <>
      {`wk ${isoWeekNumber(weekOf(part.start))}`}
      <span className="VoiContract-partDates">
        {`${dayFormatter.format(new Date(part.start))} – ${dayFormatter.format(new Date(part.end - 1))}`}
      </span>
    </>
  );

  const periodLabel = mode === 'week'
    ? `Week ${isoWeekNumber(period)}: ${dayFormatter.format(new Date(period.start))} t/m ${dayFormatter.format(new Date(period.end - 1))}`
    : monthFormatter.format(new Date(period.start));
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
            windows={terrein ? [] : knooppuntWindows(period)}
            moments={terrein ? noonMoments(period) : []}
            showHubs={Boolean(terrein)}
          />
        </td>
      </tr>
    );
  };

  const knooppuntName = (knooppunt: typeof KNOOPPUNTEN[number]) => (
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
  );

  const hubsCell = (terrein: Bedrijventerrein) => (
    <td style={{ color: statusColor(hubsUnknown ? null : (terreinHubs?.[terrein.id]?.length ?? 0) >= terrein.minimumDropzones) }}>
      {hubsUnknown ? '-' : terreinHubs?.[terrein.id]?.length ?? 0}
    </td>
  );

  // Eis 2 per region: knooppunt bikes, and bedrijventerrein bikes where the region has a minimum
  const regionLines = REGIONS.flatMap((region) => {
    const lines = [{
      key: `${region}-knooppunt`, region, label: 'Knooppuntfietsen',
      ids: regionIds(KNOOPPUNTEN, region), minimum: REGION_KNOOPPUNT_MINIMUM[region],
    }];
    const terreinMinimum = REGION_BEDRIJVENTERREIN_MINIMUM[region];
    if (terreinMinimum !== null) {
      lines.push({
        key: `${region}-terrein`, region, label: 'Bedrijventerreinfietsen',
        ids: regionIds(BEDRIJVENTERREINEN, region), minimum: terreinMinimum,
      });
    }
    return lines;
  });

  const renderWeekView = (response: ZoneCountsResponse) => {
    const range = parts[0] ?? { start: period.start, end: period.start };
    const knooppuntResults = Object.fromEntries(KNOOPPUNTEN.map((knooppunt) => [knooppunt.id, knooppuntResult(response, knooppunt.id, range)]));
    return (
      <>
        <section>
          <h2>Gemiddelde over de week (Eis 2)</h2>
          <p className="VoiContract-muted">
            Gemiddeld aantal beschikbare fietsen over alle metingen van maandag 0:00 tot zondag 23:59.
          </p>
          <div className="VoiContract-summary">
            {REGIONS.map((region) => (
              <div key={region} className="VoiContract-summaryCard">
                <h3>{REGION_NAMES[region]}</h3>
                {regionLines.filter((line) => line.region === region).map((line) => {
                  const average = weeklyAverage(response, line.ids);
                  return (
                    <div key={line.key} className="VoiContract-summaryLine">
                      <span>{line.label}</span>
                      <strong style={{ color: average === null ? undefined : statusColor(average >= line.minimum) }}>
                        {formatAverage(average)}
                      </strong>
                      <span className="VoiContract-muted">{`minimum ${line.minimum}`}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Knooppunten (Eis 36)</h2>
          <KnooppuntExplanation />
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
                      return (
                        <React.Fragment key={knooppunt.id}>
                          <tr
                            className={`VoiContract-zoneRow${openZone === knooppunt.id ? ' is-open' : ''}`}
                            onClick={() => toggle(knooppunt.id)}
                          >
                            {knooppuntName(knooppunt)}
                            {result.days.map((day, index) => (
                              <MinuteShare key={WEEKDAYS[index]} result={day} />
                            ))}
                            <MinuteShare result={result.week} strong />
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
            {terreinUitleg}
            {hubsUnknown && hubsUnknownText}
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
                      {hubsCell(terrein)}
                      {terreinResult(response, terrein).map((day, index) => (
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
    );
  };

  const renderMonthView = (weekResponses: ZoneCountsResponse[]) => {
    const columns = parts.length + 1;
    return (
      <>
        <section>
          <h2>Gemiddelde per week (Eis 2)</h2>
          <p className="VoiContract-muted">
            Gemiddeld aantal beschikbare fietsen over alle metingen van de week. Weken aan het begin en eind van de maand tellen alleen de dagen in deze maand.
          </p>
          <div className="VoiContract-tableWrap">
            <table className="VoiContract-table">
              <thead>
                <tr>
                  <th>Regio</th>
                  <th>Minimum</th>
                  {parts.map((part) => <th key={part.start}>{partLabel(part)}</th>)}
                </tr>
              </thead>
              <tbody>
                {regionLines.map((line) => (
                  <tr key={line.key}>
                    <td>{`${REGION_NAMES[line.region]}: ${line.label.toLowerCase()}`}</td>
                    <td>{line.minimum}</td>
                    {weekResponses.map((response, index) => {
                      const average = weeklyAverage(response, line.ids);
                      return (
                        <td key={parts[index].start} style={{ color: average === null ? undefined : statusColor(average >= line.minimum) }}>
                          {formatAverage(average)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Knooppunten (Eis 36)</h2>
          <KnooppuntExplanation />
          <div className="VoiContract-tableWrap">
            <table className="VoiContract-table">
              <thead>
                <tr>
                  <th>Knooppunt</th>
                  {parts.map((part) => <th key={part.start}>{partLabel(part)}</th>)}
                  <th>Maand</th>
                </tr>
              </thead>
              <tbody>
                {REGIONS.map((region) => (
                  <React.Fragment key={region}>
                    <tr className="VoiContract-regionRow"><td colSpan={columns + 1}>{REGION_NAMES[region]}</td></tr>
                    {KNOOPPUNTEN.filter((knooppunt) => knooppunt.region === region).map((knooppunt) => {
                      const weeks = weekResponses.map((response, index) => knooppuntResult(response, knooppunt.id, parts[index]).week);
                      const month = sumShares(weeks);
                      return (
                        <React.Fragment key={knooppunt.id}>
                          <tr
                            className={`VoiContract-zoneRow${openZone === knooppunt.id ? ' is-open' : ''}`}
                            onClick={() => toggle(knooppunt.id)}
                          >
                            {knooppuntName(knooppunt)}
                            {weeks.map((week, index) => (
                              <MinuteShare key={parts[index].start} result={week} />
                            ))}
                            <MinuteShare result={month} strong />
                          </tr>
                          {renderChartRow(knooppunt.id, columns + 1)}
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
            {`Werkdagen waarop om 12:00 aan de norm werd voldaan, van de werkdagen met een meting. ${terreinUitleg}`}
            {hubsUnknown && hubsUnknownText}
          </p>
          <div className="VoiContract-tableWrap">
            <table className="VoiContract-table">
              <thead>
                <tr>
                  <th>Bedrijventerrein</th>
                  <th>Minimum</th>
                  <th>Hubs</th>
                  {parts.map((part) => <th key={part.start}>{partLabel(part)}</th>)}
                  <th>Maand</th>
                </tr>
              </thead>
              <tbody>
                {BEDRIJVENTERREINEN.map((terrein) => {
                  const weeks = weekResponses.map((response) => {
                    const days = terreinResult(response, terrein).filter((day) => day.met !== null);
                    return { met: days.filter((day) => day.met).length, measured: days.length };
                  });
                  const month = weeks.reduce(
                    (sum, week) => ({ met: sum.met + week.met, measured: sum.measured + week.measured }),
                    { met: 0, measured: 0 }
                  );
                  const cell = (value: { met: number; measured: number }) => (
                    value.measured === 0 ? '-' : `${value.met}/${value.measured}`
                  );
                  const color = (value: { met: number; measured: number }) =>
                    statusColor(value.measured === 0 ? null : value.met === value.measured);
                  return (
                    <React.Fragment key={terrein.id}>
                      <tr
                        className={`VoiContract-zoneRow${openZone === terrein.id ? ' is-open' : ''}`}
                        onClick={() => toggle(terrein.id)}
                      >
                        <td>{terrein.name}</td>
                        <td>{terrein.minimum}</td>
                        {hubsCell(terrein)}
                        {weeks.map((week, index) => (
                          <td key={parts[index].start} style={{ color: color(week) }}>{cell(week)}</td>
                        ))}
                        <td style={{ color: color(month) }}><strong>{cell(month)}</strong></td>
                      </tr>
                      {renderChartRow(terrein.id, columns + 3, terrein)}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="VoiContract">
      <div className="VoiContract-header">
        <div>
          <h1>Contractnaleving Voi</h1>
          <p className="VoiContract-muted">
            Niet-defecte Voi-fietsen per knooppunt en bedrijventerrein, uit het meetarchief. Of een fiets gereserveerd of direct verhuurbaar is, is niet bekend.
          </p>
        </div>
        <div className="VoiContract-weekNav">
          <div className="VoiContract-modes" role="group" aria-label="Periode">
            {(['week', 'maand'] as PeriodMode[]).map((option) => (
              <button key={option} type="button" aria-pressed={mode === option} onClick={() => switchMode(option)}>
                {option === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(-1)}>
            {mode === 'week' ? 'Vorige week' : 'Vorige maand'}
          </Button>
          <span className="VoiContract-weekLabel">{periodLabel}</span>
          <Button variant="outline" size="sm" disabled={isCurrentPeriod} onClick={() => shiftPeriod(1)}>
            {mode === 'week' ? 'Volgende week' : 'Volgende maand'}
          </Button>
          {!isCurrentPeriod && (
            <Button variant="outline" size="sm" onClick={() => setPeriod(currentPeriod)}>
              {mode === 'week' ? 'Deze week' : 'Deze maand'}
            </Button>
          )}
        </div>
      </div>

      {isCurrentPeriod && (
        <p className="VoiContract-muted">
          {`${mode === 'week' ? 'Deze week' : 'Deze maand'} loopt nog: alleen de verstreken tijd op het moment van laden telt mee.`}
        </p>
      )}

      {error && (
        <div className="VoiContract-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>Opnieuw</Button>
        </div>
      )}

      {(isLoading || terreinHubs === null) && (
        <>
          {parts.length > 1 && (
            <p className="VoiContract-muted">{`${loadedParts} van ${parts.length} weken geladen`}</p>
          )}
          <ChartSkeleton height="240px" />
        </>
      )}

      {responses && (mode === 'week' ? renderWeekView(responses[0] ?? mergeResponses([])) : renderMonthView(responses))}
    </div>
  );
};

const KnooppuntExplanation = () => (
  <div className="VoiContract-muted">
    <p>
      {`Norm: minstens ${KNOOPPUNT_MINIMUM} niet-defecte fietsen binnen ${KNOOPPUNT_RADIUS_M} m gedurende ${Math.round(KNOOPPUNT_TARGET_SHARE * 100)}% van de beschikbare minuten in de periode ${String(KNOOPPUNT_START_HOUR).padStart(2, '0')}:00–${KNOOPPUNT_END_HOUR}:00 uur, Nederlandse tijd. Klik op een rij voor de grafiek.`}
    </p>
    <details className="VoiContract-method">
      <summary>Berekening en ontbrekende metingen</summary>
      <p>
        Het percentage is het aantal minuten met minstens twee niet-defecte fietsen gedeeld door de
        minuten met meetgegevens. Bij een volledig gemeten dag is de norm 864 van 1.080 minuten.
        Het percentage is een schatting:
        elke meting geldt tot de volgende meting, maximaal 10 minuten. Vóór 8 september 2026 om 12:50
        gold maximaal 60 minuten. Week en maand tellen de minuten met meetgegevens op.
      </p>
      <p>
        Ontbrekende minuten tellen niet mee in het percentage en staan apart vermeld.
        Groen betekent minstens 80% van de minuten met meetgegevens, rood minder dan 80%.
        Zonder meetgegevens staat er een streepje en is er geen oordeel. Percentages zijn naar beneden
        afgerond op één decimaal. Houd de aanwijzer boven een percentage voor de minuten.
      </p>
      <p>{`Waar twee knooppunten binnen ${2 * KNOOPPUNT_RADIUS_M} m liggen, telt een fiets bij het dichtstbijzijnde.`}</p>
    </details>
  </div>
);

const terreinUitleg = 'Beschikbare fietsen en bezette dropzones (Voi-hubs met een fiets binnen 20 m) op werkdagen om 12:00. Norm: het minimum uit tabel 4, verdeeld over minstens 3 dropzones. Dropzones zijn de huidige Voi-hubs in het terrein. Klik op een rij voor de grafiek.';

const hubsUnknownText = ' De Voi-hubs konden niet worden geladen, dus alleen het aantal fietsen is getoetst.';

export default VoiContractMonitor;
