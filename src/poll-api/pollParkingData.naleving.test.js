import { initUpdateParkingData } from './pollParkingData';
import { buildHubIndex } from '../helpers/parkingCompliance';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// A Voi hub of about 10 x 10 m in Hilversum
const hub = {
  type: 'Feature',
  properties: { operator: 'voi' },
  geometry: { type: 'Polygon', coordinates: [[[5.17, 52.22], [5.17015, 52.22], [5.17015, 52.22009], [5.17, 52.22009], [5.17, 52.22]]] }
};

const parkEvent = (bike_id, system_id, form_factor, longitude, latitude) => ({
  bike_id, system_id, form_factor, is_non_operational: false,
  start_time: '2026-10-26T08:00:00Z', location: { latitude, longitude }
});

test('Parkeernaleving colors bikes by distance band and counts them', async () => {
  const state = {
    authentication: { user_data: { token: 'a' } },
    layers: { displaymode: 'displaymode-park' },
    filter: {
      gebied: 'GM0402', zones: '', datum: '2026-10-26T10:00:00Z', aanbiedersexclude: '',
      parkeerduurexclude: '', voertuigtypesexclude: '', operational_status: 'non_operational',
      parkeerweergave: 'parkeernaleving', parkeerafstandexclude: '0'
    },
    metadata: { gebieden: [], zones: [], aanbieders: [{ system_id: 'voi' }, { system_id: 'check' }], vehicle_types: [], aclOperators: [] },
    parking_hubs: { gebied: 'GM0402', status: 'ready', index: buildHubIndex([hub]) }
  };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ park_events: [
      parkEvent('in', 'voi', 'bicycle', 5.17005, 52.22005),
      parkEvent('near', 'voi', 'bicycle', 5.1705, 52.22005),
      parkEvent('far', 'voi', 'bicycle', 5.18, 52.22005),
      parkEvent('moped', 'check', 'moped', 5.18, 52.22005)
    ] })
  }));
  const store = { getState: () => state, dispatch: jest.fn() };
  initUpdateParkingData(store);
  await flush();

  const payload = type => store.dispatch.mock.calls.map(([a]) => a).filter(a => a.type === type).pop().payload;
  // "In een hub" is hidden; the defect filter does not apply in this view
  const shown = payload('SET_VEHICLES').features.map(f => [f.properties.vehicle_id, f.properties.afstand_bin]);
  expect(shown).toEqual([['near', 1], ['far', 3]]);
  expect(payload('SET_VEHICLES_PARKEERAFSTANDSTATS')).toEqual({ 0: 1, 1: 1, 2: 0, 3: 1, unmeasured: 1 });
  delete global.fetch;
});
