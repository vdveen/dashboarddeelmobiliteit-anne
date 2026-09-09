import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMunicipalityCodes, getRegion } from '../helpers/regions';

const regionPaths = ['/', '/map/park', '/map/rentals', '/stats/beleidsinfo'];

const getSharedState = (search) => {
  try {
    const view = new URLSearchParams(search).get('view');
    return view ? JSON.parse(decodeURIComponent(view)) : null;
  } catch {
    return null;
  }
};

// Other dashboards and zone editors require a single municipality. Clear a
// region before mounting those pages so they never send a list to a single-code API.
export default function RegionRouteGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const selection = useSelector(state => state.filter.gebied);
  const importedLocation = useRef(null);
  const urlSelection = new URLSearchParams(location.search).get('gm_code');
  const sharedSelection = getSharedState(location.search)?.filter?.gebied;
  const mustClear = !regionPaths.includes(location.pathname) &&
    [selection, urlSelection, sharedSelection].some(value => getMunicipalityCodes(value).length > 1);
  const mustImport = !mustClear && importedLocation.current !== location &&
    getRegion(urlSelection) && selection !== urlSelection;

  useEffect(() => {
    importedLocation.current = location;
    if (mustImport) {
      dispatch({ type: 'SET_FILTER_GEBIED', payload: urlSelection, meta: { explicit: true } });
    }
  }, [location, mustImport, urlSelection, dispatch]);

  useEffect(() => {
    if (!mustClear) return;
    dispatch({ type: 'SET_FILTER_GEBIED', payload: '' });
    const params = new URLSearchParams(location.search);
    params.delete('gm_code');
    params.delete('zones');
    const sharedState = getSharedState(location.search);
    if (getMunicipalityCodes(sharedState?.filter?.gebied).length > 1) {
      sharedState.filter = { ...sharedState.filter, gebied: '', zones: '' };
      params.set('view', encodeURIComponent(JSON.stringify(sharedState)));
    }
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [mustClear, dispatch, navigate, location]);

  return mustClear || mustImport ? null : children;
}
