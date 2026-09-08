import moment from 'moment-timezone';

export const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50000;
const REQUIRED = ['system_id', 'lat', 'lon', 'start_time', 'end_time'];

// Record parser: quoted delimiters/newlines and doubled quotes are preserved.
function records(text, delimiter) {
  const result = [];
  let row = [], field = '', quoted = false, closed = false, line = 1, start = 1;
  const fail = () => { throw new Error(`Regel ${line}: ongeldige aanhalingstekens.`); };
  const endField = () => { row.push(field.trim()); field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
      } else { field += c; if (c === '\n') line++; }
      continue;
    }
    if (c === '"') { if (field || closed) fail(); quoted = true; }
    else if (c === delimiter) endField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endField();
      if (row.some(Boolean)) result.push({ fields: row, line: start });
      if (result.length > MAX_ROWS + 1) throw new Error(`Maximaal ${MAX_ROWS} datarijen toegestaan.`);
      row = []; start = ++line;
    } else { if (closed && c.trim()) fail(); if (!closed) field += c; }
  }
  if (quoted) fail();
  endField();
  if (row.some(Boolean)) result.push({ fields: row, line: start });
  return result;
}

function timestamp(value, required) {
  if (!value && !required) return null;
  // Dashboard exports may use a PostgreSQL +02 suffix.
  const normalized = value.replace(/([+-]\d{2})$/, '$1:00');
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(normalized)) throw new Error('tijdstip vereist een tijdzone');
  const parsed = moment.parseZone(normalized, moment.ISO_8601, true);
  if (!parsed.isValid()) throw new Error('ongeldig tijdstip');
  return parsed.toISOString();
}

/** Import parking observations, not trips. Reject invalid records without truncation. */
export function parseRentalsCsv(csvText) {
  if (typeof csvText !== 'string' || new Blob([csvText]).size > MAX_CSV_BYTES) throw new Error('CSV-bestand mag maximaal 10 MB zijn.');
  const text = csvText.replace(/^\uFEFF/, '');
  const headerLine = text.split(/\r\n|\r|\n/, 1)[0];
  const delimiter = [',', ';'].find(candidate => {
    try { return REQUIRED.every(name => records(headerLine, candidate)[0]?.fields.map(x => x.toLowerCase()).includes(name)); }
    catch { return false; }
  });
  if (!delimiter) throw new Error(`Verwachte kolommen: ${REQUIRED.join(', ')}.`);
  const parsed = records(text, delimiter);
  const header = parsed[0].fields.map(x => x.toLowerCase());
  if (new Set(header).size !== header.length || header.some(x => !x)) throw new Error('Kolomnamen moeten uniek en niet leeg zijn.');
  if (parsed.length < 2) throw new Error('Het CSV-bestand bevat geen datarijen.');
  if (parsed.length > MAX_ROWS + 1) throw new Error(`Maximaal ${MAX_ROWS} datarijen toegestaan.`);
  const rows = parsed.slice(1).map(({ fields, line }) => {
    try {
      if (fields.length !== header.length) throw new Error('aantal velden wijkt af van de kopregel');
      const values = Object.fromEntries(header.map((name, i) => [name, fields[i]]));
      if (!values.system_id) throw new Error('system_id ontbreekt');
      const coordinate = (value, bound) => {
        if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value)) throw new Error('ongeldige coördinaat');
        const number = Number(value.replace(',', '.'));
        if (!Number.isFinite(number) || Math.abs(number) > bound) throw new Error('coördinaat buiten bereik');
        return number;
      };
      const start_time = timestamp(values.start_time, true);
      const end_time = timestamp(values.end_time, false);
      if (end_time && end_time < start_time) throw new Error('eindtijd ligt voor begintijd');
      return { system_id: values.system_id, lat: coordinate(values.lat, 90), lon: coordinate(values.lon, 180),
        start_time, end_time, form_factor: values.form_factor || null, propulsion_type: values.propulsion_type || null };
    } catch (error) { throw new Error(`Regel ${line}: ${error.message}. Import is niet gewijzigd.`); }
  });
  return { rows, skipped: 0 };
}

export function importedParkingPoints(rows, filter) {
  const excludedProviders = (filter.aanbiedersexclude || '').split(',');
  const excludedTypes = (filter.voertuigtypesexclude || '').split(',');
  return { type: 'FeatureCollection', features: rows.flatMap((row, index) => {
    if (excludedProviders.includes(row.system_id) || excludedTypes.includes(row.form_factor)) return [];
    return [{ type: 'Feature', properties: { id: `import-${index}`, system_id: row.system_id,
      form_factor: row.form_factor, observation_kind: 'parking', in_public_space_since: row.start_time,
      end_time: row.end_time, distance_in_meters: null }, geometry: { type: 'Point', coordinates: [row.lon, row.lat] } }];
  }) };
}
