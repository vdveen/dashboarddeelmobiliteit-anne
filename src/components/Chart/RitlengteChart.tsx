import React, {useEffect, useMemo, useState} from 'react';

import {StateType} from '../../types/StateType';

import {
  useSelector
} from 'react-redux';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

import {
  getTripsWithDistance
} from '../../api/trips';
import {
  getProviderColor,
  getPrettyProviderName
} from '../../helpers/providers.js';

import {CustomizedXAxisTick, CustomizedYAxisTick} from '../Chart/CustomizedAxisTick.jsx';
import {CustomizedTooltip} from '../Chart/CustomizedTooltip.jsx';
import InfoTooltip from '../InfoTooltip/InfoTooltip';
import ChartSkeleton from './ChartSkeleton';

// Trips longer than this many km all land in one open-ended last bin
// ('20+'), so a few long outliers don't stretch the X axis.
const MAX_BIN_KM = 20;

function RitlengteChart(props) {
  const token = useSelector((state: StateType) => (state.authentication.user_data && state.authentication.user_data.token)||null)
  const filter = useSelector((state: StateType) => state.filter)
  const metadata = useSelector((state: StateType) => state.metadata)

  const aanbieders = useSelector((state: StateType) => {
    return (state.metadata && state.metadata.aanbieders) ? state.metadata.aanbieders : [];
  });

  const [trips, setTrips] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  // See BeschikbareVoertuigenChart for the rationale behind the
  // metadata sub-reference deps (avoids duplicate refetches when metadata
  // gets a new top-level reference but the relevant slices did not change).
  //
  // filter.aanbiedersexclude is intentionally not a dependency: operator
  // filtering happens client-side on the fetched trip list, so toggling an
  // aanbieder does not refetch the (potentially large) trips response.
  useEffect(() => {
    // Do not reload chart until you have 'zones'
    if(! metadata || ! metadata.zones || metadata.zones.length <= 0) {
      setTrips([]);
      setIsLoading(false);
      return;
    }
    // If a plaats is selected but metadata.zones still belongs to a previous
    // plaats, skip the fetch (see BeschikbareVoertuigenChart for rationale).
    if(filter.gebied && !metadata.zones.some((z: any) => z.municipality === filter.gebied)) {
      setTrips([]);
      setIsLoading(false);
      return;
    }
    let didCancel = false;
    async function fetchData() {
      try {
        const responseJson = await getTripsWithDistance(token, filter, metadata);
        if(didCancel) return;
        setTrips((responseJson && responseJson.trip_origins) ? responseJson.trip_origins : []);
      } finally {
        if(! didCancel) setIsLoading(false);
      }
    }
    setIsLoading(true);
    fetchData();
    return () => { didCancel = true; };
  }, [
    filter.ontwikkelingvan,
    filter.ontwikkelingtot,
    filter.gebied,
    filter.zones,
    filter.voertuigtypesexclude,
    metadata.aanbieders,
    metadata.aclOperators,
    metadata.zones,
    metadata.gebieden,
    metadata.vehicle_types,
    token
  ]);

  // Bin trips into 1 km wide distance bins, counted per aanbieder
  const {chartData, providerKeys} = useMemo(() => {
    const aanbiedersexclude = (filter.aanbiedersexclude || '').split(',');

    const counts = {};
    const providers = new Set<string>();
    trips.forEach((trip: any) => {
      const distance = trip.distance_in_meters;
      if(typeof distance !== 'number' || distance < 0) return;
      if(aanbiedersexclude.includes(trip.system_id)) return;
      const bin = Math.min(Math.floor(distance / 1000), MAX_BIN_KM);
      if(! counts[bin]) counts[bin] = {};
      counts[bin][trip.system_id] = (counts[bin][trip.system_id] || 0) + 1;
      providers.add(trip.system_id);
    });

    // Drop trailing empty bins, so short-trip data isn't squeezed next to a
    // long empty tail (the open-ended last bin is only shown when used)
    let lastUsedBin = 0;
    Object.keys(counts).forEach(bin => {
      lastUsedBin = Math.max(lastUsedBin, Number(bin));
    });

    const rows = [];
    for(let i = 0; i <= lastUsedBin; i++) {
      rows.push({
        name: i === MAX_BIN_KM ? `${MAX_BIN_KM}+` : `${i}-${i+1}`,
        ...(counts[i] || {})
      });
    }
    return {chartData: rows, providerKeys: Array.from(providers).sort()};
  }, [trips, filter.aanbiedersexclude]);

  const hasData = providerKeys.length > 0;

  const renderChart = () => (
    <BarChart
      data={chartData}
      margin={{
        top: 10,
        right: 30,
        left: 0,
        bottom: 10,
      }}
    >
      <CartesianGrid strokeDasharray="3 0" vertical={false} />
      <XAxis
        dataKey="name"
        tick={<CustomizedXAxisTick />}
        label={{ value: 'ritlengte (km)', position: 'insideBottom', offset: -8, fill: '#666', fontSize: '0.8em' }}
      />
      <YAxis tick={<CustomizedYAxisTick />} />
      <Tooltip content={<CustomizedTooltip />} contentStyle={{ color: '#333333' }} />
      <Legend verticalAlign="top" />
      {providerKeys.map(x => (
        <Bar
          key={x}
          dataKey={x}
          name={getPrettyProviderName(x)}
          stackId="ritlengte"
          fill={getProviderColor(aanbieders, x)}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );

  return (
    <div className="relative">

      <div className="flex justify-between my-2">
        <div className="flex flex-start">

          {props.title && <h2 className="text-4xl my-2">
            {props.title}
          </h2>}

          <div className="flex justify-center flex-col ml-2">
            <InfoTooltip className="mx-2 inline-block">
              Verdeling van de afgelegde afstand per verhuring binnen de huidige selectie, in stappen van 1 km. Ritten langer dan {MAX_BIN_KM} km vallen in de laatste staaf.
            </InfoTooltip>
          </div>

        </div>
      </div>

      <div className="relative" style={{ width: '100%', height: '400px' }}>
        {isLoading && ! hasData ? (
          <ChartSkeleton height="100%" />
        ) : ! hasData ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            Geen ritten met afstandsgegevens gevonden voor de huidige selectie
          </div>
        ) : (
          <ResponsiveContainer>
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default RitlengteChart;
