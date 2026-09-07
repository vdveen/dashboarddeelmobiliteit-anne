import maplibregl from 'maplibre-gl';
import { fireEvent } from '@testing-library/react';
import { parseRentalsCsv } from '../../../helpers/rentalsCsvImport';
import { popupColor, popupHttpUrl } from '../../../helpers/popupDom';
import { initPopupLogic } from './popups';
import { createVehiclePopup, createVehicleOverlapPopup } from './vehiclePopup';
import { createZonePopup } from './zonePopup';
import { createHubSelectionPopup } from './hubPopup';

jest.mock('js-confetti', () => jest.fn(() => ({ addConfetti: jest.fn() })));
jest.mock('maplibre-gl', () => ({ Popup: jest.fn() }));
beforeEach(() => {
  (maplibregl.Popup as unknown as jest.Mock).mockImplementation(() => {
    const popup = { setLngLat: jest.fn(), setDOMContent: jest.fn(), addTo: jest.fn(), remove: jest.fn() };
    [popup.setLngLat, popup.setDOMContent, popup.addTo].forEach(method => method.mockReturnValue(popup));
    return popup;
  });
});
const malicious = '<img src=x onerror=alert(1)>';
const options = { canSeeVehicleId: true, filterDate: '2026-09-01T12:00:00Z' };
const feature = (properties) => ({ properties, geometry: { type: 'Point', coordinates: [4, 52] } });

function expectLiteral(root: HTMLElement, value: string) {
  expect(root.textContent).toContain(value);
  expect(root.querySelector('script,[onerror],[onclick]')).toBeNull();
}

test('an imported provider reaches the actual rental click handler as text', () => {
  const row = parseRentalsCsv(`system_id,lat,lon,start_time,end_time\n${malicious},52,4,,`).rows[0];
  const handlers = {};
  const map = { on: jest.fn((event, layer, handler) => { handlers[`${event}:${layer}`] = handler; }), off: jest.fn() };
  initPopupLogic(map, [], true, options.filterDate);
  handlers['click:rentals-origins-point']({ features: [feature(row)], lngLat: { lng: 4, lat: 52 } });
  const popup = (maplibregl.Popup as unknown as jest.Mock).mock.results[0].value;
  expectLiteral(popup.setDOMContent.mock.calls[0][0], malicious);
});

test('vehicle details keep IDs literal, preserve safe links, and honor ID visibility', () => {
  const properties = { system_id: 'voi', vehicle_id: malicious, distance_in_meters: 0 };
  const root = createVehiclePopup(properties, [{ system_id: 'voi', color: 'red; background:url(https://example.com)' }], options);
  expectLiteral(root, malicious);
  expect(root.textContent).toContain('0 meter');
  expect(root.querySelector('a').href).toMatch(/^https:\/\//);
  expect(root.querySelector('a').rel).toContain('noopener');
  expect(root.querySelector('a').style.backgroundImage).toBe('');
  expect(createVehiclePopup(properties, [], { ...options, canSeeVehicleId: false }).textContent).not.toContain(malicious);
});

test('overlapping vehicle selection still opens the selected details', () => {
  const selected = jest.fn();
  const features = [feature({ vehicle_id: 'first', system_id: 'voi' }), feature({ vehicle_id: malicious, system_id: 'voi' })];
  const root = createVehicleOverlapPopup(features, [], options, selected);
  expectLiteral(root, malicious);
  fireEvent.click(root.querySelectorAll('button')[1]);
  expect(selected).toHaveBeenCalledWith(features[1]);
});

test.each(['javascript:alert(1)', 'data:text/html,test', '//example.com', 'file:///tmp/test'])('rejects popup link protocol: %s', value => {
  expect(popupHttpUrl(value)).toBeNull();
});

test('accepts HTTP links and color values without parsing markup or extra CSS', () => {
  expect(popupHttpUrl('https://example.com/path?a=1')).toBe('https://example.com/path?a=1');
  expect(popupColor('#15aeef')).not.toBe('#666');
  expect(popupColor('red; background-image:url(https://example.com)')).toBe('#666');
});

test('zone popups unwrap properties, keep names literal, and handle missing or invalid stop data', () => {
  const properties = { name: malicious, stop: '{broken-json' };
  const fallback = createZonePopup({ properties }, () => '#fff');
  expectLiteral(fallback, malicious);
  expect(fallback.textContent).toContain('Geen actuele');
  const root = createZonePopup({ properties: { name: malicious, stop: JSON.stringify({
    status: { control_automatic: true }, capacity: { bicycle: 5 },
    realtime_data: { num_places_available: { bicycle: 5 }, num_vehicles_available: { bicycle: 0 } },
  }) } }, () => 'red; background:url(https://example.com)');
  expectLiteral(root, malicious);
  expect(root.textContent).toContain('Bezetting: 0/5');
  expect(root.textContent).toContain('0%');
});

test('hub names and phases remain text and row selection preserves the ID', () => {
  const selected = jest.fn();
  const root = createHubSelectionPopup([{ properties: { id: '42', name: malicious, phase: malicious, geography_type: 'stop' } }], selected);
  expectLiteral(root, malicious);
  fireEvent.click(root.querySelector('button'));
  expect(selected).toHaveBeenCalledWith(42);
});
