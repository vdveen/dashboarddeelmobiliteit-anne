import { createFilterparameters } from './pollTools';
import { DISPLAYMODE_OTHER } from '../reducers/layers';

test('uses Amsterdam calendar-day bounds for all policy charts', () => {
  const parameters = createFilterparameters(
    DISPLAYMODE_OTHER,
    {
      ontwikkelingvan: '2026-03-29',
      ontwikkelingtot: '2026-03-29',
      gebied: '',
      zones: '',
      aanbiedersexclude: '',
      voertuigtypesexclude: ''
    },
    { gebieden: [], zones: [], aanbieders: [], aclOperators: [], vehicle_types: [] },
    { is_logged_in: true }
  );
  const query = new URLSearchParams(parameters.join('&'));
  expect(query.get('start_time')).toBe('2026-03-28T23:00:00Z');
  expect(query.get('end_time')).toBe('2026-03-29T22:00:00Z');
});
