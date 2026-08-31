import type { ChartColumn, DataRow } from "../../charts/types/chart-types";
import { executeDataModel } from "../../modeling/engine/model-execution-engine.ts";
import type { ModelDependencyRule, ModelEdge, ModelNode, ModelParameter } from "../../modeling/types/model-types";
import type { EstimateQuality, FieldImpact, ModelScenarioEvaluation, ScenarioFacts, WhatIfResult, WhatIfScenario } from "../types/simulation-types";
import { inferModelDependencies, propagateDependencies } from "./production-dependency-engine.ts";

export function numericValue(value: string | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : "";
}

function inScope(row: DataRow, scenario: WhatIfScenario): boolean {
  const scope = scenario.scope;
  if (scope.kind === "all") return true;
  if (!scope.field) return false;
  if (scope.kind === "group") return String(row[scope.field] ?? "") === String(scope.value ?? "");
  const timestamp = Date.parse(row[scope.field] ?? "");
  if (Number.isNaN(timestamp)) return false;
  const from = scope.from ? Date.parse(scope.from) : null;
  const to = scope.to ? Date.parse(scope.to) : null;
  return !((from != null && !Number.isNaN(from) && timestamp < from) || (to != null && !Number.isNaN(to) && timestamp > to));
}

function changeValue(value: number, scenario: WhatIfScenario): number {
  if (scenario.operation === "set") return scenario.value;
  if (scenario.operation === "add") return value + scenario.value;
  if (scenario.operation === "subtract") return value - scenario.value;
  if (scenario.operation === "multiply") return value * scenario.value;
  return value * (1 + scenario.value / 100);
}

type LinearModel = {
  slope: number;
  intercept: number;
  correlation: number;
  rSquared: number;
  mae: number;
  sampleSize: number;
  validationMae: number;
  validationRows: number;
  relativeValidationError: number;
};

export function fitLinearResponse(rows: DataRow[], inputField: string, outputField: string): LinearModel | null {
  const pairs = rows
    .map((row) => [numericValue(row[inputField]), numericValue(row[outputField])] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] != null && pair[1] != null);
  if (pairs.length < 8) return null;
  const validationRows = Math.max(1, Math.min(Math.floor(pairs.length * .2), pairs.length - 7));
  const training = pairs.slice(0, pairs.length - validationRows);
  const validation = pairs.slice(-validationRows);
  const meanX = training.reduce((sum, pair) => sum + pair[0], 0) / training.length;
  const meanY = training.reduce((sum, pair) => sum + pair[1], 0) / training.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  training.forEach(([x, y]) => {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  });
  if (varianceX === 0 || varianceY === 0) return null;
  const slope = covariance / varianceX;
  const intercept = meanY - slope * meanX;
  const correlation = covariance / Math.sqrt(varianceX * varianceY);
  const mae = training.reduce((sum, [x, y]) => sum + Math.abs(y - (intercept + slope * x)), 0) / training.length;
  const validationMae = validation.reduce((sum, [x, y]) => sum + Math.abs(y - (intercept + slope * x)), 0) / validation.length;
  const outputRange = Math.max(...training.map((pair) => pair[1])) - Math.min(...training.map((pair) => pair[1]));
  const relativeValidationError = outputRange > 0 ? validationMae / outputRange : validationMae;
  return { slope, intercept, correlation, rSquared: correlation ** 2, mae, sampleSize: pairs.length, validationMae, validationRows, relativeValidationError };
}

function qualityFor(model: LinearModel | null): EstimateQuality {
  if (!model) return "unavailable";
  if (model.sampleSize >= 30 && model.rSquared >= 0.65 && model.relativeValidationError <= .1) return "high";
  if (model.sampleSize >= 15 && model.rSquared >= 0.3 && model.relativeValidationError <= .25) return "medium";
  return "low";
}

function average(rows: DataRow[], field: string): { value: number; count: number } {
  const values = rows.map((row) => numericValue(row[field])).filter((value): value is number => value != null);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    count: values.length,
  };
}

