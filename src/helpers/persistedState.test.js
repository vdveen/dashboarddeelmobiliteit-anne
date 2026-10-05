import layers from '../reducers/layers';
import { migrateRentalsDefaultToClusters } from './persistedState';

test('a new session shows rentals as clusters', () => {
  const state = layers(undefined, { type: '@@INIT' });
  expect(state.view_rentals).toBe('verhuurdata-clusters');
  expect(state.active_data_layers['displaymode-rentals']).toEqual(['verhuurdata-clusters']);
});

test('moves a saved session on the old vehicles default to clusters', () => {
  const saved = {
    view_rentals: 'verhuurdata-voertuigen',
    active_data_layers: { 'displaymode-rentals': ['verhuurdata-voertuigen'] },
  };
  migrateRentalsDefaultToClusters(saved);
  expect(saved.view_rentals).toBe('verhuurdata-clusters');
  expect(saved.active_data_layers['displaymode-rentals']).toEqual(['verhuurdata-clusters']);
});

test('keeps any other saved rentals layer', () => {
  const saved = {
    view_rentals: 'verhuurdata-hb',
    active_data_layers: { 'displaymode-rentals': ['verhuurdata-heatmap'] },
  };
  migrateRentalsDefaultToClusters(saved);
  expect(saved.view_rentals).toBe('verhuurdata-hb');
  expect(saved.active_data_layers['displaymode-rentals']).toEqual(['verhuurdata-heatmap']);
  expect(() => migrateRentalsDefaultToClusters(undefined)).not.toThrow();
});
