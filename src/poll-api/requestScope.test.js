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
test('metadata that does not change the request keeps the in-flight vehicle load', async () => {
  const state = { authentication: { user_data: { token: 'a' } }, layers: { displaymode: 'displaymode-park' },
    filter: { gebied: '', zones: '', datum: '2026-09-01T00:00:00Z', aanbiedersexclude: '', parkeerduurexclude: '', voertuigtypesexclude: '' },
    metadata: { gebieden: [], zones: [], aanbieders: [{ system_id: 'voi' }], vehicle_types: [], aclOperators: [{ system_id: 'voi' }] } };
  let resolve;
  let signal;
  global.fetch = jest.fn((_url, options) => {
    signal = options.signal;
    return new Promise(r => { resolve = r; });
  });
  const store = { getState: () => state, dispatch: jest.fn() };
  initUpdateParkingData(store);
  const clearsBeforeMetadata = store.dispatch.mock.calls.filter(([action]) => action.type === 'CLEAR_VEHICLES').length;
  state.metadata = { ...state.metadata, zones: [{ zone_id: 12 }], gebieden: [{ gm_code: 'GM0001' }] };
  initUpdateParkingData(store);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
  expect(store.dispatch.mock.calls.filter(([action]) => action.type === 'CLEAR_VEHICLES')).toHaveLength(clearsBeforeMetadata);
  resolve({ ok: true, json: async () => ({ park_events: [] }) });
  await flush();
  expect(store.dispatch.mock.calls.some(([action]) => action.type === 'SET_VEHICLES')).toBe(true);
  delete global.fetch;
});
test('multiple grants restrict operator accounts without narrowing municipality accounts', () => {
  const aclOperators = [{ system_id: 'voi' }, { system_id: 'check' }];
  const metadata = { aclOperators, aanbieders: [{ system_id: 'other' }] };
  expect(getOperatorsScopeForStats(metadata, 'OPERATOR')).toEqual(['voi', 'check']);
  expect(getOperatorsScopeForStats(metadata, 'MUNICIPALITY')).toEqual(['other']);
  expect(getOperatorsScopeForStats({ ...metadata, aclOperators: [aclOperators[0]] }, 'MUNICIPALITY')).toEqual(['voi']);
  expect(isOperatorPrestatiesView([aclOperators[0]], 'MUNICIPALITY')).toBe(false);
  expect(isOperatorPrestatiesView(aclOperators, 'OPERATOR')).toBe(true);
});
test('metadata from an old selection cannot dispatch after its owner changes', () => {
  const { scopedMetadataStore } = require('./requestScope');
  let state = { authentication: { user_data: { token: 'a' } }, filter: { gebied: 'old' } };
  const store = { getState: () => state, dispatch: jest.fn() };
  const older = scopedMetadataStore(store, 'zones');
  state = { ...state, filter: { gebied: 'new' } };
  older.dispatch({ type: 'SET_ZONES', payload: ['old'] });
  const current = scopedMetadataStore(store, 'zones');
  current.dispatch({ type: 'SET_ZONES', payload: ['new'] });
  expect(store.dispatch).toHaveBeenCalledTimes(1);
});
