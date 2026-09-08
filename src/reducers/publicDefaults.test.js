import filter from './filter';
import { validatePersistedState } from '../helpers/persistedState';
const defaults = { type: 'APPLY_PUBLIC_DEFAULT_FILTERS', payload: { aanbiedersexclude: 'check' } };
test.each(['shared-first', 'metadata-first'])('preserves shared filters for %s', order => {
  const shared = { type: 'IMPORT_STATE', payload: { filter: { gebied: 'GM0363', zones: '12', aanbiedersexclude: 'voi' } } };
  let state = filter(undefined, {});
  for (const action of order === 'shared-first' ? [shared, defaults] : [defaults, shared]) state = filter(state, action);
  expect(state).toMatchObject(shared.payload.filter);
});
test('applies defaults once to a fresh visitor but preserves a choice made before metadata', () => {
  expect(filter(undefined, defaults).aanbiedersexclude).toBe('check');
  const chosen = filter(undefined, {
    type: 'ADD_TO_FILTER_AANBIEDERS_EXCLUDE',
    payload: 'voi',
    meta: { explicit: true }
  });
  expect(filter(chosen, defaults)).toEqual(chosen);
  expect(filter(chosen, { type: 'LOGIN' })).toEqual(chosen);
});
test('logout drops account-owned locations but keeps public display choices', () => {
  const chosen = {
    ...filter(undefined, {}),
    gebied: 'GM0363',
    zones: '12,13',
    aanbiedersexclude: 'check',
    voertuigtypesexclude: 'car'
  };
  expect(filter(chosen, { type: 'LOGOUT' })).toMatchObject({
    gebied: '',
    zones: '',
    aanbiedersexclude: 'check',
    voertuigtypesexclude: 'car'
  });
});
test('metadata reconciliation does not suppress a queued public default', () => {
  const programmatic = filter(undefined, { type: 'SET_FILTER_GEBIED', payload: '' });
  expect(programmatic.public_defaults_applied).toBe(false);
  expect(filter(programmatic, defaults).aanbiedersexclude).toBe('check');

  const explicit = filter(undefined, {
    type: 'SET_FILTER_GEBIED', payload: 'GM0363', meta: { explicit: true }
  });
  expect(filter(explicit, defaults).gebied).toBe('GM0363');
});
test('restores only filters for a logged-out visitor', () => {
  const saved = {
    authentication: { user_data: null },
    filter: { gebied: 'GM0363', aanbiedersexclude: 'check' },
    layers: { active_data_layers: ['private-layer'] },
    policy_hubs: { selected: [1] }
  };
  expect(validatePersistedState(saved)).toEqual({ filter: saved.filter });
});
