// Line glyphs on a 24×24 grid with a 2px round stroke, in the style of
// Lucide (bike, car-front, locate-fixed, info, x). Lucide has no moped, so
// that one is drawn here. Circles are written as two arcs so every glyph is a
// list of SVG path strings, usable both inline and as a canvas Path2D.

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const GLYPHS = {
  bike: [
    circle(18.5, 17.5, 3.5),
    circle(5.5, 17.5, 3.5),
    circle(15, 5, 1),
    'M12 17.5V14l-3-3 4-3 2 3h2'
  ],
  moped: [
    circle(5.5, 17.5, 3),
    circle(18.5, 17.5, 3),
    'M13 4h3',
    'M14.5 4l2.6 10.8',
    'M8.5 17.5h7',
    'M2.5 14.5a4 4 0 0 1 4-4h4.5l2.5 7'
  ],
  car: [
    'm21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8',
    'M7 14h.01',
    'M17 14h.01',
    'M5 10h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z',
    'M5 18v2',
    'M19 18v2'
  ],
  all: [
    'M4 4h6v6H4z',
    'M14 4h6v6h-6z',
    'M4 14h6v6H4z',
    'M14 14h6v6h-6z'
  ],
  locate: [
    'M2 12h3', 'M19 12h3', 'M12 2v3', 'M12 19v3',
    circle(12, 12, 7),
    circle(12, 12, 3)
  ],
  info: [circle(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  route: [
    circle(6, 19, 3),
    'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15',
    circle(18, 5, 3)
  ],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6']
} as const;

export type GlyphName = keyof typeof GLYPHS;

export const glyphSvg = (name: GlyphName, size = 20): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  GLYPHS[name].map((d) => `<path d="${d}"/>`).join('') +
  '</svg>';

// Vehicle marker: a disc in the operator colour with a white rim and the
// category glyph, like a pin on iOS Maps. Drawn at twice its display size.
const MARKER_SIZE = 60;
const MARKER_RADIUS = 24;
const GLYPH_SCALE = 1.25;

export const drawVehicleMarker = (glyph: GlyphName, color: string): ImageData | null => {
  const canvas = document.createElement('canvas');
  canvas.width = MARKER_SIZE;
  canvas.height = MARKER_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const centre = MARKER_SIZE / 2;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(centre, centre, MARKER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  const offset = centre - 12 * GLYPH_SCALE;
  ctx.translate(offset, offset);
  ctx.scale(GLYPH_SCALE, GLYPH_SCALE);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  GLYPHS[glyph].forEach((d) => ctx.stroke(new Path2D(d)));

  return ctx.getImageData(0, 0, MARKER_SIZE, MARKER_SIZE);
};
