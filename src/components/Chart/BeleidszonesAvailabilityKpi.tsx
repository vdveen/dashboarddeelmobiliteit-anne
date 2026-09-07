import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment-timezone';
import { REPORTING_TIMEZONE } from '../../helpers/stats/time';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { StateType } from '../../types/StateType';
import {
  fetch5mAvailabilitySeries,
  computeAvailabilityKpi,
  getOperatorsInSeries,
  build5mSeriesCsv,
  MAX_5M_PERIOD_DAYS,
  FiveMinutePoint,
} from '../../helpers/stats/availability-kpi';
import { downloadCsv } from '../../helpers/stats/index';
import {
  getProviderColor,
  getPrettyProviderName,
  archivedProviders,
} from '../../helpers/providers.js';
import { getOperatorsScopeForStats } from '../../poll-api/pollTools.js';

interface BeleidszonesAvailabilityKpiProps {
  zoneId: number;
  zoneName?: string;
}

const hourOptions = Array.from({ length: 25 }, (_, i) => i);

function BeleidszonesAvailabilityKpi({ zoneId, zoneName }: BeleidszonesAvailabilityKpiProps) {
  const token = useSelector(
    (state: StateType) => state.authentication?.user_data?.token || null
  );
  const filter = useSelector((state: StateType) => state.filter);
  const metadata = useSelector((state: StateType) => state.metadata);

  const [threshold, setThreshold] = useState(1);
  const [windowStartHour, setWindowStartHour] = useState(8);
  const [windowEndHour, setWindowEndHour] = useState(20);
  const [series, setSeries] = useState<FiveMinutePoint[] | null>(null);
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endDate = filter.ontwikkelingtot;
  const selectedPeriodDays =
    filter.ontwikkelingvan && endDate
      ? moment.tz(endDate, REPORTING_TIMEZONE).startOf('day').diff(moment.tz(filter.ontwikkelingvan, REPORTING_TIMEZONE).startOf('day'), 'days') + 1
      : 0;
  // Selections longer than the cap are clamped to the most recent 90 days
  const periodClamped = selectedPeriodDays > MAX_5M_PERIOD_DAYS;
  const startDate = periodClamped
    ? moment.tz(endDate, REPORTING_TIMEZONE).startOf('day').subtract(MAX_5M_PERIOD_DAYS - 1, 'days').format('YYYY-MM-DD')
    : filter.ontwikkelingvan;

  // Provider exclusions are applied locally; the fetched scope and account own the data.
  const operatorScope = getOperatorsScopeForStats(metadata);
  const dataKey = JSON.stringify([zoneId, startDate, endDate, token, [...operatorScope].sort()]);
  const currentKey = useRef(dataKey);
  currentKey.current = dataKey;
  const requestRef = useRef<AbortController | null>(null);
  const seriesIsCurrent = series !== null && loadedForKey === dataKey;

  useEffect(() => {
    setSeries(null);
    setLoadedForKey(null);
    setLoading(false);
    setProgress(null);
    setError(null);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [dataKey]);

  // Providers unchecked in the filterbar, plus providers no longer shown in the UI
  const excludedOperators = useMemo(() => {
    const fromFilter = filter.aanbiedersexclude
      ? String(filter.aanbiedersexclude).split(',').filter(Boolean)
      : [];
    return [...fromFilter, ...archivedProviders];
  }, [filter.aanbiedersexclude]);

  const loadData = async () => {
    if (requestRef.current) return;
    const request = new AbortController();
    requestRef.current = request;
    const isCurrent = () => requestRef.current === request && currentKey.current === dataKey;
    setLoading(true);
    setSeries(null);
    setLoadedForKey(null);
    setError(null);
    setProgress(null);
    try {
      const result = await fetch5mAvailabilitySeries(
        token, zoneId, startDate, endDate, operatorScope,
        (done, total) => { if (isCurrent()) setProgress({ done, total }); },
        request.signal
      );
      if (!isCurrent()) return;
      setSeries(result);
      setLoadedForKey(dataKey);
    } catch (err) {
      if (!isCurrent() || request.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Er ging iets mis bij het ophalen van de data');
    } finally {
      if (isCurrent()) {
        requestRef.current = null;
        setLoading(false);
        setProgress(null);
      }
    }
  };

  const kpi = useMemo(() => {
    if (!seriesIsCurrent || !series) return null;
    return computeAvailabilityKpi(series, {
      windowStartHour,
      windowEndHour,
      threshold,
      excludedOperators,
      operators: operatorScope,
    });
  }, [series, seriesIsCurrent, windowStartHour, windowEndHour, threshold, excludedOperators, dataKey]);

  // Percentage of complete observations above the threshold, per day
  const pctChartData = useMemo(() => {
    if (!kpi) return [];
    return kpi.perDay.map((day) => ({
      name: moment(day.date).format('DD-MM'),
      pct: day.pct,
    }));
  }, [kpi]);

  // Average number of available vehicles per operator, per day
  const operatorChartData = useMemo(() => {
    if (!kpi) return [];
    return kpi.perDay.map((day) => ({
      name: moment(day.date).format('DD-MM'),
      ...day.avgPerOperator,
    }));
  }, [kpi]);

  const handleDownloadCsv = () => {
    if (!seriesIsCurrent || !series) return;
    const operators = getOperatorsInSeries(series, excludedOperators, operatorScope);
    const filename = `beschikbaarheid_5min_zone${zoneId}_${moment(startDate).format('YYYY-MM-DD')}_${moment(endDate).format('YYYY-MM-DD')}.csv`;
    downloadCsv(build5mSeriesCsv(series, operators), filename);
  };

  return (
    <div className="my-8">
      <h2 className="text-4xl my-2">Beschikbaarheid (5-minuten-data)</h2>
      <p className="text-gray-600 my-2">
        Percentage van de gemeten intervallen tussen{' '}
        {String(windowStartHour).padStart(2, '0')}:00 en{' '}
        {String(windowEndHour).padStart(2, '0')}:00 waarin de som van de maxima per aanbieder
        minimaal {threshold} {threshold === 1 ? 'voertuig' : 'voertuigen'} bedroeg
        {zoneName ? ` in ${zoneName}` : ''}. Tijden zijn in Europe/Amsterdam.
        Alleen volledige intervallen van vijf minuten met een meetwaarde voor iedere
        aangevinkte aanbieder tellen mee. Ontbrekende waarden blijven onbekend.
        De API levert per aanbieder het maximum binnen ieder interval. Deze maxima hoeven niet
        op hetzelfde moment gemeten te zijn.
      </p>

      <div className="flex flex-wrap items-end gap-4 my-4">
        <label className="flex flex-col text-sm text-gray-700">
          Drempel (voertuigen)
          <input
            type="number"
            min={1}
            className="border rounded px-2 py-1 w-24"
            value={threshold}
            onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Vanaf
          <select
            className="border rounded px-2 py-1"
            value={windowStartHour}
            onChange={(e) => setWindowStartHour(parseInt(e.target.value, 10))}
          >
            {hourOptions.filter((h) => h < windowEndHour).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Tot
          <select
            className="border rounded px-2 py-1"
            value={windowEndHour}
            onChange={(e) => setWindowEndHour(parseInt(e.target.value, 10))}
          >
            {hourOptions.filter((h) => h > windowStartHour).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-300"
        >
          {loading
            ? progress
              ? `Bezig met ophalen (${progress.done}/${progress.total})...`
              : 'Bezig met ophalen...'
            : seriesIsCurrent
              ? 'Opnieuw ophalen'
              : 'Haal 5-minuten-data op'}
        </button>
        {seriesIsCurrent && (
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="px-4 py-2 rounded border border-blue-600 text-blue-600"
          >
            Download CSV
          </button>
        )}
      </div>

      {periodClamped && (
        <p className="text-orange-700 my-2">
          De geselecteerde periode is {selectedPeriodDays} dagen; de
          5-minuten-data wordt beperkt tot de meest recente{' '}
          {MAX_5M_PERIOD_DAYS} dagen ({moment(startDate).format('DD-MM-YYYY')}{' '}
          t/m {moment(endDate).format('DD-MM-YYYY')}).
        </p>
      )}
      {error && <p role="alert" className="text-red-600 my-2">{error}</p>}
      {kpi && (
        <p className="text-gray-600 my-2" role="status">
          Meetdekking: {kpi.coveragePct}% ({kpi.observedIntervals} van {kpi.expectedIntervals} intervallen).
          {kpi.overallPct === null && ' Geen volledige metingen voor de geselecteerde aanbieders en tijden.'}
        </p>
      )}

      {kpi && kpi.overallPct !== null && (
        <div className="my-4">
          <span className="text-5xl font-bold">{kpi.overallPct}%</span>
          <span className="text-gray-600 ml-3">
            van de gemeten intervallen ({moment(startDate).format('DD-MM-YYYY')} t/m{' '}
            {moment(endDate).format('DD-MM-YYYY')})
          </span>
        </div>
      )}

      {kpi && kpi.overallPct !== null && pctChartData.length > 0 && (
        <>
          <h3 className="text-xl mt-6 mb-1">Percentage gemeten intervallen boven de drempel</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={pctChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" interval="preserveStartEnd" tickLine={false} />
                <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}%`, 'Boven drempel']} />
                <Bar dataKey="pct" fill="#15aeef" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="text-xl mt-8 mb-1">
            Gemiddelde meetwaarde per aanbieder bij volledige metingen
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={operatorChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" interval="preserveStartEnd" tickLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                {/* Legend labels in neutral ink; the colored swatch carries identity */}
                <Legend
                  formatter={(value) => (
                    <span style={{ color: '#374151' }}>{value}</span>
                  )}
                />
                {kpi.operators.map((operator, idx) => (
                  <Bar
                    key={operator}
                    dataKey={operator}
                    name={getPrettyProviderName(operator)}
                    stackId="operators"
                    fill={getProviderColor(metadata?.aanbieders ?? [], operator)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    radius={idx === kpi.operators.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default BeleidszonesAvailabilityKpi;
