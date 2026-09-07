import {
  addOperationalCountsToChartData,
  darkenHexColor,
  getDailyTimestamps,
  getNotDefectSeriesKey
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
    expect(timestamps[0].timestamp).toContain('T08:30:00.000Z');
  });
});
