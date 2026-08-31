export type DataRow = Record<string, string>;

export type ChartType = "line" | "bar" | "area" | "scatter" | "histogram" | "boxplot" | "heatmap" | "pareto" | "waterfall" | "control" | "forecast";
export type Aggregation = "sum" | "average" | "min" | "max" | "count";
export type ChartSize = "small" | "medium" | "large";
export type ColumnKind = "number" | "date" | "text";

export type ChartPalette = "theme" | "ocean" | "violet" | "sunset" | "mono" | "custom";
export type ChartLegendPosition = "top" | "bottom" | "hidden";
export type ChartLineCurve = "smooth" | "straight" | "step";

export type ChartPresentation = {
  palette: ChartPalette;
  customColors?: string[];
  lineCurve: ChartLineCurve;
  lineWidth: number;
  showSymbols: boolean;
  areaOpacity: number;
  barOrientation: "vertical" | "horizontal";
  stacked: boolean;
  showDataLabels: boolean;
  legendPosition: ChartLegendPosition;
  showGrid: boolean;
  showZoom: boolean;
  showBrush: boolean;
};

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
  mode?: "manual" | "percentile";
  percentile?: number;
  direction?: "above" | "below";
  label?: string;
  severity?: "info" | "warning" | "critical";
  description?: string;
  lower?: number;
  upper?: number;
  evaluation: "plotted" | "raw";
  enabled: boolean;
};

export type ResolvedThresholdRule = {
  lower?: number;
  upper?: number;
  boundary?: number;
  percentile?: number;
  coverage?: number;
  label: string;
  mode: "manual" | "percentile";
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
  formula?: {
    expression: string;
    label: string;
  };
  comparison?: ChartComparison;
  timeRange?: ChartTimeRange;
  filters: ChartFilter[];
  thresholds: ThresholdRule[];
  size: ChartSize;
  presentation?: Partial<ChartPresentation>;
  diagnostic?: {
    forecastMethod?: "linear" | "moving-average" | "exponential";
    forecastHorizon?: number;
    controlSigma?: number;
  };
};

export type ChartColumn = {
  name: string;
  type: ColumnKind;
};

export type ChartSeries = {
  name: string;
  data: Array<number | null> | Array<[number, number]> | Array<[number, number, number]> | Array<[number, number, number, number, number]>;
  renderType?: "line" | "bar" | "scatter" | "boxplot" | "heatmap";
  yAxisIndex?: number;
  stack?: string;
  hidden?: boolean;
  areaBand?: boolean;
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
  secondaryCategories?: string[];
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
  label?: string;
  severity?: "info" | "warning" | "critical";
  description?: string;
  thresholdMode?: "manual" | "percentile";
  violations: ThresholdViolation[];
};

export type ThresholdReport = {
  events: ThresholdEvent[];
  violationCount: number;
  evaluatedPoints: number;
};
