import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  chartTicks,
  formatCount,
  formatTickTime,
  formatTooltipTime,
} from '../VoiAvailability/voiAvailabilityChart';
import { ContractChartRow, thresholdOffset } from './voiContract';

export const MET_COLOR = '#15803d';
export const UNMET_COLOR = '#dc2626';

interface VoiContractChartProps {
  id: string;
  rows: ContractChartRow[];
  minimum: number;
  /** Shaded periods in which the requirement applies */
  windows?: { start: number; end: number }[];
  /** Single moments at which the requirement is measured */
  moments?: number[];
  /** Show occupied dropzones in the tooltip */
  showHubs?: boolean;
}

interface TickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  stepMs?: number;
}

const TimeTick: React.FC<TickProps> = ({ x = 0, y = 0, payload, stepMs = 0 }) => (
  <g transform={`translate(${x},${y})`}>
    <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize="0.8em">
      {payload ? formatTickTime(payload.value, stepMs) : ''}
    </text>
  </g>
);

interface TooltipProps {
  active?: boolean;
  label?: number;
  payload?: { payload?: ContractChartRow }[];
  minimum: number;
  showHubs?: boolean;
}

const ChartTooltip: React.FC<TooltipProps> = ({ active, label, payload, minimum, showHubs }) => {
  const row = payload?.[0]?.payload;
  if (!active || !row || typeof label !== 'number') return null;
  return (
    <div className="VoiContract-tooltip">
      <div className="VoiContract-tooltipTime">{formatTooltipTime(label)}</div>
      {row.missing || row.count === null ? (
        <div>Geen meting</div>
      ) : (
        <>
          <div style={{ color: row.count >= minimum ? MET_COLOR : UNMET_COLOR }}>
            {`${formatCount(row.count)} beschikbare fietsen (minimum ${minimum})`}
          </div>
          {showHubs && row.occupiedHubs !== null && (
            <div>{`${formatCount(row.occupiedHubs)} dropzones met een fiets`}</div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Non-defect Voi bikes in one contract zone over a week. The line is green
 * where the count meets the minimum and red where it does not; the periods or
 * moments at which the contract measures are highlighted.
 */
const VoiContractChart: React.FC<VoiContractChartProps> = ({
  id, rows, minimum, windows = [], moments = [], showHubs,
}) => {
  const axis = useMemo(() => chartTicks(rows), [rows]);
  const offset = useMemo(() => thresholdOffset(rows, minimum), [rows, minimum]);
  const measured = rows.filter((row) => row.count !== null);
  const allMet = measured.length > 0 && measured.every((row) => (row.count ?? 0) >= minimum);
  const gradientId = `voi-contract-${id.replace(/[^a-z0-9-]/gi, '')}`;
  const stroke = offset === null ? (allMet ? MET_COLOR : UNMET_COLOR) : `url(#${gradientId})`;
  const first = rows[0]?.time;
  const last = rows[rows.length - 1]?.time;

  if (rows.length === 0) {
    return <p className="VoiContract-empty">Geen metingen in deze week.</p>;
  }

  return (
    <div className="VoiContract-chart">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
          <defs>
            {offset !== null && (
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={offset} stopColor={MET_COLOR} />
                <stop offset={offset} stopColor={UNMET_COLOR} />
              </linearGradient>
            )}
          </defs>
          <CartesianGrid strokeDasharray="3 0" vertical={false} />
          {windows
            .filter((window) => window.end > first && window.start < last)
            .map((window) => (
              <ReferenceArea
                key={window.start}
                x1={Math.max(window.start, first)}
                x2={Math.min(window.end, last)}
                fill="#1a86c7"
                fillOpacity={0.08}
                ifOverflow="hidden"
              />
            ))}
          {moments
            .filter((moment) => moment >= first && moment <= last)
            .map((moment) => (
              <ReferenceLine key={moment} x={moment} stroke="#1a86c7" strokeWidth={2} strokeOpacity={0.5} />
            ))}
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={axis.ticks}
            tick={<TimeTick stepMs={axis.stepMs} />}
            minTickGap={32}
          />
          <YAxis
            domain={[0, (dataMax: number) => Math.max(dataMax, minimum + 1)]}
            allowDecimals={false}
            tickFormatter={formatCount}
            width={40}
          />
          <ReferenceLine
            y={minimum}
            stroke="#17313b"
            strokeDasharray="4 4"
            label={{ value: `minimum ${minimum}`, position: 'insideTopLeft', fontSize: 11, fill: '#17313b' }}
          />
          <Tooltip content={<ChartTooltip minimum={minimum} showHubs={showHubs} />} />
          <Line
            type="linear"
            dataKey="count"
            name="Beschikbare fietsen"
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VoiContractChart;
