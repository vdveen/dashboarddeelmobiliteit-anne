import {
  REGIONS,
  getAreaName,
  getAreaOptions,
  getMunicipalityCodes,
  getMunicipalityOptions,
  getRegion,
  getRegionZoneIds,
  hasAccessToArea,
  hasAreaZones,
  PRIORITY_MUNICIPALITY_CODES,
} from './regions';

const municipalityNames = {
  GM0307: 'Amersfoort',
  GM0317: 'Eemnes',
  GM0342: 'Soest',
  GM0308: 'Baarn',
  GM0402: 'Hilversum',
  GM0406: 'Huizen',
  GM0376: 'Blaricum',
  GM0417: 'Laren',
  GM1696: 'Wijdemeren',
  GM1942: 'Gooise Meren',
};

const municipalities = Object.entries(municipalityNames).map(([gm_code, name]) => ({
  gm_code,
  name,
}));

const zones = municipalities.map((municipality, index) => ({
  zone_id: 100 + index,
  municipality: municipality.gm_code,
  zone_type: 'municipality',
}));

test('defines the requested regions in display order with the requested members', () => {
  expect(REGIONS.map(({ name }) => name)).toEqual([
    'Regio Amersfoort',
    'Regio Gooi en Vechtstreek',
    'Regio GV&A',
  ]);
  expect(REGIONS.map(({ gm_code }) => getMunicipalityCodes(gm_code))).toEqual([
    ['GM0307', 'GM0317', 'GM0342', 'GM0308'],
    ['GM0402', 'GM0406', 'GM0376', 'GM0417', 'GM1696', 'GM1942'],
    ['GM0307', 'GM0317', 'GM0342', 'GM0308', 'GM0402', 'GM0406', 'GM0376', 'GM0417', 'GM1696', 'GM1942'],
  ]);
});

test('normalizes municipality lists and resolves region names', () => {
  expect(getMunicipalityCodes(' GM0307,GM0317,GM0307, ')).toEqual(['GM0307', 'GM0317']);
  expect(getRegion(REGIONS[0].gm_code)).toBe(REGIONS[0]);
  expect(getAreaName(REGIONS[2].gm_code, municipalities)).toBe('Regio GV&A');
  expect(getAreaName('GM0402', municipalities)).toBe('Hilversum');
});

test('prepends only regions for which every municipality is accessible', () => {
  const fullOptions = getAreaOptions(municipalities);
  expect(fullOptions.slice(0, 3)).toEqual(REGIONS);
  expect(fullOptions.slice(3).map(({ name }) => name)).toEqual(
    municipalities.map(({ name }) => name).sort((a, b) => a.localeCompare(b, 'nl'))
  );

  const withoutBaarn = municipalities.filter(({ gm_code }) => gm_code !== 'GM0308');
  expect(getAreaOptions(withoutBaarn).map(({ name }) => name)).toEqual([
    'Regio Gooi en Vechtstreek',
    ...withoutBaarn.map(({ name }) => name).sort((a, b) => a.localeCompare(b, 'nl')),
  ]);
  expect(hasAccessToArea(REGIONS[0].gm_code, withoutBaarn)).toBe(false);
});

test('puts the ten regional municipalities before all other municipalities', () => {
  const otherMunicipalities = [
    { gm_code: 'GM0363', name: 'Amsterdam' },
    { gm_code: 'GM0599', name: 'Rotterdam' },
  ];
  const options = getMunicipalityOptions([...otherMunicipalities, ...municipalities]);

  expect(options.slice(0, 10).map(({ gm_code }) => gm_code).sort()).toEqual(
    PRIORITY_MUNICIPALITY_CODES.slice().sort()
  );
  expect(options.slice(0, 10).map(({ name }) => name).sort((a, b) => a.localeCompare(b, 'nl')))
    .toEqual(options.slice(0, 10).map(({ name }) => name));
  expect(options.slice(10).map(({ name }) => name)).toEqual(['Amsterdam', 'Rotterdam']);
});

test('requires every municipality boundary and fails closed when one is missing', () => {
  expect(hasAreaZones(REGIONS[0].gm_code, zones)).toBe(true);
  expect(getRegionZoneIds(REGIONS[0].gm_code, { gebieden: municipalities, zones }))
    .toEqual([100, 101, 102, 103]);

  const missingBoundary = zones.filter(({ municipality }) => municipality !== 'GM0317');
  expect(hasAreaZones(REGIONS[0].gm_code, missingBoundary)).toBe(false);
  expect(getRegionZoneIds(REGIONS[0].gm_code, {
    gebieden: municipalities,
    zones: missingBoundary,
  })).toEqual([]);
});
