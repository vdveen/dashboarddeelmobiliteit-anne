import {
  addOperationalCountsToChartData,
  darkenHexColor,
  getDailyTimestamps,
  getDaysMissingProviderCount,
  getNotDefectSeriesKey,
  mergeProviderCounts
} from './availableVehiclesChartUtils';

describe('availableVehiclesChartUtils', () => {
  it('creates and reads non-defect series keys', () => {
    const key = getNotDefectSeriesKey('voi');
    expect(key).toBe('voi__not_defect');
  });

  it('uses a darker shade of the provider color', () => {
    expect(darkenHexColor('#f26961')).toBe('#a94a44');
    expect(darkenHexColor('#fff')).toBe('#b3b3b3');
    expect(darkenHexColor('invalid')).toBe('#333333');
  });

  it('adds operational counts to the matching day', () => {
    const rows = [
      { name: '2026-09-01', voi: 10 },
      { name: '2026-09-02', voi: 12 }
    ];

    expect(addOperationalCountsToChartData(rows, {
      '2026-09-01': { voi: 8, excluded: 3 }
    })).toEqual([
      { name: '2026-09-01', voi: 10, voi__not_defect: 8 },
      { name: '2026-09-02', voi: 12 }
    ]);
  });

  it('creates one midnight timestamp for every chart day', () => {
    const timestamps = getDailyTimestamps([
      { name: '2026-09-01', voi: 10 },
      { time: '2026-09-02T13:00:00Z', voi: 12 }
    ], '08:30');

    expect(timestamps.map(({ day }) => day)).toEqual(['2026-09-01', '2026-09-02']);
    // 08:30 Amsterdam (CEST) is 06:30 UTC, whatever the browser timezone is.
    expect(timestamps[0].timestamp).toBe('2026-09-01T06:30:00.000Z');
  });

  it('finds loaded days that lack a count for a provider shown in the chart', () => {
    const chartData = [
      { name: '2026-10-07', voi: 250 },
      { name: '2026-10-08', voi: 260 },
      { name: '2026-10-09', voi: 0 },
      { name: '2026-10-10', voi: 270 },
    ];
    const counts = {
      '2026-10-07': { voi: 240 },
      '2026-10-08': {},
      '2026-10-09': {},
    };
    // 10-10 did not load at all, so it is a failed day, not a missing one
    expect(getDaysMissingProviderCount(chartData, counts, 'voi')).toEqual(['2026-10-08']);
  });

  it('merges counts of one provider into the daily counts', () => {
    expect(mergeProviderCounts({ '2026-10-08': { lime: 3 } }, 'voi', { '2026-10-08': 7, '2026-10-09': 0 }))
      .toEqual({ '2026-10-08': { lime: 3, voi: 7 }, '2026-10-09': { voi: 0 } });
  });
});
