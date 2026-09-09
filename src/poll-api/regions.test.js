import { REGIONS, getMunicipalityCodes } from '../helpers/regions';
import {
  DISPLAYMODE_OTHER,
  DISPLAYMODE_PARK,
  DISPLAYMODE_RENTALS,
} from '../reducers/layers';
import { updateZones } from './metadataZones';
import { updateZonesgeodata } from './metadataZonesgeodata';
import { createFilterparameters } from './pollTools';

const municipalities = getMunicipalityCodes(REGIONS[2].gm_code).map((gm_code) => ({
  gm_code,
  name: gm_code,
}));
const zones = municipalities.map((municipality, index) => ({
  zone_id: 201 + index,
  municipality: municipality.gm_code,
  zone_type: 'municipality',
}));

const metadata = {
  gebieden: municipalities,
  zones,
  aanbieders: [],
  aclOperators: [],
  vehicle_types: [],
  metadata_loaded: true,
  zones_loaded: true,
};

const baseFilter = {
  zones: '',
  aanbiedersexclude: '',
  voertuigtypesexclude: '',
  datum: '2026-09-09T12:00:00Z',
  intervalend: '2026-09-09T12:00:00Z',
  intervalduur: 60 * 60 * 1000,
  ontwikkelingvan: '2026-09-01',
  ontwikkelingtot: '2026-09-08',
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  process.env.REACT_APP_MAIN_API_URL = 'https://api.example.test';
  window.history.replaceState({}, '', '/map/park');
});

afterEach(() => {
  delete global.fetch;
});

test.each([
  ['Aanbod', DISPLAYMODE_PARK],
  ['Verhuringen', DISPLAYMODE_RENTALS],
  ['Statistieken', DISPLAYMODE_OTHER],
])('%s scopes every region to all of its municipality boundaries', (_label, displayMode) => {
  REGIONS.forEach((region) => {
    const query = new URLSearchParams(createFilterparameters(
      displayMode,
      { ...baseFilter, gebied: region.gm_code },
      metadata,
      { is_logged_in: true }
    ).join('&'));
    const expectedIds = getMunicipalityCodes(region.gm_code).map((code) =>
      String(zones.find((zone) => zone.municipality === code).zone_id)
    );
    expect(query.get('zone_ids').split(',')).toEqual(expectedIds);
  });
});

test.each([
  ['a boundary is missing', {
    ...metadata,
    zones: zones.filter(({ municipality }) => municipality !== 'GM0317'),
  }],
  ['ACL access is incomplete', {
    ...metadata,
    gebieden: municipalities.filter(({ gm_code }) => gm_code !== 'GM0317'),
  }],
])('uses an impossible zone id when %s', (_label, incompleteMetadata) => {
  const query = new URLSearchParams(createFilterparameters(
    DISPLAYMODE_PARK,
    { ...baseFilter, gebied: REGIONS[0].gm_code },
    incompleteMetadata,
    { is_logged_in: true }
  ).join('&'));
  expect(query.get('zone_ids')).toBe('0');
});

test.each([
  ['authenticated', { token: 'test-token' }, '/dashboard-api/zones'],
  ['public', null, '/dashboard-api/public/zones'],
])('loads %s region zones with the plural municipalities parameter', async (_label, user_data, path) => {
  const state = {
    authentication: { user_data },
    filter: { gebied: REGIONS[0].gm_code, zones: '' },
    layers: { displaymode: DISPLAYMODE_PARK },
    metadata,
  };
  const store = { getState: () => state, dispatch: jest.fn() };
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ zones: zones.slice(0, 4) }),
  });

  await updateZones(store);

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(`https://api.example.test${path}?municipalities=${REGIONS[0].gm_code}`);
  if (user_data) {
    expect(options).toEqual({ headers: { authorization: 'Bearer test-token' } });
  } else {
    expect(options).toEqual({});
  }
  expect(store.dispatch).toHaveBeenCalledWith({ type: 'SET_ZONES', payload: zones.slice(0, 4) });
  expect(store.dispatch).toHaveBeenCalledWith({ type: 'SET_ZONES_LOADED', payload: true });
});

test('ignores a region zones response after the selected area changes', async () => {
  let state = {
    authentication: { user_data: { token: 'test-token' } },
    filter: { gebied: REGIONS[0].gm_code, zones: '' },
    layers: { displaymode: DISPLAYMODE_PARK },
    metadata,
  };
  let resolveFetch;
  global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const store = { getState: () => state, dispatch: jest.fn() };

  const request = updateZones(store);
  state = { ...state, filter: { gebied: 'GM0402', zones: '' } };
  store.dispatch.mockClear();
  resolveFetch({ ok: true, json: async () => ({ zones: zones.slice(0, 4) }) });
  await request;

  expect(store.dispatch).not.toHaveBeenCalled();
});

test('loads all regional boundary geometries and computes their combined extent', async () => {
  const state = {
    authentication: { user_data: { token: 'test-token' } },
    filter: { gebied: REGIONS[0].gm_code, zones: '' },
    layers: { displaymode: DISPLAYMODE_PARK },
    metadata,
  };
  const store = { getState: () => state, dispatch: jest.fn() };
  const geometries = zones.slice(0, 4).map((zone, index) => ({
    ...zone,
    geojson: {
      type: 'Polygon',
      coordinates: [[
        [index * 10, index],
        [index * 10 + 2, index],
        [index * 10 + 2, index + 2],
        [index * 10, index + 2],
        [index * 10, index],
      ]],
    },
  }));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ zones: geometries }) });

  updateZonesgeodata(store);
  await flush();

  expect(global.fetch.mock.calls[0][0]).toBe(
    'https://api.example.test/dashboard-api/zones?zone_ids=201,202,203,204&include_geojson=true'
  );
  const geodataAction = store.dispatch.mock.calls
    .map(([action]) => action)
    .find((action) => action.type === 'SET_ZONES_GEODATA');
  expect(geodataAction.payload.data.features).toHaveLength(4);
  expect(geodataAction.payload.bounds).toEqual([0, 0, 32, 5]);
});

test.each([true, false])('recovers from a region fetch failure without leaving loading stuck (retry succeeds: %s)', async (succeeds) => {
  const state = { authentication: { user_data: null }, filter: { gebied: REGIONS[0].gm_code, zones: '' }, layers: { displaymode: DISPLAYMODE_PARK }, metadata };
  const store = { getState: () => state, dispatch: jest.fn() };
  global.fetch = jest.fn().mockRejectedValueOnce(new Error('temporary network failure'));
  if (succeeds) global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ zones: zones.slice(0, 4) }) });
  else global.fetch.mockRejectedValueOnce(new Error('still offline'));
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await updateZones(store);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'SET_ZONES_LOADED', payload: true });
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'SHOW_LOADING', payload: false });
    const updates = store.dispatch.mock.calls.map(([action]) => action).filter(action => action.type === 'SET_ZONES');
    expect(updates[updates.length - 1].payload).toEqual(succeeds ? zones.slice(0, 4) : []);
  } finally { errorLog.mockRestore(); }
});
