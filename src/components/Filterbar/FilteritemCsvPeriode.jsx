import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addDays, format, max } from 'date-fns';
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
  // The file is usually older than today, so the presets count back from the
  // last day in the file and stop at its first day.
  const presetButtons = useMemo(() => {
    const fileStart = toDate(fileRange.start);
    const fileEnd = toDate(fileRange.end);
    const lastDays = (days, label) => ({
      key: `csv-last-${days}`,
      label,
      start: max([fileStart, addDays(fileEnd, 1 - days)]),
      end: fileEnd
    });
    return [
      lastDays(1, 'Laatste dag'),
      lastDays(2, 'Laatste 2 dagen'),
      lastDays(7, 'Laatste 7 dagen'),
      lastDays(14, 'Laatste 14 dagen'),
      lastDays(30, 'Laatste 30 dagen'),
      lastDays(90, 'Laatste 90 dagen'),
      { key: 'csv-file', label: 'Volledig bestand', start: fileStart, end: fileEnd }
    ];
  }, [fileRange]);

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
