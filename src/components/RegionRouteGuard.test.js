import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, useSelector } from 'react-redux';
import { createStore } from 'redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import RegionRouteGuard from './RegionRouteGuard';
import filterReducer from '../reducers/filter';
import { REGIONS } from '../helpers/regions';

const mounts = [];
function Page() {
  const selection = useSelector(state => state.filter.gebied);
  const location = useLocation();
  mounts.push(selection);
  return <div data-testid="page">{selection}|{location.search}</div>;
}

beforeEach(() => { mounts.length = 0; });
const setup = (path, selection = REGIONS[0].gm_code) => {
  const initial = { filter: { gebied: selection, zones: '' } };
  const store = createStore((state = initial, action) => ({ filter: filterReducer(state.filter, action) }));
  render(<Provider store={store}><MemoryRouter initialEntries={[path]}><RegionRouteGuard><Page /></RegionRouteGuard></MemoryRouter></Provider>);
  return store;
};

test.each(['/map/park', '/map/rentals', '/stats/beleidsinfo'])('preserves a region on %s', path => {
  const store = setup(path);
  expect(store.getState().filter.gebied).toBe(REGIONS[0].gm_code);
});

test.each(['/stats/prestaties-aanbieders', '/stats/beleidszones', '/map/beleidshubs'])('clears region before mounting %s', path => {
  const store = setup(`${path}?gm_code=${encodeURIComponent(REGIONS[0].gm_code)}&zones=42&keep=yes`);
  expect(store.getState().filter.gebied).toBe('');
  expect(mounts.every(selection => selection === '')).toBe(true);
  expect(screen.getByTestId('page').textContent).toBe('|?keep=yes');
});

test('also rejects a region in a direct URL before the page imports it', () => {
  setup(`/stats/beleidszones?gm_code=${encodeURIComponent(REGIONS[0].gm_code)}`, 'GM0307');
  expect(screen.getByTestId('page').textContent).toBe('|');
});

test('imports a shared region link before mounting the statistics page', () => {
  const store = setup(`/stats/beleidsinfo?gm_code=${encodeURIComponent(REGIONS[2].gm_code)}`, 'GM0307');
  expect(store.getState().filter.gebied).toBe(REGIONS[2].gm_code);
  expect(mounts.every(selection => selection === REGIONS[2].gm_code)).toBe(true);
});

test('clears a region inside a legacy shared view before mounting a single-municipality page', () => {
  const shared = { filter: { gebied: REGIONS[0].gm_code, zones: '42', datum: '2026-09-08' }, layers: { mapextent: [1,2,3,4], label: '100% bereik' } };
  const params = new URLSearchParams({ view: encodeURIComponent(JSON.stringify(shared)) });
  setup(`/stats/beleidszones?${params}`, 'GM0307');
  expect(mounts.every(selection => selection === '')).toBe(true);
  const search = screen.getByTestId('page').textContent.slice(1);
  const restored = JSON.parse(decodeURIComponent(new URLSearchParams(search).get('view')));
  expect(restored.filter).toEqual({ gebied: '', zones: '', datum: '2026-09-08' });
  expect(restored.layers).toEqual(shared.layers);
});
