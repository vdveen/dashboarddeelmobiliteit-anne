import React, {useEffect, useRef, useState} from 'react';

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
  ReferenceArea,
  ReferenceLine,
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
import {ChartEmptyState, ChartErrorState, ChartRefreshingOverlay} from './ChartStates';
import {useAggregatedChartData} from './useAggregatedChartData';
import {useLegendToggle} from './useLegendToggle';
import {
  CHART_SYNC_ID,
  TOTAAL_KEY,
  TOTAAL_STROKE,
  TOTAAL_DASH,
  PREVIOUS_TOTAAL_KEY,
  PREVIOUS_TOTAAL_STROKE,
  PREVIOUS_TOTAAL_DASH,
  CAPACITY_KEY,
  CAPACITY_STROKE,
  CAPACITY_DASH,
  CAPACITY_FILL_OPACITY
} from './chartConstants';
import {mergePreviousPeriodTotals} from './previousPeriod';
import {getWeekendRanges, renderWeekendShading} from './WeekendShading';
import {getPreviousPeriodFilter} from '../../helpers/stats/kpi';
import {
  DailyTimestamp,
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

/** Fetches the same data for the previous period of equal length */
const getPreviousPeriodVehicleData = (token, filter, zones, metadata, organisationType) =>
  getAggregatedVehicleData(token, getPreviousPeriodFilter(filter), zones, metadata, organisationType);

function BeschikbareVoertuigenChart({
  filter,
  config,
  title,
  compareWithPreviousPeriod = false,
  capacity
}: {
  filter: any,
  config: any,
  title?: string,
  /** Show the total of the previous period as a ghost line */
  compareWithPreviousPeriod?: boolean,
  /** Maximum capacity of the selected hub, shown as a horizontal line */
  capacity?: number
}) {
  const dispatch = useDispatch()

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

  // Load the aggregated vehicle data for the current filter. The hook handles
  // waiting for zones, stale responses, and loading/error state.
  const {
    data: vehiclesData,
    isLoading,
    isRefreshing,
    error,
    refetch
  } = useAggregatedChartData<any>(
    getAggregatedVehicleData,
    (aggregatedVehicleData) => {
      // Sum amount of vehicles per operator, used in FilteritemAanbieders component
      let operators;
      if(aggregatedVehicleData.available_vehicles_aggregated_stats) {
        operators = getOperatorStatsForChart(aggregatedVehicleData.available_vehicles_aggregated_stats.values, metadata.aanbieders);
      }
      else {
        operators = getOperatorStatsForChart(aggregatedVehicleData.availability_stats.values, metadata.aanbieders);
      }
      dispatch({type: 'SET_OPERATORSTATS_BESCHIKBAREVOERTUIGENCHART', payload: operators });
    }
  );

  // Non-defect vehicle counts per day, fetched after the main data has loaded
  const [operationalVehiclesByDay, setOperationalVehiclesByDay] = useState<OperationalVehicleCountsByDay>({})
  // Days whose non-defect count could not be fetched, kept so the notice can
  // retry exactly those days instead of reloading the whole chart.
  const [failedOperationalDays, setFailedOperationalDays] = useState<DailyTimestamp[]>([])
  const [isRetryingOperationalDays, setIsRetryingOperationalDays] = useState(false)

  const retryControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => retryControllerRef.current?.abort(), []);

  // The hook drops stale responses, so a new `vehiclesData` always belongs to
  // the current filter. Only day-level data gets the non-defect series.
  useEffect(() => {
    setOperationalVehiclesByDay({});
    setFailedOperationalDays([]);
    if (!vehiclesData || filter.ontwikkelingaggregatie !== 'day') return;

    let cancelled = false;
    const controller = new AbortController();
    const dailyTimestamps = getDailyTimestamps(
      getAggregatedChartData(vehiclesData, filter, zones, aanbieders),
      filter.ontwikkelingaggregatie_tijd
    );
    (async () => {
      try {
        const {counts, failedDays} = await getOperationalVehicleCountsByDay(
          token, filter, metadata, organisationType, dailyTimestamps, controller.signal
        );
        if (cancelled) return;
        setOperationalVehiclesByDay(counts);
        setFailedOperationalDays(
          dailyTimestamps.filter(({day}) => failedDays.includes(day))
        );
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          console.error('Unable to load non-defect vehicle counts', error);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclesData, filter.ontwikkelingaggregatie_tijd]);

  const retryFailedOperationalDays = async () => {
    if (failedOperationalDays.length === 0 || isRetryingOperationalDays) return;
    retryControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;
    setIsRetryingOperationalDays(true);
    try {
      const {counts, failedDays} = await getOperationalVehicleCountsByDay(
        token, filter, metadata, organisationType, failedOperationalDays, controller.signal
      );
      setOperationalVehiclesByDay(current => ({...current, ...counts}));
      setFailedOperationalDays(current => current.filter(({day}) => failedDays.includes(day)));
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Unable to reload non-defect vehicle counts', error);
      }
    } finally {
      if (!controller.signal.aborted) setIsRetryingOperationalDays(false);
    }
  };

  // Optional: the previous period, only fetched when comparing
  const {data: previousVehiclesData} = useAggregatedChartData<any>(
    getPreviousPeriodVehicleData,
    undefined,
    {enabled: compareWithPreviousPeriod}
  );

  // Clickable legend: hide/show individual providers
  const legend = useLegendToggle();

  // Populate chart data
  let chartData = getAggregatedChartData(vehiclesData || [], filter, zones, aanbieders);
  chartData = addOperationalCountsToChartData(chartData, operationalVehiclesByDay);
  const previousChartData = compareWithPreviousPeriod && previousVehiclesData
    ? getAggregatedChartData(previousVehiclesData, getPreviousPeriodFilter(filter), zones, aanbieders)
    : null;

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
  const chartDataWithNiceDatesRaw = mergePreviousPeriodTotals(
    getChartDataWithNiceDates(chartData),
    previousChartData
  );
  const valueKeys = chartDataWithNiceDatesRaw?.[0]
    ? Object.keys(chartDataWithNiceDatesRaw[0]).filter((k) => k !== 'time' && k !== 'name')
    : [];
  const chartDataWithoutCapacity = transformZerosToNullForChart(chartDataWithNiceDatesRaw, valueKeys);
  const chartDataWithNiceDates = capacity
    ? chartDataWithoutCapacity.map((row) => ({ ...row, [CAPACITY_KEY]: capacity }))
    : chartDataWithoutCapacity;

  // Weekend bands, based on the original timestamps (before date formatting)
  const weekendRanges = getWeekendRanges(chartData, filter.ontwikkelingaggregatie);

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
    const providerKeys = allKeys.filter(k =>
      k !== 'time' && k !== 'name' && k !== PREVIOUS_TOTAAL_KEY && k !== CAPACITY_KEY
    );
    const totaalIndex = providerKeys.indexOf(TOTAAL_KEY);
    const providersOnly = providerKeys.filter(k =>
      k !== TOTAAL_KEY && !k.endsWith(NOT_DEFECT_KEY_SUFFIX)
    );
    const hasPrevious = allKeys.indexOf(PREVIOUS_TOTAAL_KEY) >= 0;
    return { providersOnly, hasTotaal: totaalIndex >= 0, hasPrevious };
  };

  const renderLineSeries = () => {
    const { providersOnly, hasTotaal, hasPrevious } = getSeriesKeys();
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
          hide={legend.isHidden(x)}
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
            hide={legend.isHidden(notDefectKey)}
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
          stroke={TOTAAL_STROKE}
          strokeWidth={2}
          strokeDasharray={TOTAAL_DASH}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
          connectNulls
          hide={legend.isHidden(TOTAAL_KEY)}
        />
      );
    }
    // Ghost line of the previous period, last so it is last in the legend too
    if (hasPrevious) {
      series.push(
        <Line
          key={PREVIOUS_TOTAAL_KEY}
          type="monotone"
          dataKey={PREVIOUS_TOTAAL_KEY}
          name={PREVIOUS_TOTAAL_KEY}
          stroke={PREVIOUS_TOTAAL_STROKE}
          strokeWidth={2}
          strokeDasharray={PREVIOUS_TOTAAL_DASH}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
          connectNulls
          hide={legend.isHidden(PREVIOUS_TOTAAL_KEY)}
        />
      );
    }
    if (capacity) {
      series.push(
        <Line
          key={CAPACITY_KEY}
          type="linear"
          dataKey={CAPACITY_KEY}
          name={CAPACITY_KEY}
          stroke={CAPACITY_STROKE}
          strokeWidth={2}
          strokeDasharray={CAPACITY_DASH}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          hide={legend.isHidden(CAPACITY_KEY)}
        />
      );
    }
    return series;
  };

  const showCapacity = Boolean(capacity) && !legend.isHidden(CAPACITY_KEY);

  const renderChart = () => (
    <LineChart
      data={chartDataWithNiceDates}
      syncId={CHART_SYNC_ID}
      margin={{
        top: 10,
        right: 30,
        left: 0,
        bottom: 0,
      }}
    >
      {renderWeekendShading(weekendRanges)}
      <CartesianGrid strokeDasharray="3 0" vertical={false} />
      <XAxis dataKey="time" tick={<CustomizedXAxisTick />} />
      <YAxis
        tick={<CustomizedYAxisTick />}
        domain={showCapacity ? [0, (dataMax: number) => Math.ceil(dataMax * 1.15)] : undefined}
        allowDecimals={false}
      />
      {showCapacity && (
        <ReferenceArea
          y1={capacity}
          fill={CAPACITY_STROKE}
          fillOpacity={CAPACITY_FILL_OPACITY}
          stroke="none"
          ifOverflow="hidden"
        />
      )}
      {showCapacity && (
        <ReferenceLine
          y={capacity}
          stroke="none"
          label={{
            value: `huidige capaciteit: ${capacity}`,
            position: 'insideBottomLeft',
            fill: CAPACITY_STROKE,
            fontSize: 12
          }}
        />
      )}
      <Tooltip content={<CustomizedTooltip showAutomaticTotal={false} />} contentStyle={{ color: '#333333' }} />
      {config?.sumTotal !== true && <Legend {...legend.legendProps} />}
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
              const filename = `${moment(filter.ontwikkelingvan).format('YYYY-MM-DD')}_to_${moment(filter.ontwikkelingtot).format('YYYY-MM-DD')}_beschikbare_voertuigen`;
              downloadCsv(preparedData, filename);
            }} className="opacity-50 cursor-pointer">
              <img src="/components/StatsPage/icon-download-to-csv.svg" width="30" alt="Download to CSV" title="Download to CSV" />
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

      {failedOperationalDays.length > 0 && (
        <div role="status" className="text-sm text-gray-600 my-1">
          Niet-defect telling ontbreekt voor {failedOperationalDays.length}{' '}
          {failedOperationalDays.length === 1 ? 'dag' : 'dagen'}.{' '}
          <button
            type="button"
            className="underline"
            disabled={isRetryingOperationalDays}
            onClick={retryFailedOperationalDays}
          >
            {isRetryingOperationalDays ? 'Bezig…' : 'Opnieuw'}
          </button>
        </div>
      )}

      <div className="relative" style={{ width: '100%', height: config?.height || '400px' }}>
        {isLoading ? (
          <ChartSkeleton height="100%" />
        ) : error ? (
          <ChartErrorState onRetry={refetch} />
        ) : !chartData || chartData.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <>
            {isRefreshing && <ChartRefreshingOverlay />}
            <ResponsiveContainer>
              {renderChart()}
            </ResponsiveContainer>
          </>
        )}
      </div>

    </div>
  )
}

export default BeschikbareVoertuigenChart;
