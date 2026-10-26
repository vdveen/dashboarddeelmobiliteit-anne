import { useDispatch, useSelector } from 'react-redux';
import './css/FilteritemHerkomstBestemming.css';

import { StateType } from '../../types/StateType';
import { PARKEERWEERGAVE_DRUKTE, PARKEERWEERGAVE_DUUR, PARKEERWEERGAVE_NALEVING, PARKEERWEERGAVES } from '../../reducers/filter.js';

const VIEWS = [
  // Soft hyphens let the names break over two lines in three buttons
  { value: PARKEERWEERGAVE_DUUR, name: 'Parkeer\u00ADduur' },
  { value: PARKEERWEERGAVE_NALEVING, name: 'Parkeer\u00ADnaleving' },
  { value: PARKEERWEERGAVE_DRUKTE, name: 'Drukte' }
];

// Switches the Aanbod map between parking duration, parking compliance and
// drukte (where trips ended)
export default function FilteritemParkeerweergave() {
  const dispatch = useDispatch();
  const parkeerweergave = useSelector((state: StateType) =>
    PARKEERWEERGAVES.includes(state.filter?.parkeerweergave) ? state.filter.parkeerweergave : PARKEERWEERGAVE_DUUR
  );

  return (
    <div className="filter-herkomst-bestemming-container">
      <div className="filter-herkomst-bestemming-box-row" role="group" aria-label="Weergave">
        {VIEWS.map(view => (
          <button
            key={view.value}
            type="button"
            aria-pressed={view.value === parkeerweergave}
            style={{ width: `${100 / VIEWS.length}%`, fontSize: 13, lineHeight: '15px', padding: '2px 4px', hyphens: 'manual' }}
            className={'filter-herkomst-bestemming-button' + (view.value === parkeerweergave ? ' filter-herkomst-bestemming-button-active' : '')}
            onClick={() => dispatch({ type: 'SET_FILTER_PARKEERWEERGAVE', payload: view.value })}
          >
            {view.name}
          </button>
        ))}
      </div>
    </div>
  );
}