function impact(
  field: string,
  baselineRows: DataRow[],
  scenarioRows: DataRow[],
  model: LinearModel | null,
  response: FieldImpact["response"],
  dependency?: ModelDependencyRule,
  propagationDepth?: number,
): FieldImpact {
  const baseline = average(baselineRows, field);
  const modified = average(scenarioRows, field);
  const difference = modified.value - baseline.value;
  return {
    field,
    baseline: baseline.value,
    scenario: modified.value,
    difference,
    percent: baseline.value === 0 ? null : (difference / Math.abs(baseline.value)) * 100,
    correlation: model?.correlation ?? null,
    rSquared: model?.rSquared ?? null,
    mae: model?.mae ?? null,
    validationMae: model?.validationMae ?? null,
    validationRows: model?.validationRows ?? 0,
    sampleSize: model?.sampleSize ?? baseline.count,
    quality: response === "estimated" ? dependency?.confidence === "unknown" ? "unavailable" : dependency?.confidence ?? qualityFor(model) : response === "direct" || response === "propagated" ? "high" : qualityFor(model),
    predicted: response === "estimated" || response === "propagated",
    response,
    sensitivity: dependency?.sensitivity ?? model?.slope ?? null,
    propagationDepth,
    dependencyRuleId: dependency?.id,
    standardError: dependency?.econometrics?.standardError,
    standardizedCoefficient: dependency?.econometrics?.standardizedCoefficient,
    pValue: dependency?.econometrics?.pValue,
    specificationAdjustedPValue: dependency?.econometrics?.specificationAdjustedPValue,
    adjustedPValue: dependency?.econometrics?.adjustedPValue,
    testedSpecifications: dependency?.econometrics?.testedSpecifications,
    confidenceLower: dependency?.econometrics?.confidenceLower,
    confidenceUpper: dependency?.econometrics?.confidenceUpper,
    validationRSquared: dependency?.econometrics?.validationRSquared,
    durbinWatson: dependency?.econometrics?.durbinWatson,
    modelType: dependency?.econometrics?.model,
    selectedLagSteps: dependency?.lagSteps,
    controls: dependency?.econometrics?.controls,
    commonTrendRisk: dependency?.econometrics?.commonTrendRisk,
  };
}

export function applyWhatIfScenario(
  baseRows: DataRow[],
  scenario: WhatIfScenario,
  candidateFields: string[] = scenario.outputFields,
  manualDependencies: ModelDependencyRule[] = [],
  nodes: ModelNode[] = [],
  columns: ChartColumn[] = [...new Set([scenario.inputField, ...candidateFields])].filter(Boolean).map((name) => ({ name, type: "number" as const })),
  parameters: ModelParameter[] = [],
): WhatIfResult {
  if (!scenario.inputField) return { rows: baseRows.map((row) => ({ ...row })), impacts: [], affectedRows: 0, warnings: ["Wybierz kolumnę wejściową."], dependencies: [], propagation: [] };
  const responseMode = scenario.responseMode ?? "auto";
  const responseFields = [...new Set((responseMode === "auto" ? candidateFields : scenario.outputFields).filter((field) => field && field !== scenario.inputField))];
  let affectedRows = 0;
  const directlyChangedRows = baseRows.map((row) => {
    if (!inScope(row, scenario)) return { ...row };
    const originalInput = numericValue(row[scenario.inputField]);
    if (originalInput == null) return { ...row };
    affectedRows += 1;
    const changedInput = changeValue(originalInput, scenario);
    return { ...row, [scenario.inputField]: formatNumber(changedInput) };
  });
  const dependencies = scenario.estimateOutputs
    ? inferModelDependencies(baseRows, columns, nodes, manualDependencies, scenario.inputField, scenario.econometricModel ?? "auto", scenario.econometricMaxLag ?? 12)
    : [];
  const timeField = columns.find((column) => column.type === "date")?.name;
  const propagated = scenario.estimateOutputs
    ? propagateDependencies(baseRows, directlyChangedRows, dependencies, new Set([scenario.inputField]), parameters, timeField)
    : { rows: directlyChangedRows, propagation: [], changedFields: new Set([scenario.inputField]), skippedRules: [] };
  const rows = propagated.rows;
  const dependencyTargets = propagated.propagation.map((step) => step.targetField);
  const fields = [...new Set([scenario.inputField, ...responseFields, ...dependencyTargets])];
  const impacts = fields.map((field) => {
    if (field === scenario.inputField) return impact(field, baseRows, rows, null, "direct");
    const steps = propagated.propagation.filter((step) => step.targetField === field);
    const lastStep = steps.at(-1);
    const dependency = lastStep ? dependencies.find((rule) => rule.id === lastStep.ruleId) : undefined;
    const model = dependency?.method === "learned" ? {
      slope: dependency.econometrics?.coefficient ?? dependency.sensitivity ?? 0,
      intercept: 0,
      correlation: 0,
      rSquared: dependency.econometrics?.rSquared ?? 0,
      mae: dependency.econometrics?.validationMae ?? 0,
      sampleSize: (dependency.econometrics?.trainRows ?? 0) + (dependency.econometrics?.validationRows ?? 0),
      validationMae: dependency.econometrics?.validationMae ?? 0,
      validationRows: dependency.econometrics?.validationRows ?? 0,
      relativeValidationError: dependency.econometrics?.relativeValidationError ?? 1,
    } : null;
    const response: FieldImpact["response"] = lastStep
      ? dependency?.method === "learned" ? "estimated" : "propagated"
      : "unchanged";
    return impact(field, baseRows, rows, model, response, dependency, lastStep?.order);
  });
  const warnings: string[] = [];
  if (!affectedRows) warnings.push("Wybrany zakres nie zawiera liczbowych wartości wejściowych.");
  if (scenario.estimateOutputs && dependencies.some((rule) => rule.automatic && !rule.enabled && rule.sourceField === scenario.inputField)) warnings.push("Część relacji rozpoznano po nazwach, ale nie ma dość zmienności, aby bezpiecznie policzyć ich wpływ. Możesz dodać ręczny współczynnik.");
  if (propagated.skippedRules.length) warnings.push(`Pominięto ${propagated.skippedRules.length} ${propagated.skippedRules.length === 1 ? "relację tworzącą pętlę" : "relacje tworzące pętlę"}.`);
  return { rows, impacts, affectedRows, warnings, dependencies, propagation: propagated.propagation };
}

