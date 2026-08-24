import {
  calculateRelativeTripPercentages,
  formatRelativeTripValue
} from './ritlengteChartUtils';

describe('calculateRelativeTripPercentages', () => {
  test('calculates shorter, equal and longer shares per provider', () => {
    const result = calculateRelativeTripPercentages([
      {name: '0-1', voi: 21, check: 1},
      {name: '1-2', voi: 5},
      {name: '2-3', voi: 74, check: 3}
    ], ['voi', 'check']);

    expect(result['1-2'].voi).toEqual({
      lessThan: 21,
      equalTo: 5,
      greaterThan: 74
    });
    expect(result['1-2'].check).toEqual({
      lessThan: 25,
      equalTo: 0,
      greaterThan: 75
    });
  });

  test('rounds each share independently', () => {
    const result = calculateRelativeTripPercentages([
      {name: '0-1', voi: 1},
      {name: '1-2', voi: 1},
      {name: '2-3', voi: 1}
    ], ['voi']);

    expect(result['1-2'].voi).toEqual({
      lessThan: 33,
      equalTo: 33,
      greaterThan: 33
    });
  });
});

describe('formatRelativeTripValue', () => {
  test('adds the shorter, equal and longer percentages to the trip count', () => {
    expect(formatRelativeTripValue(2509, {
      lessThan: 21,
      equalTo: 5,
      greaterThan: 73
    })).toBe('2509 (</=/>: 21%, 5%, 73%)');
  });
});
