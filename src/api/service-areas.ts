import { fetchJson } from './fetchJson';
import { getMdsPublicUrl } from '../helpers/mdsUrl';
import { getMunicipalityCodes } from '../helpers/regions';

// A region is a comma-joined list of codes. The API reads a comma-joined value
// as one code, so repeat the parameter: municipalities=GM0307&municipalities=GM0402
export const municipalitiesQueryParam = (gebied: string | null | undefined): string | null => {
  const codes = getMunicipalityCodes(gebied);
  if (codes.length === 0) {
    return null;
  }
  return codes.map((code) => `municipalities=${encodeURIComponent(code)}`).join('&');
};

export interface AvailableOperatorsResponse {
  operators_with_service_area: string[];
}

export const getAvailableOperators = async (
  municipality: string | null | undefined
): Promise<AvailableOperatorsResponse | null> => {
  const municipalitiesString = municipalitiesQueryParam(municipality);
  if (!municipalitiesString) {
    return null;
  }

  const url = `${getMdsPublicUrl()}/service_area/available_operators?${municipalitiesString}`;

  try {
    return await fetchJson<AvailableOperatorsResponse>(url);
  } catch (error) {
    console.error('Failed to load available service area operators:', error);
    return null;
  }
};
