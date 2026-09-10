import { parseRentalsCsv, importedParkingPoints } from './rentalsCsvImport';
const header = 'system_id;lat;lon;start_time;end_time';
const time = '2026-09-01T12:00:00+02:00';
test('preserves quoted records and decimal commas and normalizes explicit time zones', () => {
  const result = parseRentalsCsv(`${header}\r\n"provider\nname";"52,3";4.8;${time};\r\n`);
  expect(result.rows[0]).toMatchObject({ system_id: 'provider\nname', lat: 52.3, start_time: '2026-09-01T10:00:00.000Z', end_time: null });
});
test('interprets the documented timezone-less park_events export in Amsterdam', () => {
  const result = parseRentalsCsv(
    `${header}\nvoi;52.3;4.8;2026-03-29 01:30:00.123456;`
  );
  expect(result.rows[0].start_time).toBe('2026-03-29T00:30:00.123Z');
});
test.each([`voi;52oops;4.8;${time};`, `voi;52;4.8;bad;`, `voi;52;4.8;${time};2026-08-01T00:00:00Z`, `"voi;52;4.8;${time};`, `voi;52;4.8;${time};;extra`])('rejects invalid records instead of skipping or truncating: %s', row => {
  expect(() => parseRentalsCsv(`${header}\n${row}`)).toThrow();
});

test('accepts files larger than 10 MB', () => {
  const provider = 'v'.repeat(10 * 1024 * 1024);
  const result = parseRentalsCsv(`${header}\n${provider};52;4.8;${time};`);
  expect(result.rows[0].system_id).toHaveLength(provider.length);
});

test('accepts more than 50,000 rows', () => {
  const row = `voi;52;4.8;${time};`;
  const result = parseRentalsCsv(`${header}\n${Array(50001).fill(row).join('\n')}`);
  expect(result.rows).toHaveLength(50001);
});

test('imports one parking observation per row with stable IDs and provider filtering', () => {
  const rows = parseRentalsCsv(`${header}\nvoi;52;4.8;${time};\nother;52;4.8;${time};`).rows;
  const data = importedParkingPoints(rows, {});
  expect(data.features).toHaveLength(2);
  expect(data.features.map(f => f.properties.id)).toEqual(['import-0', 'import-1']);
  expect(data.features[0].properties).toMatchObject({
    observation_kind: 'parking',
    distance_bin: 0,
    distance_in_meters: null
  });
  expect(importedParkingPoints(rows, { aanbiedersexclude: 'voi' }).features.map(f => f.properties.id)).toEqual(['import-1']);
});
