import { municipalitiesQueryParam } from './service-areas';

describe('municipalitiesQueryParam', () => {
  it('repeats the parameter for each code in a region', () => {
    expect(municipalitiesQueryParam('GM0307,GM0402')).toBe('municipalities=GM0307&municipalities=GM0402');
  });

  it('passes a single municipality', () => {
    expect(municipalitiesQueryParam('GM0402')).toBe('municipalities=GM0402');
  });

  it('returns null without a selection', () => {
    expect(municipalitiesQueryParam('')).toBeNull();
    expect(municipalitiesQueryParam(undefined)).toBeNull();
  });
});
