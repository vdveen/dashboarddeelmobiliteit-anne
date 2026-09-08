import { initUpdateParkingData } from './pollParkingData';
import { getOperatorsScopeForStats } from './pollTools';
import { isOperatorPrestatiesView } from '../helpers/prestatiesAanbiedersViewMode';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
test('ignores a late vehicle response after an account change even without a second poll', async () => {
  const state = { authentication: { user_data: { token: 'a' } }, layers: { displaymode: 'displaymode-park' },
    filter: { gebied: '', zones: '', datum: '2026-09-01T00:00:00Z', aanbiedersexclude: '', parkeerduurexclude: '', voertuigtypesexclude: '' },
    metadata: { gebieden: [], zones: [], aanbieders: [], vehicle_types: [], aclOperators: [] } };
  let resolve;
  global.fetch = jest.fn(() => new Promise(r => { resolve = r; }));
  const store = { getState: () => state, dispatch: jest.fn() };
  initUpdateParkingData(store);
  state.authentication.user_data = { token: 'b' };
  resolve({ ok: true, json: async () => ({ park_events: [] }) });
  await flush();
  expect(store.dispatch.mock.calls.some(([a]) => a.type === 'SET_VEHICLES')).toBe(false);
  delete global.fetch;
});
test('multiple data grants scope requests without changing a known municipality role', () => {
  const aclOperators = [{ system_id: 'voi' }, { system_id: 'check' }];
  expect(getOperatorsScopeForStats({ aclOperators, aanbieders: [{ system_id: 'other' }] })).toEqual(['voi', 'check']);
  expect(isOperatorPrestatiesView([aclOperators[0]], 'MUNICIPALITY')).toBe(false);
  expect(isOperatorPrestatiesView(aclOperators, 'OPERATOR')).toBe(true);
});
