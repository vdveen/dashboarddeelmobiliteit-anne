const amersfoort = ['GM0307', 'GM0317', 'GM0342', 'GM0308'];
const gooiEnVechtstreek = ['GM0402', 'GM0406', 'GM0376', 'GM0417', 'GM1696', 'GM1942'];

export const REGIONS = [
  { name: 'Regio Amersfoort', gm_code: amersfoort.join(',') },
  { name: 'Regio Gooi en Vechtstreek', gm_code: gooiEnVechtstreek.join(',') },
  { name: 'Regio GV&A', gm_code: [...amersfoort, ...gooiEnVechtstreek].join(',') },
];

export const getMunicipalityCodes = (selection) =>
  [...new Set((selection || '').split(',').map(code => code.trim()).filter(Boolean))];

export const getRegion = (selection) => REGIONS.find(region => region.gm_code === selection);

export const hasAccessToArea = (selection, municipalities = []) => {
  const codes = getMunicipalityCodes(selection);
  return codes.length > 0 && codes.every(code => municipalities.some(area => area.gm_code === code));
};

export const getAreaOptions = (municipalities = []) => [
  ...REGIONS.filter(region => hasAccessToArea(region.gm_code, municipalities)),
  ...municipalities.filter(area => area.gm_code).slice().sort((a, b) => a.name.localeCompare(b.name, 'nl')),
];

export const getAreaName = (selection, municipalities = []) =>
  getRegion(selection)?.name || municipalities.find(area => area.gm_code === selection)?.name;

export const hasAreaZones = (selection, zones = []) =>
  getMunicipalityCodes(selection).every(code => zones.some(zone => zone.municipality === code));

// A regional query must contain every municipality boundary. Missing metadata
// must never turn a region into a partial region or an unfiltered national query.
export const getRegionZoneIds = (selection, metadata) => {
  if (!hasAccessToArea(selection, metadata.gebieden)) return [];
  const boundaries = getMunicipalityCodes(selection).map(code =>
    metadata.zones.filter(zone => zone.municipality === code && zone.zone_type === 'municipality')
  );
  if (boundaries.some(zones => zones.length === 0)) return [];
  return [...new Set(boundaries.flat().map(zone => zone.zone_id))];
};
