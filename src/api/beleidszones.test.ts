import { getBeleidszonesZones, isBeleidszoneWithStats } from './beleidszones';
import { dedupedFetch } from './dedupedFetch';

jest.mock('./dedupedFetch', () => ({ dedupedFetch: jest.fn() }));

test('only concept analysezones join the published zones', () => {
  expect(isBeleidszoneWithStats({ geography_type: 'monitoring', phase: 'concept' })).toBe(true);
  expect(isBeleidszoneWithStats({ geography_type: 'stop', phase: 'concept' })).toBe(false);
  expect(isBeleidszoneWithStats({ geography_type: 'no_parking', phase: 'concept' })).toBe(false);
  expect(isBeleidszoneWithStats({ geography_type: 'stop', phase: 'active' })).toBe(true);
});

test('labels concept analysezones and drops draft hubs from the zone list', async () => {
  (dedupedFetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => [
      { zone_id: 1, name: 'Analyse', geography_type: 'monitoring', phase: 'concept' },
      { zone_id: 2, name: 'Concepthub', geography_type: 'stop', phase: 'concept' },
      { zone_id: 3, name: 'Hub', geography_type: 'stop', phase: 'active' },
    ],
  });
  const zones = await getBeleidszonesZones('GM0363');
  expect(zones.map(zone => zone.name)).toEqual(['Analyse (concept)', 'Hub']);
});
