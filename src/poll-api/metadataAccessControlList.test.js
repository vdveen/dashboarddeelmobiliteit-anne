import { initAccessControlList } from './metadataAccessControlList';

jest.mock('../api/operators', () => ({
  getCachedOperators: () => [],
  fetchOperators: () => Promise.resolve([]),
}));
jest.mock('../actions/authentication', () => ({ setAclInRedux: payload => ({ type: 'ACL', payload }) }));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const response = municipalities => ({ ok: true, json: async () => ({ municipalities }) });

describe('public municipality request ownership', () => {
  let state;
  let store;
  let finish;

  beforeEach(() => {
    state = { authentication: { user_data: null } };
    store = { getState: () => state, dispatch: jest.fn() };
    global.fetch = jest.fn(() => new Promise((resolve, reject) => { finish = { resolve, reject }; }));
  });

  afterEach(() => { delete global.fetch; });

  test('accepts current public options in both API field formats', async () => {
    initAccessControlList(store);
    finish.resolve(response([{ gm_code: 'GM0988', name: 'Weert' }, { municipality: 'GM0363', name: 'Amsterdam' }]));
    await flush();
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'SET_GEBIEDEN', payload: [
      { gm_code: 'GM0988', name: 'Weert' }, { gm_code: 'GM0363', name: 'Amsterdam' },
    ] });
  });

  test.each(['resolve', 'reject'])('ignores a public %s after login', async outcome => {
    initAccessControlList(store);
    state = { authentication: { user_data: { token: 'new-account' } } };
    store.dispatch.mockClear();
    finish[outcome](outcome === 'resolve' ? response([{ gm_code: 'GM0988', name: 'Weert' }]) : new Error('offline'));
    await flush();
    expect(store.dispatch.mock.calls.some(([action]) => action.type === 'SET_GEBIEDEN')).toBe(false);
  });

  test('ignores an older request for the same guest', async () => {
    initAccessControlList(store);
    const older = finish;
    initAccessControlList(store);
    finish.resolve(response([{ gm_code: 'GM0988', name: 'Weert' }]));
    await flush();
    store.dispatch.mockClear();
    older.resolve(response([{ gm_code: 'GM0363', name: 'Amsterdam' }]));
    await flush();
    expect(store.dispatch.mock.calls.some(([action]) => action.type === 'SET_GEBIEDEN')).toBe(false);
  });
});
