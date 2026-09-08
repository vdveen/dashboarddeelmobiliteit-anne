import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import Button from '../Button/Button';

import { parseRentalsCsv, MAX_CSV_BYTES } from '../../helpers/rentalsCsvImport';
import { forceUpdateVerhuringenData } from '../../poll-api/pollVerhuringenData';

// 'Ruwe data import' for the Verhuringen view: load a CSV export of
// park_events (system_id, lat, lon, start_time, end_time, form_factor,
// propulsion_type) and show it on the map instead of the API data
export default function FilteritemRuweDataImport() {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const csvData = useSelector((state) => {
    return state.rentals ? state.rentals.csv_data : null;
  });

  const readerRef = useRef(null);
  useEffect(() => () => readerRef.current?.abort(), []);

  const onFileSelected = (event) => {
    const file = event.target.files && event.target.files[0];
    // Reset input, so selecting the same file again re-triggers onChange
    event.target.value = '';
    if (!file) return;

    readerRef.current?.abort();
    if (file.size > MAX_CSV_BYTES) { setErrorMessage('CSV-bestand mag maximaal 10 MB zijn.'); return; }
    setErrorMessage(null);

    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = () => {
      if (readerRef.current !== reader) return;
      try {
        const { rows } = parseRentalsCsv(reader.result);
        dispatch({
          type: 'SET_RENTALS_CSV_DATA',
          payload: {
            fileName: file.name,
            rows: rows
          }
        });
        dispatch({ type: 'LAYER_SET_SINGLE_DATA_LAYER', payload: { displayMode: 'displaymode-rentals', layerName: 'verhuurdata-voertuigen' } });
        forceUpdateVerhuringenData();
      } catch (error) {
        setErrorMessage(error.message || 'Het CSV-bestand kon niet worden gelezen');
      }
    };
    reader.onerror = () => {
      setErrorMessage('Het bestand kon niet worden gelezen');
    };
    reader.readAsText(file);
  };

  const clearImport = () => {
    readerRef.current?.abort();
    readerRef.current = null;
    setErrorMessage(null);
    dispatch({ type: 'CLEAR_RENTALS_CSV_DATA' });
    // Re-fetch API data, so the map switches back to live data
    forceUpdateVerhuringenData();
  };

  return (
    <div className="mb-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onFileSelected}
      />

      {! csvData && (
        <Button
          theme="white"
          classes="w-full"
          style={{marginLeft: 0, marginRight: 0}}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          CSV laden
        </Button>
      )}

      {csvData && (
        <div className="text-sm">
          <div className="font-bold break-all">
            {csvData.fileName}
          </div>
          <div>
            {csvData.rows.length} parkeerwaarnemingen geladen
          </div>
          <div className="mt-1">
            <small>
              De kaart toont parkeerwaarnemingen uit dit bestand, geen ritten. Alleen aanbieder- en voertuigtypefilters gelden. Plaats, zone, datum, afstand en herkomst/bestemming gelden niet. Gebruik een punten-, cluster- of heatmaplaag.
            </small>
          </div>
          <Button
            theme="white"
            classes="w-full"
            style={{marginLeft: 0, marginRight: 0}}
            onClick={clearImport}
          >
            Import verwijderen
          </Button>
        </div>
      )}

      {errorMessage && (
        <div className="text-sm mt-1" style={{color: '#FD3E48'}}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
