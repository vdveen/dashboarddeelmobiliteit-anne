const layer = {
  'id': 'vehicles-point',
  'type': 'symbol',
  'source': 'vehicles',
  'layout': {
    'icon-image': [
      'concat',
      ['get', 'system_id'],
      // Parkeernaleving colors by distance to a parking hub (afstand_bin)
      ['case',
        ['has', 'afstand_bin'],
        ['concat', '-p-a:', ['to-string', ['get', 'afstand_bin']]],
        ['concat',
          ['case', ['==', ['get', 'is_non_operational'], true], '-p-n:', '-p:'],
          ['to-string', ['get', 'duration_bin']]
        ]
      ]
    ],
    // 'icon-size': 0.4,
    'icon-size': [
      'interpolate',
        ['linear'],
        ['zoom'],
        11,
        0.2,
        16,
        0.7
      ],
    'icon-allow-overlap': true,
  },
  'minzoom': 6
}

export default layer;