function scenarioFacts(baseRows: DataRow[], result: WhatIfResult, scenario: WhatIfScenario): ScenarioFacts {
  const sourceValues = baseRows.map((row) => numericValue(row[scenario.inputField])).filter((value): value is number => value != null);
  const changedValues = result.rows.map((row) => numericValue(row[scenario.inputField])).filter((value): value is number => value != null);
  const sourceMinimum = sourceValues.length ? Math.min(...sourceValues) : null;
  const sourceMaximum = sourceValues.length ? Math.max(...sourceValues) : null;
  const changedMinimum = changedValues.length ? Math.min(...changedValues) : null;
  const changedMaximum = changedValues.length ? Math.max(...changedValues) : null;
  const extrapolated = sourceMinimum != null && sourceMaximum != null && changedMinimum != null && changedMaximum != null
    ? changedMinimum < sourceMinimum || changedMaximum > sourceMaximum
    : false;
  const changedFields = result.impacts.filter((item) => Math.abs(item.difference) > 1e-9).length;
  const estimatedFields = result.impacts.filter((item) => item.response === "estimated").length;
  return {
    extrapolated,
    analyzedFields: result.impacts.length,
    changedFields,
    estimatedFields,
    unchangedFields: result.impacts.length - changedFields,
  };
}

export function executeWhatIfModel(
  baseRows: DataRow[],
  columns: ChartColumn[],
  scenario: WhatIfScenario,
  nodes: ModelNode[],
  edges: ModelEdge[],
  dependencyRules: ModelDependencyRule[] = [],
  parameters: ModelParameter[] = [],
  language: "pl" | "en" = "pl",
): ModelScenarioEvaluation {
  const direct = applyWhatIfScenario(baseRows, scenario, columns.filter((column) => column.type === "number").map((column) => column.name), dependencyRules, nodes, columns, parameters);
  const baseline = executeDataModel(nodes, edges, baseRows, columns, parameters, language);
  const variant = executeDataModel(nodes, edges, direct.rows, columns, parameters, language);
  const outputChanges = baseline.ready && variant.ready ? baseline.outputs.map((output) => {
    const changed = variant.outputs.find((candidate) => candidate.nodeId === output.nodeId);
    const variantValue = changed?.value ?? output.value;
    const difference = variantValue - output.value;
    return { nodeId: output.nodeId, label: output.nodeTitle, baseline: output.value, variant: variantValue, difference, percent: output.value === 0 ? null : difference / Math.abs(output.value) * 100 };
  }) : [];
  const ruleChanges = baseline.ready && variant.ready ? baseline.rules.map((rule) => {
    const changed = variant.rules.find((candidate) => candidate.nodeId === rule.nodeId);
    const variantEvents = changed?.eventCount ?? rule.eventCount;
    return { nodeId: rule.nodeId, label: rule.nodeTitle, baselineEvents: rule.eventCount, variantEvents, difference: variantEvents - rule.eventCount };
  }) : [];
  return {
    direct,
    baseline,
    variant,
    modelReady: baseline.ready && variant.ready,
    outputChanges,
    ruleChanges,
    facts: scenarioFacts(baseRows, direct, scenario),
  };
}
