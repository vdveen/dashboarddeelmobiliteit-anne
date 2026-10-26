import { useDispatch, useSelector } from 'react-redux';
import './css/FilteritemHerkomstBestemming.css';

import { StateType } from '../../types/StateType';
import { PARKEERWEERGAVE_DUUR, PARKEERWEERGAVE_NALEVING } from '../../reducers/filter.js';

const VIEWS = [
  { value: PARKEERWEERGAVE_DUUR, name: 'Parkeerduur' },
  { value: PARKEERWEERGAVE_NALEVING, name: 'Parkeernaleving' }
];

// Switches the Aanbod map between parking duration and parking compliance
export default function FilteritemParkeerweergave() {
  const dispatch = useDispatch();
  const parkeerweergave = useSelector((state: StateType) =>
    state.filter?.parkeerweergave === PARKEERWEERGAVE_NALEVING ? PARKEERWEERGAVE_NALEVING : PARKEERWEERGAVE_DUUR
  );

  return (
    <div className="filter-herkomst-bestemming-container">
      <div className="filter-herkomst-bestemming-box-row" role="group" aria-label="Weergave">
        {VIEWS.map(view => (
          <button
            key={view.value}
            type="button"
            aria-pressed={view.value === parkeerweergave}
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
