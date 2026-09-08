import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchVoiAvailability } from '../../api/voiSnapshots';
import { downloadCsvFile, toCsv } from '../../helpers/csv';
import ChartSkeleton from '../Chart/ChartSkeleton';
import { CustomizedTooltip } from '../Chart/CustomizedTooltip.jsx';
import { Button } from '../ui/button';
import {
  PeriodPreset,
  VoiChartRow,
  chartTicks,
  csvColumns,
  formatCount,
  formatPercentage,
  formatTickTime,
  formatTooltipTime,
  hasUnknownStatus,
  toChartRows,
  toCsvRows,
  windowFor,
} from './voiAvailabilityChart';

import './VoiAvailability.css';

export interface VoiAvailabilityChartProps {
  polygon: GeoJSON.Polygon | null;
  /**
   * Capture time of the snapshot whose vehicles are actually drawn on the map,
   * marked in the chart. While another frame loads, the map keeps showing this
   * one, so the marker follows the geometry rather than the slider.
   */
  selectedCapturedAt?: string | null;
  onClose: () => void;
}

const PERIODS: { preset: PeriodPreset; label: string }[] = [
  { preset: '1d', label: '24 uur' },
  { preset: '7d', label: '7 dagen' },
  { preset: '31d', label: '31 dagen' },
];

const COUNT_BY_KEY: Record<string, keyof VoiChartRow> = {
  operationalPct: 'operational',
  nonOperationalPct: 'non_operational',
  unknownPct: 'unknown',
};

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  stepMs?: number;
}

/**
 * Recharts hands a custom tick the raw payload rather than the formatted value,
 * so the tick formats the time itself. The looks match CustomizedXAxisTick.
 */
const TimeAxisTick: React.FC<AxisTickProps> = ({ x = 0, y = 0, payload, stepMs = 0 }) => (
  <g transform={`translate(${x},${y})`}>
    <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize="0.8em">
      {payload ? formatTickTime(payload.value, stepMs) : ''}
    </text>
  </g>
);

const PercentageAxisTick: React.FC<AxisTickProps> = ({ x = 0, y = 0, payload }) => (
  <g transform={`translate(${x},${y})`}>
    <text x={-4} y={0} dy={3} textAnchor="end" fill="#666" fontSize="0.8em">
      {payload ? `${payload.value}%` : ''}
    </text>
  </g>
);

interface TooltipItem {
  dataKey?: string | number;
  value?: number | null;
  payload?: VoiChartRow;
}

const itemValueFormatter = (item: TooltipItem): string => {
  const value = typeof item.value === 'number' ? item.value : null;
  if (value === null) return '-';

  const countKey = COUNT_BY_KEY[String(item.dataKey)];
  const count = countKey && item.payload ? item.payload[countKey] : null;
  if (typeof count !== 'number') return formatPercentage(value);

  return `${formatPercentage(value)} (${formatCount(count)})`;
};

/**
 * A custom Tooltip `content` receives the raw label, so format the capture time
 * before handing it to the shared tooltip.
 */
const AreaTooltip = (props: { label?: number | string }) => (
  <CustomizedTooltip
    {...props}
    label={typeof props.label === 'number' ? formatTooltipTime(props.label) : props.label}
    showAutomaticTotal={false}
    itemValueFormatter={itemValueFormatter}
  />
);

function summaryFor(rows: VoiChartRow[]): string {
  const latest = rows[rows.length - 1];
  if (!latest) return '';
  if (latest.total === 0) return 'Laatste meting: geen voertuigen in dit gebied.';

  return `Laatste meting: ${formatCount(latest.operational)} van ${formatCount(latest.total)} voertuigen operationeel (${formatPercentage(latest.operationalPct)})`;
}

/**
 * Line chart of the operational share inside a drawn area over time. Floats
 * above the timeline on the Voi monitor page.
 */
