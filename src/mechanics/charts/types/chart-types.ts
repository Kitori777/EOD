export type DataRow = Record<string, string>;

export type ChartType = "line" | "bar" | "area" | "scatter" | "histogram";
export type Aggregation = "sum" | "average" | "min" | "max" | "count";
export type ChartSize = "small" | "medium" | "large";
export type ColumnKind = "number" | "date" | "text";

export type ChartFilter = {
  field: string;
  operator: "equals" | "contains" | "greater" | "less";
  value: string;
};

export type ChartComparison = {
  referenceField: string;
  mode: "absolute" | "percent";
};

export type ChartTimeRange = {
  field: string;
  from?: string;
  to?: string;
};

export type ThresholdRule = {
  id: string;
  field: string;
  lower?: number;
  upper?: number;
  evaluation: "plotted" | "raw";
  enabled: boolean;
};

export type ChartDefinition = {
  id: string;
  title: string;
  datasetId: string;
  type: ChartType;
  xField: string;
  yFields: string[];
  seriesField?: string;
  aggregation: Aggregation;
  comparison?: ChartComparison;
  timeRange?: ChartTimeRange;
  filters: ChartFilter[];
  thresholds: ThresholdRule[];
  size: ChartSize;
};

export type ChartColumn = {
  name: string;
  type: ColumnKind;
};

export type ChartSeries = {
  name: string;
  data: Array<number | null> | Array<[number, number]>;
};

export type ComparisonResult = {
  targetField: string;
  referenceField: string;
  targetValue: number;
  referenceValue: number;
  difference: number;
  percent: number | null;
};

export type ChartDataset = {
  categories: string[];
  series: ChartSeries[];
  rejectedRows: number;
  sourceRows: number;
  comparison?: ComparisonResult;
};

export type ThresholdStatus = "below" | "above";

export type ThresholdViolation = {
  x: string;
  value: number;
  status: ThresholdStatus;
  boundary: number;
  deviation: number;
};

export type ThresholdEvent = {
  id: string;
  ruleId: string;
  field: string;
  status: ThresholdStatus;
  startX: string;
  endX: string;
  pointCount: number;
  minimum: number;
  maximum: number;
  largestDeviation: number;
  violations: ThresholdViolation[];
};

export type ThresholdReport = {
  events: ThresholdEvent[];
  violationCount: number;
  evaluatedPoints: number;
};
