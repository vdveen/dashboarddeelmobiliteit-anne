import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { format } from 'date-fns';
import moment from 'moment';

import './css/FilteritemDatum.css';
import './css/FilteritemDuur.css';

import FilteritemDatumVanTot from './FilteritemDatumVanTot.jsx';
import { forceUpdateVerhuringenData } from '../../poll-api/pollVerhuringenData';

const toDate = (day) => moment(day, 'YYYY-MM-DD', true).toDate();

// Period of the imported CSV ('Ruwe data import'). Replaces the Periode slider
// while an import is active; the map shows rows from the chosen days only.
export default function FilteritemCsvPeriode() {
  const dispatch = useDispatch();
  const csvData = useSelector((state) => state.rentals.csv_data);
  const { range, fileRange } = csvData;

  const value = useMemo(
    () => ({ startDate: toDate(range.start), endDate: toDate(range.end) }),
    [range]
  );
  const presetButtons = useMemo(() => [{
    key: 'csv-file',
    label: 'Volledig bestand',
    start: toDate(fileRange.start),
    end: toDate(fileRange.end)
  }], [fileRange]);

  const onRangeChange = (start, end) => {
    dispatch({
      type: 'SET_RENTALS_CSV_RANGE',
      payload: { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
    });
    forceUpdateVerhuringenData();
  };

  return (
    <div className="filter-duur-container">
      <div className="filter-datum-title">
        Periode
      </div>
      <FilteritemDatumVanTot
        value={value}
        onRangeChange={onRangeChange}
        presetButtons={presetButtons}
      />
    </div>
  );
}
