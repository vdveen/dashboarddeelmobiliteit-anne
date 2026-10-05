const API_ROOT = (process.env.REACT_APP_VOI_API_URL || 'https://voi-snapshot-api-production.up.railway.app').replace(/\/$/, '');

export interface VoiAvailabilityPoint {
  captured_at: string;
  total: number;
  /** Vehicles the source reported as operational (is_non_operational false). */
  operational: number;
  non_operational: number;
  /** Vehicles without a reported status. Snapshots before 2026-09-08T09:00Z are all unknown. */
  unknown: number;
}

export interface VoiAvailabilitySeries {
  from: string;
  to: string;
  series: VoiAvailabilityPoint[];
}

export type VoiLassoPolygon = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/**
 * Server validation messages that a user can act on, in Dutch. Anything else is
 * passed through as is, so an unexpected message is still visible.
 */
const AVAILABILITY_ERRORS: Record<string, string> = {
  'polygon is not a valid geometry': 'De getekende vorm overlapt zichzelf. Teken het gebied opnieuw.',
  'Each polygon ring needs at least four positions': 'Het gebied heeft te weinig punten. Teken minstens drie punten.',
};

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { error?: unknown };
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    return message ? message : null;
  } catch (parseError) {
    return null;
  }
}

/** Counts vehicles per snapshot inside a lasso polygon. */
export async function fetchVoiAvailability(
  polygon: VoiLassoPolygon,
  from?: string,
  to?: string,
  signal?: AbortSignal
): Promise<VoiAvailabilitySeries> {
  const response = await fetch(`${API_ROOT}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, from, to }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 400) {
      const message = await readErrorMessage(response);
      if (message) {
        throw new Error(AVAILABILITY_ERRORS[message] || `De selectie is ongeldig: ${message}`);
      }
    }
    throw new Error(`Het meetarchief gaf status ${response.status}.`);
  }

  const data = await response.json() as VoiAvailabilitySeries;
  if (!Array.isArray(data?.series)) {
    throw new Error('Het beschikbaarheidsantwoord bevat geen reeks.');
  }

  return data;
}
