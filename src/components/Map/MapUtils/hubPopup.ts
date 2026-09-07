import { readable_phase } from '../../../helpers/policy-hubs/common';
import { popupElement } from '../../../helpers/popupDom';
import { createProviderLabel } from '../../PrestatiesAanbieders/ProviderLabel';

export function createHubSelectionPopup(features: any[], onSelect: (id: string | number) => void): HTMLElement {
  const root = popupElement('div');
  root.append(createProviderLabel('Selecteer een zone', '#0B3D20'));
  const body = popupElement('div', 'Map-popup-body');
  const table = popupElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  const heading = popupElement('tr');
  for (const label of ['#', 'naam', 'type/fase']) {
    const cell = popupElement('th', '', label);
    Object.assign(cell.style, { textAlign: 'left', padding: '0 4px 6px', fontSize: '12px' });
    heading.append(cell);
  }
  const thead = popupElement('thead');
  thead.append(heading);
  const tbody = popupElement('tbody');
  features.forEach((feature, index) => {
    const properties = feature?.properties || {};
    const type = ({ stop: 'hub', no_parking: 'verbodszone', monitoring: 'analysezone' })[properties.geography_type] || properties.geography_type || '-';
    const phase = properties.phase ? readable_phase(properties.phase) : '-';
    const row = popupElement('tr', 'dd-vehicle-overlap-row');
    const number = popupElement('td', '', `${index + 1}.`);
    const name = popupElement('td');
    const button = popupElement('button', '', properties.name || '-');
    button.type = 'button';
    name.append(button);
    const description = popupElement('td', '', `${type} (${phase})`);
    [number, name, description].forEach(cell => Object.assign(cell.style, { padding: '4px', verticalAlign: 'top' }));
    row.append(number, name, description);
    row.style.cursor = 'pointer';
    row.addEventListener('click', event => {
      const id = properties.id;
      if ((typeof id !== 'string' && typeof id !== 'number') || id === '') return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(Number.isNaN(Number(id)) ? id : Number(id));
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  body.append(table);
  root.append(body);
  return root;
}
