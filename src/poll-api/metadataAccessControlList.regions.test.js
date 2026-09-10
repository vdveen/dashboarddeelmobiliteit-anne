import { initAccessControlList } from './metadataAccessControlList';
import { REGIONS, getMunicipalityCodes } from '../helpers/regions';
import authentication from '../reducers/authentication';

jest.mock('../api/operators', () => ({
  getCachedOperators: () => [],
  fetchOperators: () => Promise.resolve([]),
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const municipalitiesFor = region => getMunicipalityCodes(region.gm_code)
  .map(gm_code => ({ gm_code, name: gm_code }));

function makeStore(gebied) {
  let state = {
    authentication: { user_data: { token: 'test-token' } },
    filter: { gebied },
    metadata: { gebieden: [] },
  };
  return {
    getState: () => state,
    dispatch: jest.fn(action => {
      state = {
        ...state,
        authentication: authentication(state.authentication, action),
      };
      if (action.type === 'SET_GEBIEDEN') {
        state.metadata = { ...state.metadata, gebieden: action.payload };
      }
      if (action.type === 'SET_FILTER_GEBIED') {
        state.filter = { ...state.filter, gebied: action.payload };
      }
    }),
  };
}

async function refreshAcl(selection, metadata) {
  const store = makeStore(selection);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => metadata,
  });
  initAccessControlList(store);
  await flush();
  return store.getState();
}

afterEach(() => { delete global.fetch; });

test.each(REGIONS)('keeps $name selected when the ACL includes every municipality', async region => {
  const municipalities = municipalitiesFor(region);
  const state = await refreshAcl(region.gm_code, {
    municipalities,
    organisation_type: 'MUNICIPALITY',
  });

  expect(state.filter.gebied).toBe(region.gm_code);
  // A login response has no ACL yet; the menu response must install it.
  expect(state.authentication.user_data.acl.municipalities).toEqual(municipalities);
  expect(state.authentication.user_data.acl.organisation_type).toBe('MUNICIPALITY');
});

test.each(REGIONS)('clears $name when the ACL is missing a municipality', async region => {
  const state = await refreshAcl(region.gm_code, {
    municipalities: municipalitiesFor(region).slice(1),
    organisation_type: 'MUNICIPALITY',
  });

  expect(state.filter.gebied).toBe('');
});

test.each([
  { organisation_type: 'ADMIN' },
  { is_admin: true },
])('preserves the admin exemption from menu metadata: %j', adminMetadata => {
  return refreshAcl(REGIONS[0].gm_code, {
    municipalities: municipalitiesFor(REGIONS[0]).slice(1),
    ...adminMetadata,
  }).then(state => {
    expect(state.filter.gebied).toBe(REGIONS[0].gm_code);
  });
});

test.each([
  ['GM0307', 'GM0307'],
  ['GM0363', ''],
])('validates single-municipality selection %s', async (selection, expected) => {
  const state = await refreshAcl(selection, {
    municipalities: municipalitiesFor(REGIONS[0]),
    organisation_type: 'MUNICIPALITY',
  });

  expect(state.filter.gebied).toBe(expected);
});
