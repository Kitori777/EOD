import type { DataRow } from "../../charts/types/chart-types";
import type { ModelEconometricDiagnostics } from "../../modeling/types/model-types";
import type { EconometricModelPreference } from "../types/simulation-types";

type Observation = { y: number; x: number; yLag: number; trend: number };
type Candidate = ModelEconometricDiagnostics & { score: number; lagSteps: number; intercept: number };

function numberValue(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function transpose(matrix: number[][]): number[][] {
  return matrix[0]?.map((_, column) => matrix.map((row) => row[column])) ?? [];
}

function multiply(left: number[][], right: number[][]): number[][] {
  return left.map((row) => right[0].map((_, column) => row.reduce((sum, value, index) => sum + value * right[index][column], 0)));
}

function inverse(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  if (!size || matrix.some((row) => row.length !== size)) return null;
  const work = matrix.map((row, index) => [...row, ...Array.from({ length: size }, (_, column) => Number(index === column))]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    if (Math.abs(work[pivot][column]) < 1e-10) return null;
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const divisor = work[column][column];
    work[column] = work[column].map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row][column];
      work[row] = work[row].map((value, index) => value - factor * work[column][index]);
    }
  }
  return work.map((row) => row.slice(size));
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function correlation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length < 2) return 0;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  left.forEach((value, index) => {
    covariance += (value - meanLeft) * (right[index] - meanRight);
    varianceLeft += (value - meanLeft) ** 2;
    varianceRight += (right[index] - meanRight) ** 2;
  });
  return varianceLeft && varianceRight ? covariance / Math.sqrt(varianceLeft * varianceRight) : 0;
}

function design(observations: Observation[], model: ModelEconometricDiagnostics["model"]): number[][] {
  return observations.map((item) => model === "ols"
    ? [1, item.x]
    : model === "arx"
      ? [1, item.x, item.yLag]
      : [1, item.x, item.yLag, item.trend]);
}

function fitCandidate(observations: Observation[], model: ModelEconometricDiagnostics["model"], lagSteps: number): Candidate | null {
  const validationRows = Math.max(4, Math.floor(observations.length * .2));
  const trainRows = observations.length - validationRows;
  const parameterCount = model === "ols" ? 2 : model === "arx" ? 3 : 4;
  if (trainRows < Math.max(10, parameterCount * 3) || validationRows < 4) return null;
  const train = observations.slice(0, trainRows);
  const validation = observations.slice(trainRows);
  const sourceValues = train.map((item) => item.x);
  const targetValues = train.map((item) => item.y);
  const sourceMean = sourceValues.reduce((sum, value) => sum + value, 0) / sourceValues.length;
  const targetMean = targetValues.reduce((sum, value) => sum + value, 0) / targetValues.length;
  const sourceRange = Math.max(...sourceValues) - Math.min(...sourceValues);
  const targetRange = Math.max(...targetValues) - Math.min(...targetValues);
  if (sourceRange <= Math.max(1e-9, Math.abs(sourceMean) * 1e-9) || targetRange <= Math.max(1e-9, Math.abs(targetMean) * 1e-9)) return null;
  const xTrain = design(train, model);
  const yTrain = train.map((item) => [item.y]);
  const xt = transpose(xTrain);
  const xtxInverse = inverse(multiply(xt, xTrain));
  if (!xtxInverse) return null;
  const beta = multiply(multiply(xtxInverse, xt), yTrain).map((row) => row[0]);
  if (beta.some((value) => !Number.isFinite(value))) return null;
  const predict = (item: Observation) => design([item], model)[0].reduce((sum, value, index) => sum + value * beta[index], 0);
  const residuals = train.map((item) => item.y - predict(item));
  const meanY = train.reduce((sum, item) => sum + item.y, 0) / train.length;
  const total = train.reduce((sum, item) => sum + (item.y - meanY) ** 2, 0);
  const residualSum = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const rSquared = total ? Math.max(-10, 1 - residualSum / total) : 0;
  const sourceDeviation = Math.sqrt(sourceValues.reduce((sum, value) => sum + (value - sourceMean) ** 2, 0) / sourceValues.length);
  const targetDeviation = Math.sqrt(targetValues.reduce((sum, value) => sum + (value - targetMean) ** 2, 0) / targetValues.length);
  const standardizedCoefficient = targetDeviation ? beta[1] * sourceDeviation / targetDeviation : 0;
  const validationErrors = validation.map((item) => item.y - predict(item));
  const validationMae = validationErrors.reduce((sum, value) => sum + Math.abs(value), 0) / validation.length;
  const validationMean = validation.reduce((sum, item) => sum + item.y, 0) / validation.length;
  const validationTotal = validation.reduce((sum, item) => sum + (item.y - validationMean) ** 2, 0);
  const validationResidual = validationErrors.reduce((sum, value) => sum + value ** 2, 0);
  const validationRSquared = validationTotal ? Math.max(-10, 1 - validationResidual / validationTotal) : null;
  const relativeValidationError = targetRange ? validationMae / targetRange : validationMae;

  // Newey–West (HAC) covariance is robust to heteroskedasticity and
  // short-run autocorrelation, both common in ordered production signals.
  const meat = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0) as number[]);
  xTrain.forEach((row, rowIndex) => row.forEach((left, i) => row.forEach((right, j) => { meat[i][j] += residuals[rowIndex] ** 2 * left * right; })));
  const hacBandwidth = Math.min(train.length - 1, Math.max(1, Math.floor(4 * (train.length / 100) ** (2 / 9))));
  for (let lag = 1; lag <= hacBandwidth; lag += 1) {
    const weight = 1 - lag / (hacBandwidth + 1);
    for (let rowIndex = lag; rowIndex < train.length; rowIndex += 1) {
      const current = xTrain[rowIndex];
      const previous = xTrain[rowIndex - lag];
      const residualProduct = residuals[rowIndex] * residuals[rowIndex - lag] * weight;
      current.forEach((currentValue, i) => current.forEach((_, j) => {
        meat[i][j] += residualProduct * (currentValue * previous[j] + previous[i] * current[j]);
      }));
    }
  }
  const covariance = multiply(multiply(xtxInverse, meat), xtxInverse);
  const hc1 = train.length / Math.max(1, train.length - parameterCount);
  const standardError = Math.sqrt(Math.max(0, covariance[1][1] * hc1));
  const statistic = standardError > 1e-12 ? beta[1] / standardError : beta[1] === 0 ? 0 : Number.POSITIVE_INFINITY;
  const pValue = Number.isFinite(statistic) ? Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(statistic))))) : 0;
  const durbinDenominator = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const durbinNumerator = residuals.slice(1).reduce((sum, value, index) => sum + (value - residuals[index]) ** 2, 0);
  const targetEnergy = train.reduce((sum, item) => sum + item.y ** 2, 0);
  const residualTolerance = Math.max(1e-18, targetEnergy * 1e-14);
  const durbinWatson = durbinDenominator > residualTolerance ? durbinNumerator / durbinDenominator : null;
  const sourceTrend = correlation(train.map((item) => item.x), train.map((item) => item.trend));
  const targetTrend = correlation(train.map((item) => item.y), train.map((item) => item.trend));
  const commonTrendRisk = model !== "arx-trend" && Math.abs(sourceTrend) >= .9 && Math.abs(targetTrend) >= .9;
  const controls = model === "ols" ? [] : model === "arx" ? ["target(t−1)"] : ["target(t−1)", "time trend"];
  const score = relativeValidationError + parameterCount * .003 + lagSteps * .002 + Math.max(0, pValue - .05) * .1 + (commonTrendRisk ? .2 : 0);
  return {
    model,
    coefficient: beta[1],
    standardizedCoefficient,
    standardError,
    pValue,
    specificationAdjustedPValue: pValue,
    adjustedPValue: pValue,
    testedSpecifications: 1,
    confidenceLower: beta[1] - 1.96 * standardError,
    confidenceUpper: beta[1] + 1.96 * standardError,
    autoregressiveCoefficient: model === "ols" ? undefined : beta[2],
    trendCoefficient: model === "arx-trend" ? beta[3] : undefined,
    trainRows: train.length,
    validationRows: validation.length,
    rSquared,
    validationRSquared,
    validationMae,
    relativeValidationError,
    durbinWatson,
    controls,
    commonTrendRisk,
    score,
    lagSteps,
    intercept: beta[0],
  };
}

