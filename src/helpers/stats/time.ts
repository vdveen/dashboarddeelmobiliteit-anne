import moment from 'moment-timezone';

export const REPORTING_TIMEZONE = 'Europe/Amsterdam';

/** Preserve explicit offsets; interpret unqualified dashboard dates in Amsterdam. */
export function statsTimeToUtc(value: string): string {
  const time = moment.tz(value, moment.ISO_8601, true, REPORTING_TIMEZONE);
  if (!time.isValid()) throw new Error('Ongeldig tijdstip voor statistieken.');
  return time.toISOString().replace('.000Z', 'Z');
}
