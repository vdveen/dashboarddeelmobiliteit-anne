import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import FilteritemGebieden from './FilteritemGebieden';
import filterReducer from '../../reducers/filter';
import uiReducer from '../../reducers/ui';
import { REGIONS, getMunicipalityCodes } from '../../helpers/regions';

const municipalities = getMunicipalityCodes(REGIONS[2].gm_code).map((gm_code, i) => ({ gm_code, name: `Plaats ${9 - i}` }));
const setup = (includeRegions = true) => {
  const initial = { filter: { gebied: '', zones: '99' }, ui: {}, metadata: { gebieden: municipalities } };
  const store = createStore((state = initial, action) => ({ ...state, filter: filterReducer(state.filter, action), ui: uiReducer(state.ui, action) }));
  render(<Provider store={store}><FilteritemGebieden includeRegions={includeRegions} /></Provider>);
  fireEvent.click(screen.getByText('Alle plaatsen'));
  return store;
};

beforeEach(() => window.history.replaceState({}, '', '/map/park?keep=yes&zones=99'));

test('puts the three regions before alphabetically sorted municipalities and selects all members', () => {
  const store = setup();
  const labels = Array.from(screen.getByRole('dialog').querySelectorAll('.form-item')).map(el => el.textContent);
  expect(labels.slice(0, 4)).toEqual(['Alle plaatsen', ...REGIONS.map(region => region.name)]);
  expect(labels.slice(4)).toEqual(municipalities.map(area => area.name).sort());
  fireEvent.click(screen.getByText('Regio Amersfoort'));
  expect(store.getState().filter).toMatchObject({ gebied: REGIONS[0].gm_code, zones: '' });
  expect(new URLSearchParams(window.location.search).get('gm_code')).toBe(REGIONS[0].gm_code);
  expect(new URLSearchParams(window.location.search).get('zones')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByText('Regio Amersfoort'));
  expect(new URLSearchParams(window.location.search).get('gm_code')).toBe(REGIONS[0].gm_code);
  fireEvent.change(screen.getByPlaceholderText('zoek'), { target: { value: 'gooi' } });
  expect(within(screen.getByRole('dialog')).queryByText('Regio Amersfoort')).toBeNull();
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Regio Gooi en Vechtstreek'));
  expect(store.getState().filter.gebied).toBe(REGIONS[1].gm_code);
  fireEvent.click(screen.getByText('Regio Gooi en Vechtstreek'));
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Regio Gooi en Vechtstreek'));
  expect(store.getState().filter.gebied).toBe('');
  expect(new URLSearchParams(window.location.search).get('gm_code')).toBeNull();
  expect(new URLSearchParams(window.location.search).get('keep')).toBe('yes');
});

test('single-municipality views do not offer regions', () => {
  setup(false);
  expect(screen.queryByText('Regio Amersfoort')).toBeNull();
});
