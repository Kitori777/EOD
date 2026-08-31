import type { DataRow } from "../../charts/types/chart-types";
import type { ModelDependencyRule, ModelExecutionResult, ModelPropagationStep } from "../../modeling/types/model-types";

export type WhatIfOperation = "set" | "add" | "subtract" | "percent" | "multiply";
export type WhatIfScopeKind = "all" | "group" | "time";
export type WhatIfResponseMode = "auto" | "manual";
export type EconometricModelPreference = "auto" | "ols" | "arx" | "arx-trend";
export type EconometricLagLimit = 0 | 3 | 6 | 12 | 24;
export type ForecastMethod = "linear" | "moving-average" | "exponential";

export type WhatIfScope = {
  kind: WhatIfScopeKind;
  field?: string;
  value?: string;
  from?: string;
  to?: string;
};

export type WhatIfScenario = {
  id: string;
  name: string;
  inputField: string;
  operation: WhatIfOperation;
  value: number;
  scope: WhatIfScope;
  outputFields: string[];
  estimateOutputs: boolean;
  responseMode?: WhatIfResponseMode;
  econometricModel?: EconometricModelPreference;
  econometricMaxLag?: EconometricLagLimit;
};

export type EstimateQuality = "high" | "medium" | "low" | "unavailable";

export type FieldImpact = {
  field: string;
  baseline: number;
  scenario: number;
  difference: number;
  percent: number | null;
  correlation: number | null;
  rSquared: number | null;
  mae: number | null;
  validationMae: number | null;
  validationRows: number;
  sampleSize: number;
  quality: EstimateQuality;
  predicted: boolean;
  response: "direct" | "estimated" | "propagated" | "unchanged";
  sensitivity: number | null;
  propagationDepth?: number;
  dependencyRuleId?: string;
  standardError?: number;
  standardizedCoefficient?: number;
  pValue?: number;
  specificationAdjustedPValue?: number;
  adjustedPValue?: number;
  testedSpecifications?: number;
  confidenceLower?: number;
  confidenceUpper?: number;
  validationRSquared?: number | null;
  durbinWatson?: number | null;
  modelType?: "ols" | "arx" | "arx-trend";
  selectedLagSteps?: number;
  controls?: string[];
  commonTrendRisk?: boolean;
};

export type WhatIfResult = {
  rows: DataRow[];
  impacts: FieldImpact[];
  affectedRows: number;
  warnings: string[];
  dependencies: ModelDependencyRule[];
  propagation: ModelPropagationStep[];
};

export type ScenarioFacts = {
  extrapolated: boolean;
  analyzedFields: number;
  changedFields: number;
  estimatedFields: number;
  unchangedFields: number;
};

export type ModelOutputComparison = {
  nodeId: string;
  label: string;
  baseline: number;
  variant: number;
  difference: number;
  percent: number | null;
};

export type ModelRuleComparison = {
  nodeId: string;
  label: string;
  baselineEvents: number;
  variantEvents: number;
  difference: number;
};

export type ModelScenarioEvaluation = {
  direct: WhatIfResult;
  baseline: ModelExecutionResult;
  variant: ModelExecutionResult;
  modelReady: boolean;
  outputChanges: ModelOutputComparison[];
  ruleChanges: ModelRuleComparison[];
  facts: ScenarioFacts;
};

export type ModelDiagnosticFinding = {
  id: string;
  severity: "ok" | "info" | "warning" | "critical";
  area: "data" | "model" | "simulation";
  title: string;
  description: string;
  nodeId?: string;
  field?: string;
  action: "none" | "open-model" | "open-simulation" | "open-data";
};

export type ModelDiagnosticReport = {
  modelReady: boolean;
  simulationReady: boolean;
  status: "ready" | "attention" | "blocked";
  processedRows: number;
  findings: ModelDiagnosticFinding[];
};

export type ForecastSpec = {
  timeField: string;
  valueField: string;
  method: ForecastMethod;
  horizon: number;
  movingWindow?: number;
  alpha?: number;
};

export type ForecastPoint = {
  x: string;
  value: number;
  lower: number;
  upper: number;
};

export type ForecastResult = {
  observed: Array<{ x: string; value: number }>;
  forecast: ForecastPoint[];
  method: ForecastMethod;
  mae: number | null;
  sampleSize: number;
  warning?: string;
};

export type ColumnDiagnostic = {
  field: string;
  kind: "number" | "date" | "text";
  role: "time" | "setting" | "measurement" | "output" | "correction" | "category" | "other";
  missing: number;
  missingPercent: number;
  invalid: number;
  invalidPercent: number;
  unique: number;
  constant: boolean;
  outliers: number;
  outlierPercent: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  median: number | null;
  status: "ok" | "info" | "warning" | "critical";
  summary: string;
};

export type RelationshipDiagnostic = {
  left: string;
  right: string;
  correlation: number;
  bestLag: number;
  lagCorrelation: number;
  sampleSize: number;
  strength: "umiarkowana" | "silna" | "bardzo silna";
  relationshipKind: "observed" | "likely-derived";
};

export type TimeDiagnostic = {
  field: string;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  outOfOrder: number;
  gaps: number;
  expectedIntervalMs: number | null;
  largestGapMs: number | null;
  status: "ok" | "warning" | "critical";
  summary: string;
};

export type DiagnosticFinding = {
  id: string;
  severity: "ok" | "info" | "warning" | "critical";
  title: string;
  description: string;
  field?: string;
  actionLabel?: string;
};

export type DiagnosticReport = {
  rows: number;
  sampled: boolean;
  columns: ColumnDiagnostic[];
  relationships: RelationshipDiagnostic[];
  criticalIssues: number;
  warningIssues: number;
  expectedConstants: number;
  informationalConstants: number;
  overallStatus: "good" | "attention" | "critical";
  time: TimeDiagnostic | null;
  findings: DiagnosticFinding[];
};

export type ChecklistArea = ModelDiagnosticFinding["area"];
export type ChecklistSeverity = ModelDiagnosticFinding["severity"];

export type CustomChecklistItem = {
  id: string;
  title: string;
  description: string;
  checked: boolean;
};

export type VerificationPreferences = {
  visibleAreas: ChecklistArea[];
  visibleSeverities: ChecklistSeverity[];
  customItems: CustomChecklistItem[];
};

export type DiagnosticSectionId = "verdict" | "model" | "summary" | "findings" | "columns" | "relationships";
export type DiagnosticSummaryId = "completeness" | "time" | "constants" | "issues";

export type DiagnosticPreferences = {
  visibleSections: DiagnosticSectionId[];
  summaryMetrics: DiagnosticSummaryId[];
  visibleSeverities: DiagnosticFinding["severity"][];
  monitoredFields: string[];
  monitorAllFields: boolean;
  showAdvancedCorrelation: boolean;
};

export const DEFAULT_VERIFICATION_PREFERENCES: VerificationPreferences = {
  visibleAreas: ["data", "model", "simulation"],
  visibleSeverities: ["ok", "info", "warning", "critical"],
  customItems: [],
};

export const DEFAULT_DIAGNOSTIC_PREFERENCES: DiagnosticPreferences = {
  visibleSections: ["verdict", "model", "summary", "findings", "columns", "relationships"],
  summaryMetrics: ["completeness", "time", "constants", "issues"],
  visibleSeverities: ["ok", "info", "warning", "critical"],
  monitoredFields: [],
  monitorAllFields: true,
  showAdvancedCorrelation: false,
};
