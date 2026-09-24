export type ViewId = "model" | "data" | "charts" | "paths" | "compare";

export type ModelWorkspaceMode = "build" | "ols" | "simulate" | "verify";

export type BottomTab = "results" | "data" | "issues";

export type NodeKind = "source" | "transform" | "decision" | "metric" | "result";

export type ModelNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  config?: ModelNodeConfig;
};

export type ModelNodeConfig = {
  field?: string;
  timeField?: string;
  calculation?: "average" | "sum" | "minimum" | "maximum" | "last" | "count" | "violations" | "events";
  sourceRuleId?: string;
  transformOperation?: "none" | "add" | "multiply" | "percent" | "formula";
  transformValue?: number;
  formula?: string;
  outputField?: string;
  thresholdMode?: "manual" | "percentile";
  thresholdValue?: number;
  percentile?: number;
  direction?: "above" | "below";
  severity?: "info" | "warning" | "critical";
};

export type ModelParameter = {
  id: string;
  name: string;
  value: number;
  unit?: string;
  description?: string;
};

export type ModelMemoryOperation = "percent" | "add" | "multiply" | "set";

export type ModelMemoryEntry = {
  id: string;
  name: string;
  field: string;
  operation: ModelMemoryOperation;
  value: number;
  timeField?: string;
  from?: string;
  to?: string;
  note?: string;
  capturedAt: string;
  datasetName?: string;
  enabled: boolean;
  useInModel: boolean;
  availableInSimulation: boolean;
};

export type ModelValidation = {
  ready: boolean;
  issues: string[];
};

export type ModelRuleResult = {
  nodeId: string;
  nodeTitle: string;
  field: string;
  boundary: number;
  thresholdLabel: string;
  direction: "above" | "below";
  severity: "info" | "warning" | "critical";
  evaluatedPoints: number;
  violationCount: number;
  eventCount: number;
  firstEvent?: { start: string; end: string };
  peakValue?: number;
  largestDeviation?: number;
};

export type ModelExecutionResult = ModelValidation & {
  executedAt?: string;
  durationMs?: number;
  processedRows: number;
  rules: ModelRuleResult[];
  outputs: ModelOutputResult[];
  transforms: ModelTransformResult[];
};

export type ModelOutputResult = {
  nodeId: string;
  nodeTitle: string;
  field?: string;
  calculation: NonNullable<ModelNodeConfig["calculation"]>;
  value: number;
  detail: string;
};

export type ModelTransformResult = {
  nodeId: string;
  nodeTitle: string;
  outputField: string;
  validCount: number;
  beforeAverage?: number;
  afterAverage?: number;
  deltaPercent?: number;
};

export type ModelEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type ProductionSignalRole = "time" | "setting" | "measurement" | "output" | "correction" | "offset" | "other";

export type ProductionFieldIdentity = {
  field: string;
  canonical: string;
  component: string;
  componentLabel: string;
  role: ProductionSignalRole;
};

export type ModelDependencyMethod = "formula" | "learned" | "manual";

export type ModelEconometricDiagnostics = {
  model: "ols" | "arx" | "arx-trend";
  coefficient: number;
  standardizedCoefficient: number;
  standardError: number;
  pValue: number;
  specificationAdjustedPValue: number;
  adjustedPValue: number;
  testedSpecifications: number;
  confidenceLower: number;
  confidenceUpper: number;
  autoregressiveCoefficient?: number;
  trendCoefficient?: number;
  trainRows: number;
  validationRows: number;
  rSquared: number;
  validationRSquared: number | null;
  validationMae: number;
  relativeValidationError: number;
  durbinWatson: number | null;
  controls: string[];
  commonTrendRisk: boolean;
};

export type ModelDependencyRule = {
  id: string;
  sourceField: string;
  targetField: string;
  method: ModelDependencyMethod;
  formula?: string;
  sensitivity?: number;
  lagSteps: number;
  enabled: boolean;
  confidence: "high" | "medium" | "low" | "unknown";
  evidence: string;
  automatic?: boolean;
  econometrics?: ModelEconometricDiagnostics;
};

export type ModelPropagationStep = {
  order: number;
  ruleId: string;
  sourceField: string;
  targetField: string;
  method: ModelDependencyMethod;
  lagSteps: number;
  affectedRows: number;
  difference: number;
  percent: number | null;
  confidence: ModelDependencyRule["confidence"];
  evidence: string;
};

export type Scenario = {
  id: string;
  name: string;
  priceChange: number;
  marketingChange: number;
  conversionChange: number;
  choices: {
    pricing: string;
    campaign: string;
    market: string;
  };
};

export type ScenarioMetrics = {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  customers: number;
  risk: number;
};