const VoiAvailabilityChart: React.FC<VoiAvailabilityChartProps> = ({
  polygon,
  selectedCapturedAt,
  onClose,
}) => {
  const [preset, setPreset] = useState<PeriodPreset>('7d');
  const [rows, setRows] = useState<VoiChartRow[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!polygon) {
      setRows([]);
      setError(null);
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const requested = windowFor(preset, new Date());
    setIsLoading(true);
    setError(null);

    fetchVoiAvailability(polygon, requested.from, requested.to, controller.signal)
      .then((series) => {
        if (controller.signal.aborted) return;
        setRows(toChartRows(series.series));
        setRange({ from: series.from || requested.from, to: series.to || requested.to });
        setIsLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setRows([]);
        setError(
          fetchError instanceof Error && fetchError.message
            ? fetchError.message
            : 'De beschikbaarheid kon niet worden geladen.'
        );
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [polygon, preset, reloadKey]);

  const showUnknown = useMemo(() => hasUnknownStatus(rows), [rows]);
  const axis = useMemo(() => chartTicks(rows), [rows]);
  const allEmpty = rows.length > 0 && rows.every((row) => row.total === 0);

  const selectedTime = useMemo(() => {
    if (!selectedCapturedAt || rows.length === 0) return undefined;
    const time = Date.parse(selectedCapturedAt);
    if (!Number.isFinite(time)) return undefined;
    if (time < rows[0].time || time > rows[rows.length - 1].time) return undefined;
    return time;
  }, [selectedCapturedAt, rows]);

  const handleDownload = useCallback(() => {
    if (rows.length === 0) return;
    const from = (range?.from ?? '').slice(0, 10);
    const to = (range?.to ?? '').slice(0, 10);
    downloadCsvFile(toCsv(toCsvRows(rows), csvColumns), `voi-beschikbaarheid_${from}_${to}`);
  }, [range, rows]);

  if (!polygon) return null;

  const renderBody = () => {
    if (isLoading) return <ChartSkeleton height="100%" />;

    if (error) {
      return (
        <div className="VoiAvailability-error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            Opnieuw
          </Button>
        </div>
      );
    }

    if (rows.length === 0) {
      return <p className="VoiAvailability-empty">Geen metingen in deze periode.</p>;
    }

    if (allEmpty) {
      return (
        <p className="VoiAvailability-empty">
          Geen Voi-voertuigen in dit gebied in deze periode.
        </p>
      );
    }

    return (
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 0" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={axis.ticks}
            tick={<TimeAxisTick stepMs={axis.stepMs} />}
            minTickGap={32}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={<PercentageAxisTick />}
            width={44}
          />
          <Tooltip content={<AreaTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="operationalPct"
            name="Operationeel"
            stroke="#1a86c7"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="nonOperationalPct"
            name="Niet-operationeel"
            stroke="#e2564e"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
          />
          {showUnknown && (
            <Line
              type="monotone"
              dataKey="unknownPct"
              name="Status onbekend"
              stroke="#8a969b"
              strokeDasharray="6 4"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
          )}
          {selectedTime !== undefined && (
            <ReferenceLine x={selectedTime} stroke="#17313b" strokeDasharray="3 3" />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <section className="VoiAvailability-card" aria-label="Beschikbaarheid in het getekende gebied">
      <div className="VoiAvailability-cardHeader">
        <div>
          <div className="VoiAvailability-cardKicker">Beschikbaarheid in gebied</div>
          <div className="VoiAvailability-cardSummary">{summaryFor(rows)}</div>
        </div>

        <div className="VoiAvailability-cardActions">
          <div className="VoiAvailability-segmented" role="group" aria-label="Periode">
            {PERIODS.map((period) => (
              <button
                key={period.preset}
                type="button"
                aria-pressed={preset === period.preset}
                onClick={() => setPreset(period.preset)}
              >
                {period.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="VoiAvailability-download"
            onClick={handleDownload}
            disabled={rows.length === 0}
            aria-label="Download CSV"
            title="Download to CSV"
          >
            <img
              src="/components/StatsPage/icon-download-to-csv.svg"
              width="30"
              alt=""
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            className="VoiAvailability-close"
            onClick={onClose}
            aria-label="Grafiek sluiten"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="VoiAvailability-plot">{renderBody()}</div>
    </section>
  );
};

export default VoiAvailabilityChart;
