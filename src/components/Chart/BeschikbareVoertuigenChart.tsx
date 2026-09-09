import { hasAreaZones } from '../../helpers/regions';
import React, {useEffect, useState } from 'react';

import { getOperatorStatsForChart, transformZerosToNullForChart } from './chartTools.js';

import {StateType} from '../../types/StateType.js';

import {
  useDispatch,
  useSelector
} from 'react-redux';

import moment from 'moment';

import {
  LineChart,
  Line,
  XAxis,
  Legend,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

import {
  getProviderColor,
  getPrettyProviderName,
  getUniqueProviderNames
} from '../../helpers/providers.js';
import {
  prepareAggregatedStatsData,
  prepareAggregatedStatsData_timescaleDB,
  sumAggregatedStats,
  doShowDetailledAggregatedData,
  didSelectAtLeastOneCustomZone,
  aggregationFunctionButtonsToRender,
  getDateFormat,
  prepareDataForCsv,
  downloadCsv,
  getAggregatedVehicleData,
  getAggregatedChartData
} from '../../helpers/stats/index';

import {CustomizedXAxisTick, CustomizedYAxisTick} from './CustomizedAxisTick.jsx';
import {CustomizedTooltip} from './CustomizedTooltip.jsx';
import InfoTooltip from '../InfoTooltip/InfoTooltip';
import ChartSkeleton from './ChartSkeleton';
import {
  OperationalVehicleCountsByDay,
  getOperationalVehicleCountsByDay
} from '../../api/operationalVehicleStats';
import {
  NOT_DEFECT_KEY_SUFFIX,
  addOperationalCountsToChartData,
  darkenHexColor,
  getDailyTimestamps,
  getNotDefectSeriesKey
} from './availableVehiclesChartUtils';
import { getAclOrganisationType } from '../../helpers/authentication';

const TOTAAL_KEY = 'Totaal';

function BeschikbareVoertuigenChart({
  filter,
  config,
  title
}: {
  filter: any,
  config: any,
  title?: string
}) {
  const dispatch = useDispatch()
  
  // Get authentication token
  const token = useSelector((state: StateType) => (state.authentication.user_data && state.authentication.user_data.token)||null)
  const organisationType = useSelector((state: StateType) =>
    getAclOrganisationType(state.authentication?.user_data?.acl)
  );

  // Get metadata
  const metadata = useSelector((state: StateType) => state.metadata)
  
  const aanbieders = useSelector((state: StateType) => {
    return (state.metadata && state.metadata.aanbieders) ? state.metadata.aanbieders : [];
  });
  
  // Get all zones
  const zones = useSelector((state: StateType) => {
    return (state.metadata && state.metadata.zones) ? state.metadata.zones : [];
  });

  // Define state variables
  const [vehiclesData, setVehiclesData] = useState([])
  const [operationalVehiclesByDay, setOperationalVehiclesByDay] = useState<OperationalVehicleCountsByDay>({})
  const [isLoading, setIsLoading] = useState(false)

  // On updated filter: re-fetch data
  //
  // NOTE: we intentionally depend on individual metadata sub-references
  // (`metadata.aanbieders`, `metadata.zones`, etc.) instead of the whole
  // `metadata` object. The metadata reducer creates a new top-level reference
  // on every dispatch, even when nothing relevant to this chart changed,
  // which used to cause duplicate refetches. The sub-references are kept
  // stable by md5-guarded reducer cases.
  useEffect(() => {
    let cancelled = false;
    const operationalVehiclesController = new AbortController();

    // Do not reload chart until you have 'zones'
    if(! metadata || ! metadata.zones || metadata.zones.length <= 0) {
      setVehiclesData([]);
      setOperationalVehiclesByDay({});
      setIsLoading(false);
      return () => operationalVehiclesController.abort();
    }
    // If a plaats is selected but metadata.zones still belongs to a previous
    // plaats (i.e. no zone for the current gebied has loaded yet), skip the
    // fetch. Otherwise we would request without a valid zone filter and the
    // API returns NL-wide data.
    if(filter.gebied && !hasAreaZones(filter.gebied, metadata.zones)) {
      setVehiclesData([]);
      setOperationalVehiclesByDay({});
      setIsLoading(false);
      return () => operationalVehiclesController.abort();
    }

    async function fetchData() {
      try {
        // Get aggregated vehicle data
        const aggregatedVehicleData = await getAggregatedVehicleData(
          token, filter, zones, metadata, organisationType
        );
        if(! aggregatedVehicleData || cancelled) return;

        // Set state
        setVehiclesData(aggregatedVehicleData);
        setOperationalVehiclesByDay({});

        // Sum amount of vehicles per operator, used in FilteritemAanbieders component
        let operators;
        if(aggregatedVehicleData && aggregatedVehicleData.available_vehicles_aggregated_stats) {
          operators = getOperatorStatsForChart(aggregatedVehicleData.available_vehicles_aggregated_stats.values, metadata.aanbieders);
        }
        else {
          operators = getOperatorStatsForChart(aggregatedVehicleData.availability_stats.values, metadata.aanbieders);
        }
        dispatch({type: 'SET_OPERATORSTATS_BESCHIKBAREVOERTUIGENCHART', payload: operators });
        if (filter.ontwikkelingaggregatie === 'day') {
          const aggregatedChartData = getAggregatedChartData(aggregatedVehicleData, filter, zones, aanbieders);
          const dailyTimestamps = getDailyTimestamps(
            aggregatedChartData,
            filter.ontwikkelingaggregatie_tijd
          );
          const operationalCounts = await getOperationalVehicleCountsByDay(
            token,
            filter,
            metadata,
            organisationType,
            dailyTimestamps,
            operationalVehiclesController.signal
          );
          if (!cancelled) {
            setOperationalVehiclesByDay(operationalCounts);
          }
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Unable to load available vehicle chart data', error);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    setIsLoading(true);
    fetchData();
    return () => {
      cancelled = true;
      operationalVehiclesController.abort();
    };
  }, [
    filter.ontwikkelingvan,
    filter.ontwikkelingtot,
    filter.ontwikkelingaggregatie,
    filter.ontwikkelingaggregatie_tijd,
    filter.ontwikkelingaggregatie_function,
    filter.gebied,
    filter.zones,
    filter.aanbiedersexclude,
    metadata.aanbieders,
    metadata.aclOperators,
    metadata.zones,
    metadata.gebieden,
    metadata.vehicle_types,
    token,
    organisationType,
    dispatch
  ]);
  
  // Populate chart data
  let chartData = getAggregatedChartData(vehiclesData, filter, zones, aanbieders);
  chartData = addOperationalCountsToChartData(chartData, operationalVehiclesByDay);

  const getChartDataWithNiceDates = (data) => {
    if (!data?.length) return [];
    const aggregationLevel = filter.ontwikkelingaggregatie;
    const dateFormat = getDateFormat(aggregationLevel);
    const providerKeys = Object.keys(data[0]).filter(k =>
      k !== 'time' && k !== 'name' && !k.endsWith(NOT_DEFECT_KEY_SUFFIX)
    );
    const showTotaal = providerKeys.length > 1;
    return data.map(x => {
      const timeFormatted = moment(x.time ? x.time : x.name).format(dateFormat);
      const row = { ...x, time: timeFormatted };
      if (showTotaal) {
        const totaal = providerKeys.reduce((sum, k) => sum + (Number(x[k]) || 0), 0);
        row[TOTAAL_KEY] = totaal;
      }
      return row;
    });
  };
  const chartDataWithNiceDatesRaw = getChartDataWithNiceDates(chartData);
  const valueKeys = chartDataWithNiceDatesRaw?.[0]
    ? Object.keys(chartDataWithNiceDatesRaw[0]).filter((k) => k !== 'time' && k !== 'name')
    : [];
  const chartDataWithNiceDates = transformZerosToNullForChart(chartDataWithNiceDatesRaw, valueKeys);

  const setAggregationFunction = (value) => {
    dispatch({
      type: 'SET_FILTER_ONTWIKKELING_AGGREGATIE_FUNCTION',
      payload: value
    })
  }

  const renderAggregationFunctionButton = (name, title) => {
    return (
      <div key={`agg-level-`+name} className={"agg-button " + (filter.ontwikkelingaggregatie_function === name ? " agg-button-active":"")} onClick={() => { setAggregationFunction(name) }}>
        {title}
      </div>
    )
  }

  const getSeriesKeys = () => {
    const allKeys = getUniqueProviderNames(chartDataWithNiceDates);
    const providerKeys = allKeys.filter(k => k !== 'time' && k !== 'name');
    const totaalIndex = providerKeys.indexOf(TOTAAL_KEY);
    const providersOnly = providerKeys.filter(k =>
      k !== TOTAAL_KEY && !k.endsWith(NOT_DEFECT_KEY_SUFFIX)
    );
    return { providersOnly, hasTotaal: totaalIndex >= 0 };
  };

  const renderLineSeries = () => {
    const { providersOnly, hasTotaal } = getSeriesKeys();
    const series: React.ReactNode[] = [];
    providersOnly.forEach(x => {
      const providerColor = getProviderColor(metadata.aanbieders, x);
      series.push(
        <Line
          key={x}
          type="monotone"
          dataKey={x}
          name={getPrettyProviderName(x)}
          stroke={providerColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      );
      const notDefectKey = getNotDefectSeriesKey(x);
      if (chartDataWithNiceDates.some((row) => row[notDefectKey] !== undefined)) {
        series.push(
          <Line
            key={notDefectKey}
            type="monotone"
            dataKey={notDefectKey}
            name={`${getPrettyProviderName(x)} (niet defect)`}
            stroke={darkenHexColor(providerColor)}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        );
      }
    });
    if (hasTotaal && providersOnly.length > 1) {
      series.push(
        <Line
          key={TOTAAL_KEY}
          type="monotone"
          dataKey={TOTAAL_KEY}
          name={TOTAAL_KEY}
          stroke="#1a1a1a"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      );
    }
    return series;
  };

  const renderChart = () => (
    <LineChart
      data={chartDataWithNiceDates}
      margin={{
        top: 10,
        right: 30,
        left: 0,
        bottom: 0,
      }}
    >
      <CartesianGrid strokeDasharray="3 0" vertical={false} />
      <XAxis dataKey="time" tick={<CustomizedXAxisTick />} />
      <YAxis tick={<CustomizedYAxisTick />} />
      <Tooltip content={<CustomizedTooltip showAutomaticTotal={false} />} contentStyle={{ color: '#333333' }} />
      {config?.sumTotal !== true && <Legend />}
      {renderLineSeries()}
    </LineChart>
  );

  return (
    <div className="relative">
      
      <div className="flex justify-between my-2">
        <div className="flex flex-start">

          {title && <h2 className="text-4xl my-2">
            {title}
          </h2>}

          {chartData && chartData.length > 0 && <div className="flex justify-center flex-col ml-2">
            <button onClick={() => {
              const preparedData = prepareDataForCsv(chartData);
              const filename = `${moment(filter.ontwikkelingvan).format('YYYY-MM-DD')}_to_${moment(filter.ontwikkelingvan).format('YYYY-MM-DD')}`;
              downloadCsv(preparedData, filename);
            }} className="opacity-50 cursor-pointer">
              <img src="/components/StatsPage/icon-download-to-csv.svg" width="30`" alt="Download to CSV" title="Download to CSV" />
            </button>
          </div>}

        </div>

        {doShowDetailledAggregatedData(filter, zones) && <div className={"text-sm flex flex-col justify-center"}>
          <div className="flex">
            {doShowDetailledAggregatedData(filter, zones) && (
              <InfoTooltip className="mx-2 inline-block">
                {/*Zie in ieder tijdsinterval wat de minimale bezetting was, de gemiddelde bezetting of juist de maximale bezetting.*/}
                Zie in ieder tijdsinterval wat de maximale bezetting was.
              </InfoTooltip>
            )}

            {/* As long as min doesn't count 0 values, only show 'max' */}
            {aggregationFunctionButtonsToRender.map(x => renderAggregationFunctionButton(x.name, x.title))}
          </div>
        </div>}

      </div>

      <div className="relative" style={{ width: '100%', height: config?.height || '400px' }}>
        {isLoading && (!chartData || chartData.length === 0) ? (
          <ChartSkeleton height="100%" />
        ) : (
          <ResponsiveContainer>
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>

    </div>
  )
}

export default BeschikbareVoertuigenChart;