function observationsAtLag(rows: DataRow[], sourceField: string, targetField: string, lagSteps: number): Observation[] {
  const observations: Observation[] = [];
  for (let index = Math.max(1, lagSteps); index < rows.length; index += 1) {
    const x = numberValue(rows[index - lagSteps]?.[sourceField]);
    const y = numberValue(rows[index]?.[targetField]);
    const yLag = numberValue(rows[index - 1]?.[targetField]);
    if (x == null || y == null || yLag == null) continue;
    observations.push({ y, x, yLag, trend: index / Math.max(1, rows.length - 1) });
  }
  return observations;
}

export function fitEconometricResponse(
  rows: DataRow[],
  sourceField: string,
  targetField: string,
  maximumLag = 12,
  modelPreference: EconometricModelPreference = "auto",
): (ModelEconometricDiagnostics & { lagSteps: number; intercept: number }) | null {
  const maxLag = Math.min(maximumLag, Math.max(0, Math.floor(rows.length / 8)));
  const models: ModelEconometricDiagnostics["model"][] = modelPreference === "auto"
    ? ["arx-trend", "arx", "ols"]
    : [modelPreference];
  let best: Candidate | null = null;
  let testedSpecifications = 0;
  for (let lagSteps = 0; lagSteps <= maxLag; lagSteps += 1) {
    const observations = observationsAtLag(rows, sourceField, targetField, lagSteps);
    const candidates = models
      .map((model) => fitCandidate(observations, model, lagSteps))
      .filter((candidate): candidate is Candidate => candidate != null);
    testedSpecifications += candidates.length;
    const candidate = candidates.sort((left, right) => left.score - right.score)[0];
    if (candidate && (!best || candidate.score < best.score - 1e-9)) best = candidate;
  }
  if (!best) return null;
  const { score: _score, ...fit } = best;
  void _score;
  return {
    ...fit,
    testedSpecifications,
    specificationAdjustedPValue: Math.min(1, fit.pValue * Math.max(1, testedSpecifications)),
  };
}
