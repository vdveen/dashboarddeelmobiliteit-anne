import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import './css/FilteritemHerkomstBestemming.css';
import './css/FilteritemNonOperationalVehicles.css';

import { StateType } from '../../types/StateType';
import {
  OPERATIONAL_STATUS_ALL,
  OPERATIONAL_STATUS_NON_OPERATIONAL,
  OPERATIONAL_STATUS_OPERATIONAL
} from '../../reducers/filter.js';

// Count and percentage shown below a button, like the Parkeerduur legend.
// The 'all' button only shows the total; the other two show their share of it.
export const formatOperationalCount = (count, total, showPercentage) => {
  if (count === undefined || count === null || total === undefined || total === null) {
    return null;
  }
  if (!showPercentage) return `${count}`;
  if (total <= 0) return `${count}`;
  return `${count} (${Math.round(100 * count / total)}%)`;
};

export default function FilteritemNonOperationalVehicles() {
  const dispatch = useDispatch();

  const operationalStatus = useSelector((state: StateType) => {
    return state.filter && state.filter.operational_status
      ? state.filter.operational_status
      : OPERATIONAL_STATUS_ALL;
  });

  // Number of vehicles per operational status, as calculated in pollParkingData
  const operationalstats = useSelector((state: StateType) => {
    return state.vehicles ? state.vehicles.operationalstats : null;
  });

  const setOperationalStatus = (value) => () => {
    dispatch({ type: 'SET_FILTER_OPERATIONAL_STATUS', payload: value });
  };

  const total = operationalstats ? operationalstats[OPERATIONAL_STATUS_ALL] : undefined;

  const buttons = [
    { status: OPERATIONAL_STATUS_ALL, name: 'Alle', showPercentage: false },
    { status: OPERATIONAL_STATUS_NON_OPERATIONAL, name: 'Defect', showPercentage: true },
    { status: OPERATIONAL_STATUS_OPERATIONAL, name: 'Niet-defect', showPercentage: true }
  ];

  return (
    <div className="filter-herkomst-bestemming-container">
      <div className="filter-herkomst-bestemming-box-row">
        {buttons.map(button => {
          let className = 'filter-herkomst-bestemming-button filter-operational-status-button';
          if (button.status === operationalStatus) {
            className += ' filter-herkomst-bestemming-button-active';
          }
          const count = operationalstats ? operationalstats[button.status] : undefined;
          const countLabel = formatOperationalCount(count, total, button.showPercentage);

          return (
            <div
              key={button.status}
              className={className}
              onClick={setOperationalStatus(button.status)}
            >
              <div>{button.name}</div>
              {countLabel !== null && (
                <div className="filter-operational-status-count">
                  {countLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
