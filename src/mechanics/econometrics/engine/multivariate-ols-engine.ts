import type { DataRow } from "../../charts/types/chart-types.ts";
import { invertMatrix, multiplyMatrices, transposeMatrix } from "../math/linear-algebra.ts";
import { fSurvivalProbability, parseNumericValue, studentTCriticalValue, twoSidedStudentTPValue } from "../math/statistics.ts";
import type {
  OlsChangeResult,
  OlsChangeScenario,
  OlsFitOutcome,
  OlsModelResult,
  OlsModelSpecification,
} from "../types/ols-types.ts";

function requiredNumber(value: string | undefined): number | null {
  if (value == null || !String(value).trim()) return null;
  return parseNumericValue(value);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function failed(issue: string, usedRows = 0, omittedRows = 0): OlsFitOutcome {
  return { ready: false, issue, usedRows, omittedRows };
}

function calculateVifs(observations: number[][], predictorCount: number): number[] {
  if (predictorCount === 1) return [1];
  const means = Array.from({ length: predictorCount }, (_, index) => mean(observations.map((row) => row[index + 1])));
  const scales = means.map((average, index) => Math.sqrt(observations.reduce((sum, row) => sum + (row[index + 1] - average) ** 2, 0)));
  const standardized = observations.map((row) => means.map((average, index) => (row[index + 1] - average) / scales[index]));
  const correlationInverse = invertMatrix(multiplyMatrices(transposeMatrix(standardized), standardized));
  if (!correlationInverse) return Array.from({ length: predictorCount }, () => Number.POSITIVE_INFINITY);
  return correlationInverse.map((row, index) => Math.max(1, row[index]));
}

function diagnosticSample(actual: number[], fitted: number[], residuals: number[], limit = 360) {
  const step = Math.max(1, Math.ceil(actual.length / limit));
  return actual.flatMap((value, index) => index % step === 0 ? [{ actual: value, fitted: fitted[index], residual: residuals[index] }] : []);
}

export function fitOlsModel(rows: DataRow[], specification: OlsModelSpecification): OlsFitOutcome {
  const targetField = specification.targetField.trim();
  const predictorFields = [...new Set(specification.predictorFields.map((field) => field.trim()).filter(Boolean))];
  if (!targetField) return failed("Wybierz zmienną objaśnianą Y.");
  if (!predictorFields.length) return failed("Wybierz co najmniej jedną zmienną objaśniającą X.");
  if (predictorFields.includes(targetField)) return failed("Zmienna Y nie może być jednocześnie zmienną X.");

  const fields = [targetField, ...predictorFields];
  const observations: number[][] = [];
  rows.forEach((row) => {
    const values = fields.map((field) => requiredNumber(row[field]));
    if (values.every((value): value is number => value != null)) observations.push(values);
  });
  const omittedRows = rows.length - observations.length;
  const parameterCount = predictorFields.length + Number(specification.includeIntercept);
  if (observations.length < Math.max(8, parameterCount * 3)) {
    return failed(`Za mało kompletnych obserwacji. Potrzeba co najmniej ${Math.max(8, parameterCount * 3)}.`, observations.length, omittedRows);
  }

  for (let index = 0; index < fields.length; index += 1) {
    const values = observations.map((row) => row[index]);
    const average = mean(values);
    const range = Math.max(...values) - Math.min(...values);
    if (range <= Math.max(1e-9, Math.abs(average) * 1e-9)) {
      return failed(`Kolumna „${fields[index]}” jest stała i nie pozwala dopasować modelu.`, observations.length, omittedRows);
    }
  }

  const targetValues = observations.map((observation) => observation[0]);
  const x = observations.map((observation) => [
    ...(specification.includeIntercept ? [1] : []),
    ...observation.slice(1),
  ]);
  const y = targetValues.map((value) => [value]);
  const xTranspose = transposeMatrix(x);
  const xtxInverse = invertMatrix(multiplyMatrices(xTranspose, x));
  if (!xtxInverse) {
    return failed("Nie można odwrócić macierzy modelu. Usuń powtarzającą się lub współliniową zmienną X.", observations.length, omittedRows);
  }

  const beta = multiplyMatrices(multiplyMatrices(xtxInverse, xTranspose), y).map((row) => row[0]);
  if (beta.some((value) => !Number.isFinite(value))) {
    return failed("Współczynniki modelu nie są skończonymi liczbami.", observations.length, omittedRows);
  }

  const fittedValues = x.map((row) => row.reduce((sum, value, index) => sum + value * beta[index], 0));
  const residuals = targetValues.map((value, index) => value - fittedValues[index]);
  const residualSum = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const targetMean = mean(targetValues);
  const totalSum = specification.includeIntercept
    ? targetValues.reduce((sum, value) => sum + (value - targetMean) ** 2, 0)
    : targetValues.reduce((sum, value) => sum + value ** 2, 0);
  const rSquared = totalSum ? 1 - residualSum / totalSum : 0;
  const degreesOfFreedom = observations.length - parameterCount;
  const adjustedRSquared = specification.includeIntercept
    ? 1 - (1 - rSquared) * (observations.length - 1) / degreesOfFreedom
    : 1 - (1 - rSquared) * observations.length / degreesOfFreedom;
  const residualVariance = residualSum / degreesOfFreedom;
  const modelDegreesOfFreedom = predictorFields.length;
  const explainedSum = Math.max(0, totalSum - residualSum);
  const fStatistic = residualVariance <= 1e-18
    ? explainedSum > 0 ? Number.POSITIVE_INFINITY : 0
    : (explainedSum / modelDegreesOfFreedom) / residualVariance;
  const fPValue = fSurvivalProbability(fStatistic, modelDegreesOfFreedom, degreesOfFreedom);
  const vifs = calculateVifs(observations, predictorFields.length);
  const criticalValue = studentTCriticalValue(.95, degreesOfFreedom);
  const terms = [
    ...(specification.includeIntercept ? [{ term: "const", field: undefined }] : []),
    ...predictorFields.map((field) => ({ term: field, field })),
  ];
  const coefficients = terms.map((term, index) => {
    const standardError = Math.sqrt(Math.max(0, xtxInverse[index][index] * residualVariance));
    const tStatistic = standardError > 1e-12
      ? beta[index] / standardError
      : beta[index] === 0 ? 0 : Number.POSITIVE_INFINITY;
    return {
      ...term,
      coefficient: beta[index],
      standardError,
      tStatistic,
      pValue: twoSidedStudentTPValue(tStatistic, degreesOfFreedom),
      confidenceLower: beta[index] - criticalValue * standardError,
      confidenceUpper: beta[index] + criticalValue * standardError,
      vif: term.field ? vifs[predictorFields.indexOf(term.field)] : null,
    };
  });
  const durbinDenominator = residualSum;
  const durbinNumerator = residuals.slice(1)
    .reduce((sum, residual, index) => sum + (residual - residuals[index]) ** 2, 0);
  const targetEnergy = targetValues.reduce((sum, value) => sum + value ** 2, 0);
  const durbinWatson = durbinDenominator > Math.max(1e-18, targetEnergy * 1e-14)
    ? durbinNumerator / durbinDenominator
    : null;
  const predictorMeans = Object.fromEntries(predictorFields.map((field, index) => [
    field,
    mean(observations.map((observation) => observation[index + 1])),
  ]));

  return {
    ready: true,
    result: {
      targetField,
      predictorFields,
      includeIntercept: specification.includeIntercept,
      coefficients,
      usedRows: observations.length,
      omittedRows,
      degreesOfFreedom,
      rSquared,
      adjustedRSquared,
      mae: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length,
      rmse: Math.sqrt(residualSum / residuals.length),
      residualStandardError: Math.sqrt(residualVariance),
      residualMean: mean(residuals),
      fStatistic,
      fPValue,
      durbinWatson,
      targetMean,
      predictorMeans,
      diagnosticPoints: diagnosticSample(targetValues, fittedValues, residuals),
    },
  };
}

function changedValue(baseline: number, scenario: OlsChangeScenario): number {
  if (scenario.operation === "percent") return baseline * (1 + scenario.value / 100);
  if (scenario.operation === "add") return baseline + scenario.value;
  if (scenario.operation === "multiply") return baseline * scenario.value;
  return scenario.value;
}

export function predictOlsAtMeans(result: OlsModelResult, values: Record<string, number> = {}): number {
  return result.coefficients.reduce((prediction, coefficient) => {
    if (!coefficient.field) return prediction + coefficient.coefficient;
    return prediction + coefficient.coefficient * (values[coefficient.field] ?? result.predictorMeans[coefficient.field]);
  }, 0);
}

export function calculateOlsChange(result: OlsModelResult, scenario: OlsChangeScenario): OlsChangeResult | null {
  const baselineInput = result.predictorMeans[scenario.predictorField];
  if (!Number.isFinite(baselineInput)) return null;
  const changedInput = changedValue(baselineInput, scenario);
  const baselinePrediction = predictOlsAtMeans(result);
  const changedPrediction = predictOlsAtMeans(result, { [scenario.predictorField]: changedInput });
  const predictedDifference = changedPrediction - baselinePrediction;
  return {
    predictorField: scenario.predictorField,
    baselineInput,
    changedInput,
    inputDifference: changedInput - baselineInput,
    baselinePrediction,
    changedPrediction,
    predictedDifference,
    predictedPercent: baselinePrediction === 0 ? null : predictedDifference / Math.abs(baselinePrediction) * 100,
  };
}
