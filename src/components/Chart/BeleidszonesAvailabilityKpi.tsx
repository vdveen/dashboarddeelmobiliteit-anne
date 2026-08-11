import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import moment from 'moment';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { StateType } from '../../types/StateType';
import {
  fetch5mAvailabilitySeries,
  computeAvailabilityKpi,
  build5mSeriesCsv,
  MAX_5M_PERIOD_DAYS,
  FiveMinutePoint,
} from '../../helpers/stats/availability-kpi';
import { downloadCsv } from '../../helpers/stats/index';

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
      ? moment(endDate).startOf('day').diff(moment(filter.ontwikkelingvan).startOf('day'), 'days') + 1
      : 0;
  // Selections longer than the cap are clamped to the most recent 90 days
  const periodClamped = selectedPeriodDays > MAX_5M_PERIOD_DAYS;
  const startDate = periodClamped
    ? moment(endDate).startOf('day').subtract(MAX_5M_PERIOD_DAYS - 1, 'days').format('YYYY-MM-DD')
    : filter.ontwikkelingvan;

  // The series belongs to one zone + period; invalidate when those change
  const dataKey = `${zoneId}|${startDate}|${endDate}`;
  const seriesIsCurrent = series !== null && loadedForKey === dataKey;

  const loadData = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const result = await fetch5mAvailabilitySeries(
        token,
        zoneId,
        startDate,
        endDate,
        (done, total) => setProgress({ done, total })
      );
      setSeries(result);
      setLoadedForKey(dataKey);
      if (result.length === 0) {
        setError('Geen data ontvangen voor deze zone en periode');
      }
    } catch (err) {
      console.error('BeleidszonesAvailabilityKpi loadData failed:', err);
      setError('Er ging iets mis bij het ophalen van de data');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const kpi = useMemo(() => {
    if (!seriesIsCurrent || !series) return null;
    return computeAvailabilityKpi(series, {
      windowStartHour,
      windowEndHour,
      threshold,
    });
  }, [series, seriesIsCurrent, windowStartHour, windowEndHour, threshold]);

  const chartData = useMemo(() => {
    if (!kpi) return [];
    return kpi.perDay.map((day) => ({
      name: moment(day.date).format('DD-MM'),
      pct: day.pct,
    }));
  }, [kpi]);

  const handleDownloadCsv = () => {
    if (!seriesIsCurrent || !series) return;
    const filename = `beschikbaarheid_5min_zone${zoneId}_${moment(startDate).format('YYYY-MM-DD')}_${moment(endDate).format('YYYY-MM-DD')}.csv`;
    downloadCsv(build5mSeriesCsv(series), filename);
  };

  return (
    <div className="my-8">
      <h2 className="text-4xl my-2">Beschikbaarheid (5-minuten-data)</h2>
      <p className="text-gray-600 my-2">
        Percentage van de tijd tussen{' '}
        {String(windowStartHour).padStart(2, '0')}:00 en{' '}
        {String(windowEndHour).padStart(2, '0')}:00 waarin minimaal {threshold}{' '}
        {threshold === 1 ? 'voertuig' : 'voertuigen'} beschikbaar{' '}
        {threshold === 1 ? 'was' : 'waren'}
        {zoneName ? ` in ${zoneName}` : ''}. Gebaseerd op de ruwe metingen per 5
        minuten; intervallen zonder meting tellen als 0 voertuigen.
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
      {error && <p className="text-red-600 my-2">{error}</p>}

      {kpi && kpi.overallPct !== null && (
        <div className="my-4">
          <span className="text-5xl font-bold">{kpi.overallPct}%</span>
          <span className="text-gray-600 ml-3">
            van de tijd ({moment(startDate).format('DD-MM-YYYY')} t/m{' '}
            {moment(endDate).format('DD-MM-YYYY')})
          </span>
        </div>
      )}

      {kpi && chartData.length > 0 && (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip formatter={(value) => [`${value}%`, 'Beschikbaar']} />
              <Bar dataKey="pct" fill="#15aeef" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default BeleidszonesAvailabilityKpi;
