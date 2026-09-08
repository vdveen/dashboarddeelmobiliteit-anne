import { passesOperationalStatusFilter } from './pollParkingData.js';
import {
  OPERATIONAL_STATUS_ALL,
  OPERATIONAL_STATUS_NON_OPERATIONAL,
  OPERATIONAL_STATUS_OPERATIONAL
} from '../reducers/filter.js';

describe('passesOperationalStatusFilter', () => {
  const defect = { is_non_operational: true };
  const working = { is_non_operational: false };
  const unknown = {};

  it('shows every vehicle when all is selected', () => {
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_ALL, defect)).toBe(true);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_ALL, working)).toBe(true);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_ALL, unknown)).toBe(true);
  });

  it('shows only non-operational vehicles when defect is selected', () => {
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_NON_OPERATIONAL, defect)).toBe(true);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_NON_OPERATIONAL, working)).toBe(false);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_NON_OPERATIONAL, unknown)).toBe(false);
  });

  it('shows only operational vehicles when niet-defect is selected', () => {
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_OPERATIONAL, defect)).toBe(false);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_OPERATIONAL, working)).toBe(true);
    expect(passesOperationalStatusFilter(OPERATIONAL_STATUS_OPERATIONAL, unknown)).toBe(true);
  });

  it('falls back to showing everything for an unknown filter value', () => {
    expect(passesOperationalStatusFilter(undefined, defect)).toBe(true);
    expect(passesOperationalStatusFilter('bogus', working)).toBe(true);
  });
});
