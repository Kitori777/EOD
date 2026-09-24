import type { DataRow } from "../../charts/types/chart-types";
import type { ModelEconometricDiagnostics } from "../../modeling/types/model-types";
import type { EconometricModelPreference } from "../../simulation/types/simulation-types";
import { invertMatrix, multiplyMatrices, transposeMatrix } from "../math/linear-algebra.ts";
import { correlation, normalCdf, parseNumericValue } from "../math/statistics.ts";
import type { EconometricCandidate, EconometricFit, EconometricObservation } from "../types/econometric-types.ts";

function designMatrix(
  observations: EconometricObservation[],
  model: ModelEconometricDiagnostics["model"],
): number[][] {
  return observations.map((item) => model === "ols"
    ? [1, item.x]
    : model === "arx"
      ? [1, item.x, item.yLag]
      : [1, item.x, item.yLag, item.trend]);
}

function fitCandidate(
  observations: EconometricObservation[],
  model: ModelEconometricDiagnostics["model"],
  lagSteps: number,
): EconometricCandidate | null {
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
  if (
    sourceRange <= Math.max(1e-9, Math.abs(sourceMean) * 1e-9)
    || targetRange <= Math.max(1e-9, Math.abs(targetMean) * 1e-9)
  ) return null;

  const xTrain = designMatrix(train, model);
  const yTrain = train.map((item) => [item.y]);
  const xTranspose = transposeMatrix(xTrain);
  const xtxInverse = invertMatrix(multiplyMatrices(xTranspose, xTrain));
  if (!xtxInverse) return null;

  const beta = multiplyMatrices(multiplyMatrices(xtxInverse, xTranspose), yTrain).map((row) => row[0]);
  if (beta.some((value) => !Number.isFinite(value))) return null;

  const predict = (item: EconometricObservation) => designMatrix([item], model)[0]
    .reduce((sum, value, index) => sum + value * beta[index], 0);
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

  // Newey-West (HAC) covariance handles heteroskedasticity and short-run
  // autocorrelation, which are both common in ordered production signals.
  const meat = Array.from({ length: parameterCount }, () => Array(parameterCount).fill(0) as number[]);
  xTrain.forEach((row, rowIndex) => row.forEach((left, i) => row.forEach((right, j) => {
    meat[i][j] += residuals[rowIndex] ** 2 * left * right;
  })));
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

  const covariance = multiplyMatrices(multiplyMatrices(xtxInverse, meat), xtxInverse);
  const hc1 = train.length / Math.max(1, train.length - parameterCount);
  const standardError = Math.sqrt(Math.max(0, covariance[1][1] * hc1));
  const statistic = standardError > 1e-12
    ? beta[1] / standardError
    : beta[1] === 0 ? 0 : Number.POSITIVE_INFINITY;
  const pValue = Number.isFinite(statistic)
    ? Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(statistic)))))
    : 0;
  const durbinDenominator = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const durbinNumerator = residuals.slice(1)
    .reduce((sum, value, index) => sum + (value - residuals[index]) ** 2, 0);
  const targetEnergy = train.reduce((sum, item) => sum + item.y ** 2, 0);
  const residualTolerance = Math.max(1e-18, targetEnergy * 1e-14);
  const durbinWatson = durbinDenominator > residualTolerance
    ? durbinNumerator / durbinDenominator
    : null;
  const sourceTrend = correlation(train.map((item) => item.x), train.map((item) => item.trend));
  const targetTrend = correlation(train.map((item) => item.y), train.map((item) => item.trend));
  const commonTrendRisk = model !== "arx-trend" && Math.abs(sourceTrend) >= .9 && Math.abs(targetTrend) >= .9;
  const controls = model === "ols" ? [] : model === "arx" ? ["target(t−1)"] : ["target(t−1)", "time trend"];
  const score = relativeValidationError
    + parameterCount * .003
    + lagSteps * .002
    + Math.max(0, pValue - .05) * .1
    + (commonTrendRisk ? .2 : 0);

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

function observationsAtLag(
  rows: DataRow[],
  sourceField: string,
  targetField: string,
  lagSteps: number,
): EconometricObservation[] {
  const observations: EconometricObservation[] = [];
  for (let index = Math.max(1, lagSteps); index < rows.length; index += 1) {
    const x = parseNumericValue(rows[index - lagSteps]?.[sourceField]);
    const y = parseNumericValue(rows[index]?.[targetField]);
    const yLag = parseNumericValue(rows[index - 1]?.[targetField]);
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
): EconometricFit | null {
  const maxLag = Math.min(maximumLag, Math.max(0, Math.floor(rows.length / 8)));
  const models: ModelEconometricDiagnostics["model"][] = modelPreference === "auto"
    ? ["arx-trend", "arx", "ols"]
    : [modelPreference];
  let best: EconometricCandidate | null = null;
  let testedSpecifications = 0;

  for (let lagSteps = 0; lagSteps <= maxLag; lagSteps += 1) {
    const observations = observationsAtLag(rows, sourceField, targetField, lagSteps);
    const candidates = models
      .map((model) => fitCandidate(observations, model, lagSteps))
      .filter((candidate): candidate is EconometricCandidate => candidate != null);
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
