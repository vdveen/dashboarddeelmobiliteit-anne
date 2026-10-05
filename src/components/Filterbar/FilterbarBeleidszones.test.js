import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { combineReducers, createStore } from 'redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import filter from '../../reducers/filter';
import FilterbarBeleidszones from './FilterbarBeleidszones';

jest.mock('../Logo/LogoDashboardDeelmobiliteit', () => () => null);
jest.mock('./FilterbarStatistiek', () => () => null);
jest.mock('./FilteritemGebieden.jsx', () => () => null);
jest.mock('./FilteritemDatumVanTot', () => () => null);
jest.mock('./FilteritemZones.jsx', () => () => null);
jest.mock('./FilteritemAanbieders', () => () => null);

let currentSearch;
const LocationSpy = () => {
  currentSearch = useLocation().search;
  return null;
};

test('a zone link wins over the public defaults and keeps its URL', async () => {
  const store = createStore(combineReducers({ filter, metadata: () => ({ gebieden: [] }) }));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/stats/beleidszones?gm_code=GM0363&zones=123']}>
        <Routes>
          <Route path="/stats/beleidszones" element={<><FilterbarBeleidszones hideLogo /><LocationSpy /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  await waitFor(() => expect(store.getState().filter.zones).toBe('123'));
  expect(store.getState().filter.gebied).toBe('GM0363');
  store.dispatch({ type: 'APPLY_PUBLIC_DEFAULT_FILTERS', payload: { aanbiedersexclude: 'lime' } });
  expect(store.getState().filter.gebied).toBe('GM0363');
  expect(store.getState().filter.zones).toBe('123');
  expect(new URLSearchParams(currentSearch).get('zones')).toBe('123');
});
