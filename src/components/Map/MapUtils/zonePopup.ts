import { themes } from '../../../themes';
import { getVehicleTypeIconSrc, getVehicleTypeIconAlt } from '../../../helpers/vehicleTypeIconCommon';
import { popupColor, popupElement } from '../../../helpers/popupDom';

const count = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const sumCounts = (values: unknown): number | null => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const numbers = Object.values(values).map(count);
  return numbers.length && numbers.every(value => value !== null) ? numbers.reduce((sum, value) => sum + value, 0) : null;
};

export function createZonePopup(feature: any, indicatorColor: (parked: number, capacity: number) => string): HTMLElement {
  // MapLibre wraps GeoJSON properties; other callers may already have unwrapped them.
  const properties = feature?.properties || feature || {};
  const root = popupElement('div', 'font-inter');
  root.style.minWidth = '180px';
  root.append(popupElement('div', 'text-lg font-bold', properties.name || 'Zone'));
  let stop;
  try { stop = typeof properties.stop === 'string' ? JSON.parse(properties.stop) : properties.stop; }
  catch { stop = null; }
  if (!stop?.realtime_data) {
    root.append(popupElement('div', 'mt-2 text-sm', 'Geen actuele bezettingsgegevens beschikbaar.'));
    return root;
  }
  const realtime = stop.realtime_data;
  const automatic = stop.status?.control_automatic === true;
  if (!automatic && typeof stop.status?.is_returning === 'boolean') {
    const status = popupElement('div', 'mt-2 text-sm font-bold', `Instelling actief: altijd ${stop.status.is_returning ? 'open' : 'gesloten'}`);
    status.style.color = '#15aeef';
    root.append(status);
  }
  const capacity = count(stop.capacity?.combined) ?? sumCounts(stop.capacity);
  const parked = sumCounts(realtime.num_vehicles_available);
  if (parked !== null) {
    root.append(popupElement('div', 'mt-2 text-sm font-bold', `Bezetting: ${parked}${automatic && capacity !== null ? `/${capacity}` : ''}`));
    if (capacity !== null && capacity > 0) {
      const pct = Math.min(100, Math.floor(parked / capacity * 100));
      const bar = popupElement('div', 'mt-2 rounded-xl flex');
      bar.style.backgroundColor = '#f6f5f4';
      const fill = popupElement('div', 'rounded-l-xl font-bold py-1 px-2', `${pct}%`);
      fill.style.backgroundColor = popupColor(indicatorColor(parked, capacity));
      fill.style.minWidth = `${pct}%`;
      bar.append(fill);
      root.append(bar);
    }
  }
  const modalities = popupElement('div', 'mt-4 text-sm');
  for (const modality of Object.keys(realtime.num_places_available || {})) {
    const vehicles = count(realtime.num_vehicles_available?.[modality]);
    const places = count(stop.capacity?.[modality]) ?? count(stop.capacity?.combined);
    const available = count(realtime.num_places_available?.[modality]);
    if (vehicles === null && places === null) continue;
    const row = popupElement('div', 'flex my-1');
    const dot = popupElement('div', 'rounded-full w-3 h-3 mr-2');
    dot.style.backgroundColor = popupColor(available !== null && available > 0 ? themes.zone.quiet.primaryColor : themes.zone.busy.primaryColor);
    dot.title = `${available !== null && available > 0 ? 'Open' : 'Gesloten'} voor ${getVehicleTypeIconAlt(modality)}`;
    const icon = popupElement('img', 'inline-block w-5 mr-4');
    icon.src = getVehicleTypeIconSrc(modality);
    icon.alt = getVehicleTypeIconAlt(modality);
    icon.style.maxWidth = 'none';
    const label = `${vehicles ?? '?'}${count(stop.capacity?.combined) !== null || places === null ? '' : `/${places}`}`;
    row.append(dot, icon, popupElement('div', 'mr-2', label));
    modalities.append(row);
  }
  root.append(modalities);
  return root;
}
