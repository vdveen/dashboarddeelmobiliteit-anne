import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, combineReducers } from 'redux';
import filter from '../../reducers/filter.js';
import vehicles from '../../reducers/vehicles.js';
import FilteritemNonOperationalVehicles, { formatOperationalCount } from './FilteritemNonOperationalVehicles';

const renderWithStore = (store) => render(
  <Provider store={store}><FilteritemNonOperationalVehicles /></Provider>
);

describe('formatOperationalCount', () => {
  it('shows only the total for the all button', () => {
    expect(formatOperationalCount(200, 200, false)).toBe('200');
  });
  it('shows count and share of the total for the other buttons', () => {
    expect(formatOperationalCount(50, 200, true)).toBe('50 (25%)');
  });
  it('omits the percentage when there are no vehicles at all', () => {
    expect(formatOperationalCount(0, 0, true)).toBe('0');
  });
  it('shows nothing before the stats are known', () => {
    expect(formatOperationalCount(undefined, undefined, true)).toBe(null);
  });
});

describe('FilteritemNonOperationalVehicles', () => {
  it('renders three buttons with counts and percentages', () => {
    const store = createStore(combineReducers({ filter, vehicles }));
    store.dispatch({
      type: 'SET_VEHICLES_OPERATIONALSTATS',
      payload: { all: 200, non_operational: 50, operational: 150 }
    });
    renderWithStore(store);

    expect(screen.getByText('Alle')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('Defect')).toBeInTheDocument();
    expect(screen.getByText('50 (25%)')).toBeInTheDocument();
    expect(screen.getByText('Niet-defect')).toBeInTheDocument();
    expect(screen.getByText('150 (75%)')).toBeInTheDocument();
  });

  it('updates the filter when a button is clicked', () => {
    const store = createStore(combineReducers({ filter, vehicles }));
    renderWithStore(store);

    fireEvent.click(screen.getByText('Niet-defect'));
    expect(store.getState().filter.operational_status).toBe('operational');

    fireEvent.click(screen.getByText('Defect'));
    expect(store.getState().filter.operational_status).toBe('non_operational');

    fireEvent.click(screen.getByText('Alle'));
    expect(store.getState().filter.operational_status).toBe('all');
  });
});
