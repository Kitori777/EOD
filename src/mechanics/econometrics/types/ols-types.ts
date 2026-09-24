export type OlsChangeOperation = "percent" | "add" | "multiply" | "set";

export type OlsModelSpecification = {
  targetField: string;
  predictorFields: string[];
  includeIntercept: boolean;
  justification: string;
};

export type OlsChangeScenario = {
  predictorField: string;
  operation: OlsChangeOperation;
  value: number;
};

export type OlsCoefficient = {
  term: string;
  field?: string;
  coefficient: number;
  standardError: number;
  tStatistic: number;
  pValue: number;
  confidenceLower: number;
  confidenceUpper: number;
  vif: number | null;
};

export type OlsDiagnosticPoint = {
  actual: number;
  fitted: number;
  residual: number;
};

export type OlsModelResult = {
  targetField: string;
  predictorFields: string[];
  includeIntercept: boolean;
  coefficients: OlsCoefficient[];
  usedRows: number;
  omittedRows: number;
  degreesOfFreedom: number;
  rSquared: number;
  adjustedRSquared: number;
  mae: number;
  rmse: number;
  residualStandardError: number;
  residualMean: number;
  fStatistic: number;
  fPValue: number;
  durbinWatson: number | null;
  targetMean: number;
  predictorMeans: Record<string, number>;
  diagnosticPoints: OlsDiagnosticPoint[];
};

export type OlsFitOutcome =
  | { ready: true; result: OlsModelResult }
  | { ready: false; issue: string; usedRows: number; omittedRows: number };

export type OlsChangeResult = {
  predictorField: string;
  baselineInput: number;
  changedInput: number;
  inputDifference: number;
  baselinePrediction: number;
  changedPrediction: number;
  predictedDifference: number;
  predictedPercent: number | null;
};
