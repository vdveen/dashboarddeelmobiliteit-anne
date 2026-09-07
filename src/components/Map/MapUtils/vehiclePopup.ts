import moment from 'moment';
import { getProviderColor, getPrettyProviderName, getProviderWebsiteUrl } from '../../../helpers/providers';
import { getPrettyVehicleTypeName } from '../../../helpers/vehicleTypes';
import { getVehicleTypeIconSrc, getVehicleTypeIconAlt } from '../../../helpers/vehicleTypeIconCommon';
import { popupColor, popupElement, popupHttpUrl } from '../../../helpers/popupDom';
import { createProviderLabel } from '../../PrestatiesAanbieders/ProviderLabel';

type Properties = Record<string, any>;
export interface VehiclePopupOptions {
  canSeeVehicleId: boolean;
  filterDate: string;
  hideProviderTitle?: boolean;
}

function header(properties: Properties, providers: any[], options: VehiclePopupOptions) {
  const type = getPrettyVehicleTypeName(properties.form_factor) || '';
  return createProviderLabel(`${getPrettyProviderName(properties.system_id)} ${type}`,
    getProviderColor(providers, properties.system_id), { showTitle: !options.hideProviderTitle });
}

export function createVehiclePopup(properties: Properties, providers: any[], options: VehiclePopupOptions): HTMLElement {
  const root = popupElement('div');
  root.append(header(properties, providers, options));
  const body = popupElement('div', 'Map-popup-body');
  if (properties.in_public_space_since) {
    const time = moment(properties.in_public_space_since, moment.ISO_8601, true).locale('nl');
    if (time.isValid()) {
      const parked = popupElement('div', '', `Staat hier sinds ${time.from(options.filterDate)}`);
      parked.append(popupElement('br'), document.createTextNode(`Geparkeerd sinds: ${time.format('DD-MM-YYYY HH:mm')}`));
      body.append(parked);
    }
  }
  const distance = properties.distance_in_meters;
  if (distance !== null && distance !== undefined && distance !== '' && Number.isFinite(Number(distance))) {
    body.append(popupElement('div', '', `Dit voertuig is ${Number(distance)} meter verplaatst`));
  }
  if (options.canSeeVehicleId && properties.vehicle_id) {
    body.append(popupElement('div', 'mt-4 mb-4 text-xs block text-gray-400', properties.vehicle_id));
  }
  const website = popupHttpUrl(getProviderWebsiteUrl(properties.system_id));
  if (website) {
    const wrapper = popupElement('div', 'mt-2');
    const link = popupElement('a', 'inline-block py-1 px-2 text-white rounded-md hover:opacity-80', 'website');
    link.href = website;
    link.rel = 'external noopener noreferrer';
    link.target = '_blank';
    link.style.backgroundColor = popupColor(getProviderColor(providers, properties.system_id));
    wrapper.append(link);
    body.append(wrapper);
  }
  root.append(body);
  return root;
}

export function createVehicleOverlapPopup(features: any[], providers: any[], options: VehiclePopupOptions, onSelect: (feature: any) => void): HTMLElement {
  const root = popupElement('div');
  root.append(header(features[0].properties || {}, providers, options));
  const body = popupElement('div', 'Map-popup-body');
  const table = popupElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  const heading = popupElement('tr');
  for (const label of ['voertuig-id', 'sinds']) {
    const cell = popupElement('th', '', label);
    Object.assign(cell.style, { textAlign: 'left', fontWeight: '600', padding: '0 4px 6px 4px', fontSize: '12px' });
    heading.append(cell);
  }
  const thead = popupElement('thead');
  thead.append(heading);
  const tbody = popupElement('tbody');
  for (const feature of features) {
    const properties = feature.properties || {};
    const row = popupElement('tr', 'dd-vehicle-overlap-row');
    row.style.cursor = 'pointer';
    const cell = popupElement('td');
    cell.style.padding = '4px';
    const button = popupElement('button', '', options.canSeeVehicleId ? properties.vehicle_id || '-' : '-');
    button.type = 'button';
    button.setAttribute('aria-label', `Toon voertuig ${options.canSeeVehicleId ? properties.vehicle_id || '' : ''}`);
    Object.assign(button.style, { display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' });
    const icon = popupElement('img');
    icon.src = getVehicleTypeIconSrc(properties.form_factor);
    icon.alt = getVehicleTypeIconAlt(properties.form_factor);
    Object.assign(icon.style, { height: '18px', width: 'auto', marginRight: '6px' });
    button.append(icon);
    cell.append(button);
    const time = moment(properties.in_public_space_since, moment.ISO_8601, true);
    const since = popupElement('td', '', properties.in_public_space_since && time.isValid() ? time.format('DD/MM HH:mm') : '-');
    since.style.padding = '4px';
    row.append(cell, since);
    row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); onSelect(feature); });
    tbody.append(row);
  }
  table.append(thead, tbody);
  body.append(table);
  root.append(body);
  return root;
}
