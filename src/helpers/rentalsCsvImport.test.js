import { parseRentalsCsv } from './rentalsCsvImport';
const header = 'system_id;lat;lon;start_time;end_time';
const time = '2026-09-01T12:00:00+02:00';
test('preserves quoted records and decimal commas and normalizes explicit time zones', () => {
  const result = parseRentalsCsv(`${header}\r\n"provider\nname";"52,3";4.8;${time};\r\n`);
  expect(result.rows[0]).toMatchObject({ system_id: 'provider\nname', lat: 52.3, start_time: '2026-09-01T10:00:00.000Z', end_time: null });
});
test.each([`voi;52oops;4.8;${time};`, `voi;52;4.8;bad;`, `voi;52;4.8;${time};2026-08-01T00:00:00Z`, `"voi;52;4.8;${time};`, `voi;52;4.8;${time};;extra`])('rejects invalid records instead of skipping or truncating: %s', row => {
  expect(() => parseRentalsCsv(`${header}\n${row}`)).toThrow();
});
