export const heatmapIntensity = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0, 0.0025,
  5, 0.005,
  7.5, 0.02,
  10, 0.1,
  12, 0.25,/* city level */
  15, 0.3,
  17, 0.5,
  20, 1,
]

export const clustersPointLayer = {
  'type': 'symbol',
  filter: ['!', ['has', 'point_count']],
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
  // 'minzoom': 18// Already defined in ./vehicle-clusters.js
}
