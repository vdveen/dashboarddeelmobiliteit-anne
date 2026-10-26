// Settings of the Drukte view of the Aanbod map (helpers/rideEndPeaks.ts).
// Persisted in localStorage, so read them through selectDrukteSettings.

// Period before the Aanbod date, in hours
export const DRUKTE_PERIODES = [
  { uren: 1, label: '1u' },
  { uren: 4, label: '4u' },
  { uren: 8, label: '8u' },
  { uren: 24, label: '24u' },
  { uren: 72, label: '3d' },
  { uren: 168, label: '7d' },
  { uren: 336, label: '14d' },
  { uren: 720, label: '30d' }
];
export const DRUKTE_EENHEDEN = ['hubs', 'plekken', 'buiten'];
export const DRUKTE_MAATSTAVEN = ['ritten', 'piekuur', 'uren_druk', 'boven_normaal', 'netto', 'max_voertuigen', 'tijd_te_vol'];
export const DRUKTE_MINIMAAL = [1, 5, 10, 20, 50];
export const DRUKTE_STRALEN = [20, 50];
// Trip ends in one hour. Per 50 m and hour, Voi in Amersfoort had at most
// 2 ends in 90% and at most 4 in 99% of the hours with any (19-25 Oct 2026).
export const DRUKTE_DRUK_PER_UUR = [2, 3, 5, 10];
// A hub is too full with more than this many parked Voi vehicles. In the
// week of 19 October 2026 the ten fullest Amersfoort hubs peaked at 9 to 16.
export const DRUKTE_TE_VOL = [5, 10, 15, 20];

const initialState = {
  periode: 24,
  eenheid: 'plekken',
  maatstaf: 'piekuur',
  minimaal: 5,
  straal: 20,
  druk_per_uur: 3,
  te_vol: 10,
  // Id of the spot selected in the list or on the map
  selected: null
};

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const selectDrukteSettings = (state) => {
  const s = state.drukte || {};
  return {
    periode: pick(s.periode, DRUKTE_PERIODES.map((p) => p.uren), initialState.periode),
    eenheid: pick(s.eenheid, DRUKTE_EENHEDEN, initialState.eenheid),
    maatstaf: pick(s.maatstaf, DRUKTE_MAATSTAVEN, initialState.maatstaf),
    minimaal: pick(s.minimaal, DRUKTE_MINIMAAL, initialState.minimaal),
    straal: pick(s.straal, DRUKTE_STRALEN, initialState.straal),
    druk_per_uur: pick(s.druk_per_uur, DRUKTE_DRUK_PER_UUR, initialState.druk_per_uur),
    te_vol: pick(s.te_vol, DRUKTE_TE_VOL, initialState.te_vol),
    selected: s.selected || null
  };
};

export default function drukte(state = initialState, action) {
  switch (action.type) {
    case 'SET_DRUKTE_SETTING':
      return { ...state, ...action.payload, selected: 'selected' in action.payload ? action.payload.selected : null };
    case 'SET_DRUKTE_SELECTED':
      return { ...state, selected: action.payload };
    default:
      return state;
  }
}
