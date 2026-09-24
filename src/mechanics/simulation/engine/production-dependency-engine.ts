import type { ChartColumn, DataRow } from "../../charts/types/chart-types";
import { evaluateFormula, referencedFormulaFields } from "../../modeling/engine/formula-engine.ts";
import { parseProductionField } from "../../modeling/engine/production-field-engine.ts";
import type { ModelDependencyRule, ModelEconometricDiagnostics, ModelNode, ModelParameter, ModelPropagationStep, ProductionSignalRole } from "../../modeling/types/model-types";
import type { EconometricModelPreference } from "../types/simulation-types";
import { fitEconometricResponse } from "../../econometrics/engine/econometric-engine.ts";

const MAX_ECONOMETRIC_ROWS = 360;

function numberValue(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : "";
}

function average(rows: DataRow[], field: string): number {
  const values = rows.map((row) => numberValue(row[field])).filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maximumLagCorrelation(rows: DataRow[], sourceField: string, targetField: string, maximumLag = 12): number {
  let best = 0;
  for (let lag = 0; lag <= Math.min(maximumLag, Math.floor(rows.length / 8)); lag += 1) {
    const pairs: Array<[number, number]> = [];
    for (let index = lag; index < rows.length; index += 1) {
      const source = numberValue(rows[index - lag]?.[sourceField]);
      const target = numberValue(rows[index]?.[targetField]);
      if (source != null && target != null) pairs.push([source, target]);
    }
    if (pairs.length < 12) continue;
    const sourceMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const targetMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    let covariance = 0;
    let sourceVariance = 0;
    let targetVariance = 0;
    pairs.forEach(([source, target]) => {
      covariance += (source - sourceMean) * (target - targetMean);
      sourceVariance += (source - sourceMean) ** 2;
      targetVariance += (target - targetMean) ** 2;
    });
    const correlation = sourceVariance && targetVariance ? covariance / Math.sqrt(sourceVariance * targetVariance) : 0;
    best = Math.max(best, Math.abs(correlation));
  }
  return best;
}

function quality(fit: (ModelEconometricDiagnostics & { lagSteps: number }) | null, adjustedPValue = fit?.pValue ?? 1): ModelDependencyRule["confidence"] {
  if (!fit) return "unknown";
  const validationStable = fit.validationRSquared == null || fit.validationRSquared >= 0;
  const intervalExcludesZero = fit.confidenceLower > 0 || fit.confidenceUpper < 0;
  const practicalEffect = Math.abs(fit.standardizedCoefficient) >= .05;
  const residualsStable = fit.durbinWatson == null || (fit.durbinWatson >= 1.2 && fit.durbinWatson <= 2.8);
  const residualsUsable = fit.durbinWatson == null || (fit.durbinWatson >= .8 && fit.durbinWatson <= 3.2);
  if (fit.trainRows >= 30 && fit.validationRows >= 6 && adjustedPValue <= .05 && intervalExcludesZero && practicalEffect && fit.relativeValidationError <= .15 && validationStable && residualsStable && !fit.commonTrendRisk) return "high";
  if (fit.trainRows >= 15 && fit.validationRows >= 4 && adjustedPValue <= .1 && intervalExcludesZero && practicalEffect && fit.relativeValidationError <= .3 && residualsUsable && !fit.commonTrendRisk) return "medium";
  return "low";
}

function modelLabel(model: ModelEconometricDiagnostics["model"]): string {
  return model === "arx-trend" ? "ARX + trend" : model.toUpperCase();
}

function econometricEvidence(fit: ModelEconometricDiagnostics & { lagSteps: number }, semantic: boolean, adjustedPValue: number): string {
  const validation = fit.validationRSquared == null ? "R² walidacji —" : `R² walidacji ${fit.validationRSquared.toFixed(2)}`;
  const selectionP = fit.specificationAdjustedPValue < .001 ? "<0,001" : fit.specificationAdjustedPValue.toFixed(3).replace(".", ",");
  return `${semantic ? "Zgodna rola sygnałów" : "Wzorzec historyczny"} · ${modelLabel(fit.model)} · β ${fit.coefficient.toPrecision(3)} · β stand. ${fit.standardizedCoefficient.toFixed(2)} · 95% CI ${fit.confidenceLower.toPrecision(3)}…${fit.confidenceUpper.toPrecision(3)} · p ${fit.pValue < .001 ? "<0,001" : fit.pValue.toFixed(3).replace(".", ",")} · p po wyborze ${selectionP} (${fit.testedSpecifications} spec.) · q ${adjustedPValue < .001 ? "<0,001" : adjustedPValue.toFixed(3).replace(".", ",")} · ${validation} · MAE walidacji ${fit.validationMae.toPrecision(3)} · próba ${fit.trainRows}+${fit.validationRows}`;
}

function chronologicalIndexes(rows: DataRow[], timeField?: string): number[] {
  const indexes = rows.map((_, index) => index);
  if (!timeField) return indexes;
  const times = rows.map((row) => Date.parse(row[timeField] ?? ""));
  if (times.some((value) => Number.isNaN(value))) return indexes;
  return indexes.sort((left, right) => times[left] - times[right] || left - right);
}

function adjustedPValues<T extends { fit: (ModelEconometricDiagnostics & { lagSteps: number }) | null }>(candidates: T[]): Map<T, number> {
  const fitted = candidates.filter((candidate): candidate is T & { fit: ModelEconometricDiagnostics & { lagSteps: number } } => candidate.fit != null)
    .sort((left, right) => left.fit.specificationAdjustedPValue - right.fit.specificationAdjustedPValue);
  const result = new Map<T, number>();
  let runningMinimum = 1;
  for (let index = fitted.length - 1; index >= 0; index -= 1) {
    const adjusted = Math.min(1, fitted[index].fit.specificationAdjustedPValue * fitted.length / (index + 1), runningMinimum);
    runningMinimum = adjusted;
    result.set(fitted[index], adjusted);
  }
  return result;
}

const ROLE_ORDER: Record<ProductionSignalRole, number> = {
  time: -1,
  setting: 0,
  measurement: 1,
  output: 2,
  correction: 2,
  offset: 3,
  other: 4,
};

function semanticDirection(sourceField: string, targetField: string): boolean {
  const source = parseProductionField(sourceField);
  const target = parseProductionField(targetField);
  return source.component === target.component
    && source.role !== target.role
    && ROLE_ORDER[source.role] >= 0
    && ROLE_ORDER[source.role] < ROLE_ORDER[target.role];
}

function ruleKey(rule: Pick<ModelDependencyRule, "sourceField" | "targetField">): string {
  return `${rule.sourceField}\u0000${rule.targetField}`;
}

function formulaRules(nodes: ModelNode[]): ModelDependencyRule[] {
  return nodes.flatMap((node) => {
    if (node.kind !== "transform" || node.config?.transformOperation !== "formula" || !node.config.formula?.trim() || !node.config.outputField?.trim()) return [];
    return referencedFormulaFields(node.config.formula).map((sourceField) => ({
      id: `formula-${node.id}-${sourceField}`,
      sourceField,
      targetField: node.config!.outputField!.trim(),
      method: "formula" as const,
      formula: node.config!.formula!.trim(),
      lagSteps: 0,
      enabled: true,
      confidence: "high" as const,
      evidence: `Dokładna formuła z bloku „${node.title}”`,
      automatic: true,
    }));
  });
}

function correctionRules(columns: ChartColumn[]): ModelDependencyRule[] {
  const identities = columns.map((column) => parseProductionField(column.name));
  const rules: ModelDependencyRule[] = [];
  identities.filter((identity) => identity.role === "correction").forEach((correction) => {
    const setting = identities.find((identity) => identity.component === correction.component && identity.role === "setting");
    const measurement = identities.find((identity) => identity.component === correction.component && identity.role === "measurement");
    if (!setting || !measurement) return;
    const formula = `[${setting.field}] - [${measurement.field}]`;
    [setting, measurement].forEach((source) => rules.push({
      id: `identity-${correction.canonical}-${source.canonical}`,
      sourceField: source.field,
      targetField: correction.field,
      method: "formula",
      formula,
      lagSteps: 0,
      enabled: true,
      confidence: "high",
      evidence: "Potwierdzona tożsamość produkcyjna: korekta = nastawa − wartość procesu",
      automatic: true,
    }));
  });
  return rules;
}

export function inferModelDependencies(
  rows: DataRow[],
  columns: ChartColumn[],
  nodes: ModelNode[],
  manualRules: ModelDependencyRule[] = [],
  rootField = "",
  econometricModel: EconometricModelPreference = "auto",
  econometricMaxLag = 12,
): ModelDependencyRule[] {
  const numeric = columns.filter((column) => column.type === "number").map((column) => column.name);
  const timeField = columns.find((column) => column.type === "date")?.name;
  const chronologicalRows = chronologicalIndexes(rows, timeField).map((index) => rows[index]).slice(-MAX_ECONOMETRIC_ROWS);
  const automatic: ModelDependencyRule[] = [...formulaRules(nodes), ...correctionRules(columns)];
  const existing = new Set([...manualRules, ...automatic].map(ruleKey));
  const candidates: Array<{ sourceField: string; targetField: string; semantic: boolean; fit: ReturnType<typeof fitEconometricResponse> }> = [];
  numeric.forEach((sourceField) => {
    numeric.forEach((targetField) => {
      if (sourceField === targetField || existing.has(`${sourceField}\u0000${targetField}`)) return;
      const semantic = semanticDirection(sourceField, targetField);
      if (!semantic && sourceField !== rootField) return;
      const fit = semantic || maximumLagCorrelation(chronologicalRows, sourceField, targetField, econometricMaxLag) >= .15
        ? fitEconometricResponse(chronologicalRows, sourceField, targetField, econometricMaxLag, econometricModel)
        : null;
      candidates.push({ sourceField, targetField, semantic, fit });
    });
  });
  const adjusted = adjustedPValues(candidates);
  candidates.forEach((candidate) => {
      const { sourceField, targetField, semantic, fit } = candidate;
      const adjustedPValue = adjusted.get(candidate) ?? 1;
      const confidence = quality(fit, adjustedPValue);
      const strongRootEvidence = sourceField === rootField && fit != null && confidence !== "low" && confidence !== "unknown" && Math.abs(fit.standardizedCoefficient) >= .2 && (fit.validationRSquared ?? 0) >= .25;
      const enabled = Boolean(fit && (confidence === "high" || confidence === "medium") && (semantic || strongRootEvidence));
      if (!semantic && !enabled) return;
      automatic.push({
        id: `learned-${parseProductionField(sourceField).canonical}-${parseProductionField(targetField).canonical}`,
        sourceField,
        targetField,
        method: "learned",
        sensitivity: fit?.coefficient,
        lagSteps: fit?.lagSteps ?? 0,
        enabled,
        confidence,
        evidence: fit
          ? econometricEvidence(fit, semantic, adjustedPValue)
          : "Nazwy wskazują możliwy kierunek, ale źródło jest stałe lub brakuje zmienności",
        automatic: true,
        econometrics: fit ? {
          model: fit.model,
          coefficient: fit.coefficient,
          standardizedCoefficient: fit.standardizedCoefficient,
          standardError: fit.standardError,
          pValue: fit.pValue,
          specificationAdjustedPValue: fit.specificationAdjustedPValue,
          adjustedPValue,
          testedSpecifications: fit.testedSpecifications,
          confidenceLower: fit.confidenceLower,
          confidenceUpper: fit.confidenceUpper,
          autoregressiveCoefficient: fit.autoregressiveCoefficient,
          trendCoefficient: fit.trendCoefficient,
          trainRows: fit.trainRows,
          validationRows: fit.validationRows,
          rSquared: fit.rSquared,
          validationRSquared: fit.validationRSquared,
          validationMae: fit.validationMae,
          relativeValidationError: fit.relativeValidationError,
          durbinWatson: fit.durbinWatson,
          controls: fit.controls,
          commonTrendRisk: fit.commonTrendRisk,
        } : undefined,
      });
      existing.add(`${sourceField}\u0000${targetField}`);
  });
  const manualKeys = new Set(manualRules.map(ruleKey));
  return [...manualRules, ...automatic.filter((rule) => !manualKeys.has(ruleKey(rule)))];
}

function changedAverage(baseRows: DataRow[], rows: DataRow[], field: string): { difference: number; percent: number | null } {
  const baseline = average(baseRows, field);
  const current = average(rows, field);
  const difference = current - baseline;
  return { difference, percent: baseline === 0 ? null : difference / Math.abs(baseline) * 100 };
}

export function propagateDependencies(
  baseRows: DataRow[],
  changedRows: DataRow[],
  dependencies: ModelDependencyRule[],
  initiallyChanged: Set<string>,
  parameters: ModelParameter[] = [],
  timeField?: string,
): { rows: DataRow[]; propagation: ModelPropagationStep[]; changedFields: Set<string>; skippedRules: string[] } {
  let rows = changedRows.map((row) => ({ ...row }));
  const changedFields = new Set(initiallyChanged);
  const propagation: ModelPropagationStep[] = [];
  const applied = new Set<string>();
  const formulaState = new Map<string, string>();
  const enabled: ModelDependencyRule[] = [];
  const skippedRules: string[] = [];
  const chronological = chronologicalIndexes(baseRows, timeField);
  const reaches = (from: string, target: string) => {
    const queue = [from];
    const visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      enabled.filter((rule) => rule.sourceField === current).forEach((rule) => queue.push(rule.targetField));
    }
    return false;
  };
  dependencies.filter((rule) => rule.enabled).forEach((rule) => {
    if (reaches(rule.targetField, rule.sourceField)) skippedRules.push(rule.id);
    else enabled.push(rule);
  });
  const passLimit = Math.max(2, enabled.length + 1);
  for (let pass = 0; pass < passLimit; pass += 1) {
    let progressed = false;
    for (const rule of enabled) {
      if (!changedFields.has(rule.sourceField) || rule.sourceField === rule.targetField) continue;
      const before = changedAverage(baseRows, rows, rule.targetField);
      let affectedRows = 0;
      if (rule.method === "formula" && rule.formula) {
        const stateKey = `${rule.targetField}\u0000${rule.formula}`;
        const sourceSignature = referencedFormulaFields(rule.formula).map((field) => `${field}:${changedAverage(baseRows, rows, field).difference}`).join("|");
        if (formulaState.get(stateKey) === sourceSignature) continue;
        formulaState.set(stateKey, sourceSignature);
        rows = rows.map((row) => {
          try {
            const value = evaluateFormula(rule.formula!, row, parameters);
            const current = numberValue(row[rule.targetField]);
            if (current == null || Math.abs(current - value) > 1e-12) affectedRows += 1;
            return { ...row, [rule.targetField]: formatNumber(value) };
          } catch {
            return row;
          }
        });
      } else {
        if (applied.has(rule.id) || !Number.isFinite(rule.sensitivity)) continue;
        applied.add(rule.id);
        const sensitivity = rule.sensitivity ?? 0;
        const next = rows.map((row) => ({ ...row }));
        const dynamicEffect = Array(rows.length).fill(0) as number[];
        const persistence = rule.method === "learned"
          && Number.isFinite(rule.econometrics?.autoregressiveCoefficient)
          && Math.abs(rule.econometrics?.autoregressiveCoefficient ?? 0) < .98
          ? rule.econometrics?.autoregressiveCoefficient ?? 0
          : 0;
        for (let sourcePosition = 0; sourcePosition < chronological.length; sourcePosition += 1) {
          const targetPosition = sourcePosition + Math.max(0, rule.lagSteps);
          if (targetPosition >= chronological.length) continue;
          const sourceIndex = chronological[sourcePosition];
          const targetIndex = chronological[targetPosition];
          const baselineSource = numberValue(baseRows[sourceIndex]?.[rule.sourceField]);
          const currentSource = numberValue(rows[sourceIndex]?.[rule.sourceField]);
          const currentTarget = numberValue(next[targetIndex]?.[rule.targetField]);
          if (baselineSource == null || currentSource == null || currentTarget == null) continue;
          const delta = currentSource - baselineSource;
          const previousIndex = targetPosition > 0 ? chronological[targetPosition - 1] : -1;
          const previousEffect = previousIndex >= 0 ? dynamicEffect[previousIndex] : 0;
          const effect = sensitivity * delta + persistence * previousEffect;
          dynamicEffect[targetIndex] = effect;
          if (Math.abs(effect) <= 1e-12) continue;
          next[targetIndex][rule.targetField] = formatNumber(currentTarget + effect);
          affectedRows += 1;
        }
        rows = next;
      }
      const after = changedAverage(baseRows, rows, rule.targetField);
      const newContribution = after.difference - before.difference;
      if (!affectedRows || Math.abs(newContribution) <= 1e-12) continue;
      changedFields.add(rule.targetField);
      propagation.push({
        order: propagation.length + 1,
        ruleId: rule.id,
        sourceField: rule.sourceField,
        targetField: rule.targetField,
        method: rule.method,
        lagSteps: rule.lagSteps,
        affectedRows,
        difference: newContribution,
        percent: after.percent,
        confidence: rule.confidence,
        evidence: rule.evidence,
      });
      progressed = true;
    }
    if (!progressed) break;
  }
  return { rows, propagation, changedFields, skippedRules };
}
