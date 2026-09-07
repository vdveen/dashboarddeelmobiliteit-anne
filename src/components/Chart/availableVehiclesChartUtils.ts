import moment from 'moment';
import { OperationalVehicleCountsByDay } from '../../api/operationalVehicleStats';

export const NOT_DEFECT_KEY_SUFFIX = '__not_defect';

export const getNotDefectSeriesKey = (provider: string) =>
  `${provider}${NOT_DEFECT_KEY_SUFFIX}`;

export const darkenHexColor = (color: string, factor = 0.7): string => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
  if (!match) return '#333333';

  const normalized = match[1].length === 3
    ? match[1].split('').map((character) => character + character).join('')
    : match[1];
  const channels = [0, 2, 4].map((offset) =>
    Math.max(0, Math.min(255, Math.round(parseInt(normalized.slice(offset, offset + 2), 16) * factor)))
  );

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const getDailyTimestamps = (chartData: any[], aggregationTime?: string) =>
  (chartData || []).flatMap((row) => {
    const value = row.time || row.name;
    const parsed = moment(value);
    if (!value || !parsed.isValid()) return [];
    const timeMatch = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(aggregationTime || '');
    const timestamp = parsed.startOf('day');
    if (timeMatch) {
      timestamp.hour(Number(timeMatch[1])).minute(Number(timeMatch[2]));
    }
    return [{
      day: timestamp.format('YYYY-MM-DD'),
      timestamp: timestamp.toISOString()
    }];
  });

export const addOperationalCountsToChartData = (
  chartData: any[],
  countsByDay: OperationalVehicleCountsByDay
) => {
  const providersInChart = new Set(
    (chartData || []).flatMap((row) =>
      Object.keys(row).filter((key) => key !== 'time' && key !== 'name')
    )
  );

  return (chartData || []).map((row) => {
    const value = row.time || row.name;
    const day = value ? moment(value).format('YYYY-MM-DD') : '';
    const dailyCounts = countsByDay[day];
    if (!dailyCounts) return row;

    const operationalValues = Object.fromEntries(
      Object.entries(dailyCounts)
        .filter(([provider]) => providersInChart.has(provider))
        .map(([provider, count]) => [getNotDefectSeriesKey(provider), count])
    );
    return { ...row, ...operationalValues };
  });
};
