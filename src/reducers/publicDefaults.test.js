import filter from './filter';
const defaults = { type: 'APPLY_PUBLIC_DEFAULT_FILTERS', payload: { aanbiedersexclude: 'check' } };
test.each(['shared-first', 'metadata-first'])('preserves shared filters for %s', order => {
  const shared = { type: 'IMPORT_STATE', payload: { filter: { gebied: 'GM0363', zones: '12', aanbiedersexclude: 'voi' } } };
  let state = filter(undefined, {});
  for (const action of order === 'shared-first' ? [shared, defaults] : [defaults, shared]) state = filter(state, action);
  expect(state).toMatchObject(shared.payload.filter);
});
test('applies defaults once to a fresh visitor but preserves a choice made before metadata', () => {
  expect(filter(undefined, defaults).aanbiedersexclude).toBe('check');
  const chosen = filter(undefined, { type: 'ADD_TO_FILTER_AANBIEDERS_EXCLUDE', payload: 'voi' });
  expect(filter(chosen, defaults)).toEqual(chosen);
  expect(filter(chosen, { type: 'LOGOUT' })).toEqual(chosen);
  expect(filter(chosen, { type: 'LOGIN' })).toEqual(chosen);
});
