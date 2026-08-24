export type TripLengthChartRow = {
  name: string;
  [providerKey: string]: string | number | undefined;
};

export type RelativeTripPercentages = {
  lessThan: number;
  equalTo: number;
  greaterThan: number;
};

export type RelativeTripPercentagesByBin = Record<
  string,
  Record<string, RelativeTripPercentages>
>;

export const formatRelativeTripValue = (
  value: number,
  percentages?: RelativeTripPercentages
) => {
  if(! percentages) return value.toString();

  return `${value} (</=/>: ${percentages.lessThan}%, ${percentages.equalTo}%, ${percentages.greaterThan}%)`;
};

const toPercentage = (count: number, total: number) => (
  total === 0 ? 0 : Math.round((count / total) * 100)
);

export const calculateRelativeTripPercentages = (
  rows: TripLengthChartRow[],
  providerKeys: string[]
): RelativeTripPercentagesByBin => {
  const totals: Record<string, number> = {};
  const countsBelow: Record<string, number> = {};

  providerKeys.forEach(providerKey => {
    totals[providerKey] = rows.reduce(
      (sum, row) => sum + (Number(row[providerKey]) || 0),
      0
    );
    countsBelow[providerKey] = 0;
  });

  return rows.reduce((percentagesByBin, row) => {
    percentagesByBin[row.name] = {};

    providerKeys.forEach(providerKey => {
      const equalCount = Number(row[providerKey]) || 0;
      const lessCount = countsBelow[providerKey];
      const greaterCount = totals[providerKey] - lessCount - equalCount;

      percentagesByBin[row.name][providerKey] = {
        lessThan: toPercentage(lessCount, totals[providerKey]),
        equalTo: toPercentage(equalCount, totals[providerKey]),
        greaterThan: toPercentage(greaterCount, totals[providerKey])
      };

      countsBelow[providerKey] += equalCount;
    });

    return percentagesByBin;
  }, {} as RelativeTripPercentagesByBin);
};
