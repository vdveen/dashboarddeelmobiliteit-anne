import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore, combineReducers } from 'redux';
import filter from '../../reducers/filter.js';
import FilteritemHerkomstBestemming from './FilteritemHerkomstBestemming';

const renderWith = ({ rentalsLayers = ['verhuurdata-clusters'], csv_data = null } = {}) => {
  const layers = () => ({
    displaymode: 'displaymode-rentals',
    active_data_layers: { 'displaymode-rentals': rentalsLayers }
  });
  const rentals = () => ({ csv_data });
  const store = createStore(combineReducers({ filter, layers, rentals }));
  render(<Provider store={store}><FilteritemHerkomstBestemming /></Provider>);
};

describe('FilteritemHerkomstBestemming', () => {
  it('says the map shows trip starts by default and trip ends after switching', () => {
    renderWith();
    expect(screen.getByText('De kaart toont waar ritten begonnen.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bestemming'));
    expect(screen.getByText('De kaart toont waar ritten eindigden.')).toBeInTheDocument();
  });

  it('keeps the HB explanation in the HB view', () => {
    renderWith({ rentalsLayers: ['verhuurdata-hb'] });
    expect(screen.queryByText(/De kaart toont/)).not.toBeInTheDocument();
    expect(screen.getByText(/waar men vandaan kwam/)).toBeInTheDocument();
  });

  it('omits the hint for imported park events', () => {
    renderWith({ csv_data: { rows: [] } });
    expect(screen.queryByText(/De kaart toont/)).not.toBeInTheDocument();
  });
});
