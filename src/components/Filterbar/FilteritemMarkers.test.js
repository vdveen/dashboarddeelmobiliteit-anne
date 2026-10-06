import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { FilteritemMarkersParkeerduur, FilteritemMarkersAfstand } from './FilteritemMarkers.jsx';

const createTestStore = (vehicles, filter = {}) => createStore(() => ({ vehicles, filter }));

const counts = () => Array.from(document.querySelectorAll('.filter-markers-itemcount'))
  .map(e => Array.from(e.children).map(span => span.textContent).join(' '));
const barHeights = () => Array.from(document.querySelectorAll('.filter-markers-bar')).map(e => e.style.height);

test('shows count and percentage per parkeerduur bin', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: {0: 50, 1: 25, 2: 15, 3: 10, 4: 0} })}>
      <FilteritemMarkersParkeerduur />
    </Provider>
  );
  expect(counts()).toEqual(['50 50%', '25 25%', '15 15%', '10 10%', '0 0%']);
});

test('bar heights scale to the largest bin', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: {0: 50, 1: 25, 2: 15, 3: 10, 4: 0} })}>
      <FilteritemMarkersParkeerduur />
    </Provider>
  );
  expect(barHeights()).toEqual(['96px', '48px', '29px', '19px', '0px']);
});

test('excluded bins keep their own count', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: {0: 50, 1: 25, 2: 15, 3: 10, 4: 0} }, { parkeerduurexclude: '1' })}>
      <FilteritemMarkersParkeerduur />
    </Provider>
  );
  expect(counts()).toEqual(['50 50%', '25 25%', '15 15%', '10 10%', '0 0%']);
});

test('renders nothing extra when there are no stats yet', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: null })}>
      <FilteritemMarkersParkeerduur />
    </Provider>
  );
  expect(counts()).toEqual([]);
});

test('renders nothing extra when all counts are zero', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0} })}>
      <FilteritemMarkersParkeerduur />
    </Provider>
  );
  expect(counts()).toEqual([]);
});

test('afstand legend is unaffected', () => {
  render(
    <Provider store={createTestStore({ parkeerduurstats: {0: 50} })}>
      <FilteritemMarkersAfstand />
    </Provider>
  );
  expect(counts()).toEqual([]);
});
