import './css/Filterbar.css';
import { Link } from "react-router-dom";
import {useSelector} from 'react-redux';
import moment from 'moment';
// import * as R from 'ramda';
import FilteritemGebieden from './FilteritemGebieden.jsx';
import FilteritemDatum from './FilteritemDatum.jsx';
import FilteritemDatumVanTot from './FilteritemDatumVanTot.jsx';
import FilteritemDuur from './FilteritemDuur.jsx';
import FilteritemAanbieders from './FilteritemAanbieders';
import FilteritemZones from './FilteritemZones.jsx';
import {
  FilteritemMarkersAfstand,
  FilteritemMarkersParkeerduur
} from './FilteritemMarkers.jsx';
import FilteritemHerkomstBestemming from './FilteritemHerkomstBestemming';
import FilteritemVoertuigTypes from './FilteritemVoertuigTypes';
import FilteritemRuweDataImport from './FilteritemRuweDataImport';
import LogoDashboardDeelmobiliteit from '../Logo/LogoDashboardDeelmobiliteit';

import Fieldset from '../Fieldset/Fieldset';

import {StateType} from '../../types/StateType';

// Import API functions
import {postZone} from '../../api/zones';

import {
  DISPLAYMODE_PARK,
  DISPLAYMODE_RENTALS,
  DISPLAYMODE_ZONES_ADMIN,
  DISPLAYMODE_ZONES_PUBLIC,
  DISPLAYMODE_OTHER
} from '../../reducers/layers.js';

// CSV points are a separate dataset: the API filters do not apply to them.
// Keep the filters on screen so their state stays visible, but make them inert.
const InertDuringImport = ({ inert, children }) =>
  inert ? <div className="Filterbar-inertDuringImport">{children}</div> : <>{children}</>;

function Filterbar({
  displayMode,
  visible,
  hideLogo
}) {

  const isLoggedIn = useSelector((state: StateType) => {
    return state.authentication.user_data ? true : false;
  });

  const hasImport = useSelector(state => !!state.rentals?.csv_data);
  const filter = useSelector((state: StateType) => {
    return state.filter;
  });

  const filterDatum = useSelector((state: StateType) => {
    return state.filter && state.filter.datum ? state.filter.datum : new Date().toISOString();
  });

  const ispark=displayMode===DISPLAYMODE_PARK;
  const isrentals=displayMode===DISPLAYMODE_RENTALS;
  const iszonesadmin=displayMode===DISPLAYMODE_ZONES_ADMIN;
  const iszonespublic=displayMode===DISPLAYMODE_ZONES_PUBLIC;
  const isontwikkeling=displayMode===DISPLAYMODE_OTHER;
  
  const showdatum=isrentals||ispark||!isLoggedIn;
  const showduur=isrentals;
  const showparkeerduur=ispark;
  const showafstand=isrentals;
  const showherkomstbestemming=isrentals;
  const showvantot=isontwikkeling;
  const showvervoerstype=isrentals||ispark||!isLoggedIn;

  // Show custom zones if >= 2022-11
  // We have detailled aggregated stats from 2022-11
  const doShowCustomZones =
    moment(filter.ontwikkelingvan).unix() >= moment('2022-11-01 00:00').unix();

  let zonesToShow;
  if(isontwikkeling) {
    zonesToShow = [
      'residential_area',
    ];
    if(doShowCustomZones) {
      zonesToShow.push('custom')
    }
  } else {
    zonesToShow = [
      'residential_area',
      'custom',
      'neighborhood'
    ];
  }

  return (
    <div className="filter-bar-inner">
      <div className="justify-between hidden sm:flex" style={{
        paddingBottom: '48px'
      }}>
        <div style={{minWidth: '82px'}}>
          {! hideLogo && (
            ispark
              ? <LogoDashboardDeelmobiliteit  />
              : <Link to="/"><LogoDashboardDeelmobiliteit /></Link>
          )}
        </div>
        <div className="ml-4 text-sm flex justify-center flex-col" style={{
          color: '#FD862E'
        }}>
          {/* INFO */}
        </div>
      </div>

      {isrentals && (
        <Fieldset title="Ruwe data import">
          <FilteritemRuweDataImport />
        </Fieldset>
      )}

      {hasImport && (
        <div className="Filterbar-importNote">
          Deze filters gelden niet voor ge&iuml;mporteerde CSV-punten.
        </div>
      )}

      <InertDuringImport inert={hasImport}>
        { isLoggedIn && showdatum && <FilteritemDatum /> }

        { ! isLoggedIn && showdatum && <div>
          <div className="filter-datum-container">
            <div className="filter-datum-title">
              Tijd
            </div>
            <div className="filter-datum-box-row">
              {moment(filterDatum).format('HH:mm')}
            </div>
          </div>
        </div> }

        { isLoggedIn && showduur && <FilteritemDuur /> }
      </InertDuringImport>

      { isLoggedIn && showvantot && <FilteritemDatumVanTot /> }

      <InertDuringImport inert={hasImport}>
        <Fieldset title="Plaats">
          <FilteritemGebieden includeRegions />
        </Fieldset>

        <Fieldset title="Zones">
          <FilteritemZones 
            zonesToShow={zonesToShow}
          />
        </Fieldset>
      </InertDuringImport>

      {isLoggedIn && showparkeerduur && <FilteritemMarkersParkeerduur />}

      <InertDuringImport inert={hasImport}>
        {isLoggedIn && showafstand && (
          <Fieldset title="Afstand">
            <FilteritemMarkersAfstand />
          </Fieldset>
        )}

        {isLoggedIn && showherkomstbestemming && (
          <Fieldset title="Herkomst of bestemming?">
            <FilteritemHerkomstBestemming />
          </Fieldset>
        )}
      </InertDuringImport>

      {showvervoerstype && (
        <Fieldset title="Voertuigtype">
          <FilteritemVoertuigTypes />
        </Fieldset>
      )}

      {<FilteritemAanbieders />}

    </div>
  )
}

export default Filterbar;
