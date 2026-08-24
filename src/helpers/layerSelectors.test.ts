import { getAllowedOverlayPhase } from './layerSelectors';

describe('getAllowedOverlayPhase', () => {
  it('forces active data for guests', () => {
    expect(getAllowedOverlayPhase('concept', false)).toBe('active');
    expect(getAllowedOverlayPhase('committed_concept', false)).toBe('active');
    expect(getAllowedOverlayPhase('published', false)).toBe('active');
  });

  it('keeps the selected phase for logged-in users', () => {
    expect(getAllowedOverlayPhase('concept', true)).toBe('concept');
    expect(getAllowedOverlayPhase('active', true)).toBe('active');
  });
});
