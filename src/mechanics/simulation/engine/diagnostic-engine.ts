import type { ChartColumn, DataRow } from "../../charts/types/chart-types";
import { executeDataModel, validateDataModel } from "../../modeling/engine/model-execution-engine.ts";
import type { ModelDependencyRule, ModelEdge, ModelNode, ModelParameter } from "../../modeling/types/model-types";
import { executeWhatIfModel } from "./what-if-engine.ts";
import { inferModelDependencies } from "./production-dependency-engine.ts";
import type { ColumnDiagnostic, DiagnosticFinding, DiagnosticReport, ModelDiagnosticFinding, ModelDiagnosticReport, RelationshipDiagnostic, TimeDiagnostic, WhatIfScenario } from "../types/simulation-types";

function numericValue(value: string | undefined): number | null {
  if (value == null || !String(value).trim()) return null;
  const parsed = Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function evenlySample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * step)]);
}

function pearson(left: Array<number | null>, right: Array<number | null>, lag = 0): { value: number; count: number } | null {
  const pairs: Array<[number, number]> = [];
  const start = Math.max(0, lag);
  for (let index = start; index < Math.min(left.length, right.length + lag); index += 1) {
    const a = left[index];
    const b = right[index - lag];
    if (a != null && b != null) pairs.push([a, b]);
  }
  if (pairs.length < 8) return null;
  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  pairs.forEach(([a, b]) => {
    covariance += (a - meanA) * (b - meanB);
    varianceA += (a - meanA) ** 2;
    varianceB += (b - meanB) ** 2;
  });
  if (!varianceA || !varianceB) return null;
  return { value: covariance / Math.sqrt(varianceA * varianceB), count: pairs.length };
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function roleFor(column: ChartColumn): ColumnDiagnostic["role"] {
  const name = column.name.toLowerCase();
  if (column.type === "date" || /(^|_)(time|timestamp|date)($|_)/.test(name)) return "time";
  if (/(setpoint|set_point|target|limit|reference|nominal)/.test(name)) return "setting";
  if (/(correction|offset|adjust|compensation)/.test(name)) return "correction";
  if (/(output|result|score)/.test(name)) return "output";
  if (/(process|measure|sensor|temperature|speed|length|value)/.test(name)) return "measurement";
  if (column.type === "text") return "category";
  return "other";
}

function diagnoseColumn(rows: DataRow[], column: ChartColumn, language: "pl" | "en"): ColumnDiagnostic {
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const raw = rows.map((row) => String(row[column.name] ?? "").trim());
  const missing = raw.filter((value) => !value).length;
  const populated = raw.filter(Boolean);
  const role = roleFor(column);
  const numbers = column.type === "number"
    ? populated.map((value) => numericValue(value)).filter((value): value is number => value != null)
    : [];
  const invalid = column.type === "number" ? populated.length - numbers.length : 0;
  let outliers = 0;
  if (numbers.length >= 8) {
    const q1 = quantile(numbers, 0.25);
    const q3 = quantile(numbers, 0.75);
    const spread = q3 - q1;
    outliers = numbers.filter((value) => value < q1 - 1.5 * spread || value > q3 + 1.5 * spread).length;
  }
  const unique = new Set(populated).size;
  const constant = populated.length > 0 && unique === 1;
  const missingPercent = rows.length ? (missing / rows.length) * 100 : 0;
  const invalidPercent = populated.length ? (invalid / populated.length) * 100 : 0;
  const outlierPercent = numbers.length ? (outliers / numbers.length) * 100 : 0;
  let status: ColumnDiagnostic["status"] = "ok";
  let summary = tr("Brak sygnałów wymagających uwagi.", "No signals require attention.");
  if (missingPercent >= 20 || invalidPercent >= 20) {
    status = "critical";
    summary = missingPercent >= 20 ? tr(`${missingPercent.toFixed(1)}% wartości jest pustych.`, `${missingPercent.toFixed(1)}% of values are empty.`) : tr(`${invalidPercent.toFixed(1)}% wartości ma nieprawidłowy format.`, `${invalidPercent.toFixed(1)}% of values have an invalid format.`);
  } else if (missing > 0 || invalid > 0 || outlierPercent >= 5) {
    status = "warning";
    summary = missing > 0
      ? tr(`${missing} pustych wartości (${missingPercent.toFixed(1)}%).`, `${missing} empty values (${missingPercent.toFixed(1)}%).`)
      : invalid > 0
        ? tr(`${invalid} wartości nie jest prawidłową liczbą.`, `${invalid} values are not valid numbers.`)
        : tr(`${outliers} nietypowych wartości (${outlierPercent.toFixed(1)}%).`, `${outliers} unusual values (${outlierPercent.toFixed(1)}%).`);
  } else if (constant) {
    status = "info";
    summary = role === "setting"
      ? tr(`Stała nastawa: ${populated[0]}. To może być prawidłowe.`, `Constant setting: ${populated[0]}. This may be correct.`)
      : tr(`Jedna wartość w całym pliku: ${populated[0]}. To nie jest błąd samo w sobie.`, `One value across the entire file: ${populated[0]}. This is not an error by itself.`);
  }
  return {
    field: column.name,
    kind: column.type,
    role,
    missing,
    missingPercent,
    invalid,
    invalidPercent,
    unique,
    constant,
    outliers,
    outlierPercent,
    minimum: numbers.length ? Math.min(...numbers) : null,
    maximum: numbers.length ? Math.max(...numbers) : null,
    mean: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null,
    median: numbers.length ? quantile(numbers, 0.5) : null,
    status,
    summary,
  };
}

function diagnoseTime(rows: DataRow[], column: ChartColumn | undefined, language: "pl" | "en"): TimeDiagnostic | null {
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  if (!column) return null;
  const raw = rows.map((row) => String(row[column.name] ?? "").trim());
  const parsed = raw.map((value) => value ? Date.parse(value) : Number.NaN);
  const valid = parsed.filter(Number.isFinite);
  const invalidRows = parsed.length - valid.length;
  const duplicates = valid.length - new Set(valid).size;
  let outOfOrder = 0;
  const positiveIntervals: number[] = [];
  for (let index = 1; index < parsed.length; index += 1) {
    if (!Number.isFinite(parsed[index]) || !Number.isFinite(parsed[index - 1])) continue;
    const interval = parsed[index] - parsed[index - 1];
    if (interval < 0) outOfOrder += 1;
    if (interval > 0) positiveIntervals.push(interval);
  }
  const expectedIntervalMs = positiveIntervals.length ? quantile(positiveIntervals, 0.5) : null;
  const gaps = expectedIntervalMs ? positiveIntervals.filter((interval) => interval > expectedIntervalMs * 1.5).length : 0;
  const largestGapMs = positiveIntervals.length ? Math.max(...positiveIntervals) : null;
  const invalidPercent = rows.length ? (invalidRows / rows.length) * 100 : 0;
  const status: TimeDiagnostic["status"] = invalidPercent >= 20
    ? "critical"
    : invalidRows || duplicates || outOfOrder || gaps ? "warning" : "ok";
  const summary = status === "ok"
    ? tr("Czas jest uporządkowany, bez duplikatów i wykrytych luk.", "Time is ordered, with no duplicates or detected gaps.")
    : [
      invalidRows ? tr(`${invalidRows} nieprawidłowych dat`, `${invalidRows} invalid dates`) : "",
      duplicates ? tr(`${duplicates} powtórzonych znaczników czasu`, `${duplicates} duplicate timestamps`) : "",
      outOfOrder ? tr(`${outOfOrder} rekordów poza kolejnością`, `${outOfOrder} out-of-order records`) : "",
      gaps ? tr(`${gaps} większych przerw`, `${gaps} larger gaps`) : "",
    ].filter(Boolean).join(" · ");
  return { field: column.name, validRows: valid.length, invalidRows, duplicates, outOfOrder, gaps, expectedIntervalMs, largestGapMs, status, summary };
}

function relationshipStrength(correlation: number): RelationshipDiagnostic["strength"] {
  const value = Math.abs(correlation);
  if (value >= .9) return "bardzo silna";
  if (value >= .7) return "silna";
  return "umiarkowana";
}

function likelyDerived(left: string, right: string, correlation: number): boolean {
  return Math.abs(correlation) >= .995 && /(correction|offset|adjust)/i.test(`${left} ${right}`);
}

function buildFindings(columns: ColumnDiagnostic[], time: TimeDiagnostic | null, relationships: RelationshipDiagnostic[], language: "pl" | "en"): DiagnosticFinding[] {
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const findings: DiagnosticFinding[] = [];
  const critical = columns.filter((column) => column.status === "critical");
  const warnings = columns.filter((column) => column.status === "warning");
  const expectedConstants = columns.filter((column) => column.constant && column.role === "setting");
  const otherConstants = columns.filter((column) => column.constant && column.role !== "setting");
  const missing = columns.reduce((sum, column) => sum + column.missing, 0);
  if (critical.length) findings.push({ id: "critical-columns", severity: "critical", title: tr(`${critical.length} pól może zniekształcać analizę`, `${critical.length} fields may distort the analysis`), description: tr("Mają co najmniej 20% braków lub nieprawidłowych wartości. Zacznij od nich.", "They contain at least 20% missing or invalid values. Start with these."), field: critical[0].field, actionLabel: tr("Pokaż pierwsze pole", "Show first field") });
  if (time?.status === "critical" || time?.status === "warning") findings.push({ id: "time", severity: time.status, title: tr("Oś czasu wymaga sprawdzenia", "The time axis needs review"), description: time.summary, field: time.field, actionLabel: tr("Zobacz oś czasu", "View time axis") });
  if (warnings.length) findings.push({ id: "warnings", severity: "warning", title: tr(`${warnings.length} pól warto przejrzeć`, `${warnings.length} fields are worth reviewing`), description: tr("Wykryto braki, nieprawidłowe liczby albo większy udział nietypowych wartości.", "Missing values, invalid numbers, or a larger share of unusual values were detected."), field: warnings[0].field, actionLabel: tr("Pokaż pierwsze pole", "Show first field") });
  if (!missing) findings.push({ id: "complete", severity: "ok", title: tr("Wszystkie komórki są wypełnione", "All cells are filled"), description: tr("W analizowanej części pliku nie znaleziono pustych wartości.", "No empty values were found in the analyzed part of the file.") });
  if (time?.status === "ok") findings.push({ id: "time-ok", severity: "ok", title: tr("Oś czasu jest spójna", "The time axis is consistent"), description: time.summary, field: time.field, actionLabel: tr("Zobacz szczegóły", "View details") });
  if (expectedConstants.length) findings.push({ id: "settings", severity: "info", title: tr(`${expectedConstants.length} stałych nastaw — to może być prawidłowe`, `${expectedConstants.length} constant settings — this may be correct`), description: tr("Pola Setpoint, Target i Limit często celowo nie zmieniają się podczas jednego przebiegu.", "Setpoint, Target and Limit fields often remain intentionally constant during a run."), field: expectedConstants[0].field, actionLabel: tr("Pokaż nastawy", "Show settings") });
  if (otherConstants.length) findings.push({ id: "constants", severity: "info", title: tr(`${otherConstants.length} innych pól ma jedną wartość`, `${otherConstants.length} other fields have one value`), description: tr("Nie traktujemy tego jako błędu. Warto jedynie potwierdzić, czy taka była intencja.", "This is not treated as an error. Confirm only whether it was intentional."), field: otherConstants[0].field, actionLabel: tr("Pokaż pole", "Show field") });
  const strong = relationships.filter((relationship) => Math.abs(relationship.correlation) >= .7);
  const derived = strong.filter((relationship) => relationship.relationshipKind === "likely-derived").length;
  if (strong.length) findings.push({ id: "relationships", severity: "info", title: tr(`${strong.length} silne zależności między polami`, `${strong.length} strong relationships between fields`), description: derived
    ? tr(`${derived} z nich prawdopodobnie wynika ze sposobu obliczenia korekt. Pozostałe są wskazówką do dalszego sprawdzenia, nie dowodem przyczyny.`, `${derived} likely result from how corrections are calculated. The others are clues for further review, not proof of causation.`)
    : tr("To wskazówka do dalszego sprawdzenia, a nie dowód, że jedno pole powoduje zmianę drugiego.", "This is a clue for further review, not proof that one field causes the other to change.") });
  return findings;
}

export function analyzeDataset(rows: DataRow[], columns: ChartColumn[], language: "pl" | "en" = "pl"): DiagnosticReport {
  const sample = evenlySample(rows, 5000);
  const columnDiagnostics = columns.map((column) => diagnoseColumn(sample, column, language));
  const varyingNames = new Set(columnDiagnostics.filter((column) => column.kind === "number" && !column.constant && column.invalidPercent < 20).map((column) => column.field));
  const numeric = columns.filter((column) => varyingNames.has(column.name)).slice(0, 60);
  const values = new Map(numeric.map((column) => [column.name, sample.map((row) => numericValue(row[column.name]))]));
  const baseRelationships: RelationshipDiagnostic[] = [];
  for (let leftIndex = 0; leftIndex < numeric.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < numeric.length; rightIndex += 1) {
      const left = numeric[leftIndex].name;
      const right = numeric[rightIndex].name;
      const direct = pearson(values.get(left) ?? [], values.get(right) ?? []);
      if (direct && Math.abs(direct.value) >= .45) baseRelationships.push({
        left,
        right,
        correlation: direct.value,
        bestLag: 0,
        lagCorrelation: direct.value,
        sampleSize: direct.count,
        strength: relationshipStrength(direct.value),
        relationshipKind: likelyDerived(left, right, direct.value) ? "likely-derived" : "observed",
      });
    }
  }
  baseRelationships.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const relationships = baseRelationships.slice(0, 24).map((relationship) => {
    let bestLag = 0;
    let lagCorrelation = relationship.correlation;
    for (let lag = 1; lag <= 6; lag += 1) {
      const forward = pearson(values.get(relationship.left) ?? [], values.get(relationship.right) ?? [], lag);
      const backward = pearson(values.get(relationship.right) ?? [], values.get(relationship.left) ?? [], lag);
      if (forward && Math.abs(forward.value) > Math.abs(lagCorrelation)) {
        bestLag = lag;
        lagCorrelation = forward.value;
      }
      if (backward && Math.abs(backward.value) > Math.abs(lagCorrelation)) {
        bestLag = -lag;
        lagCorrelation = backward.value;
      }
    }
    return { ...relationship, bestLag, lagCorrelation };
  });
  const timeColumn = columns.find((column) => column.type === "date") ?? columns.find((column) => /time|date/i.test(column.name));
  const time = diagnoseTime(sample, timeColumn, language);
  const criticalIssues = columnDiagnostics.filter((column) => column.status === "critical").length + (time?.status === "critical" ? 1 : 0);
  const warningIssues = columnDiagnostics.filter((column) => column.status === "warning").length + (time?.status === "warning" ? 1 : 0);
  const expectedConstants = columnDiagnostics.filter((column) => column.constant && column.role === "setting").length;
  const informationalConstants = columnDiagnostics.filter((column) => column.constant && column.role !== "setting").length;
  const overallStatus = criticalIssues ? "critical" : warningIssues ? "attention" : "good";
  return {
    rows: rows.length,
    sampled: rows.length > sample.length,
    columns: columnDiagnostics,
    relationships,
    criticalIssues,
    warningIssues,
    expectedConstants,
    informationalConstants,
    overallStatus,
    time,
    findings: buildFindings(columnDiagnostics, time, relationships, language),
  };
}

function nodeForIssue(issue: string, nodes: ModelNode[]): ModelNode | undefined {
  return nodes.find((node) => issue.includes(node.title));
}

export function analyzeModelReadiness(
  rows: DataRow[],
  columns: ChartColumn[],
  nodes: ModelNode[],
  edges: ModelEdge[],
  scenario?: WhatIfScenario,
  dependencyRules: ModelDependencyRule[] = [],
  parameters: ModelParameter[] = [],
  language: "pl" | "en" = "pl",
): ModelDiagnosticReport {
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const locale = language === "en" ? "en-US" : "pl-PL";
  const findings: ModelDiagnosticFinding[] = [];
  const validation = validateDataModel(nodes, edges, columns.map((column) => column.name), parameters, language);
  if (!validation.ready) {
    validation.issues.slice(0, 8).forEach((issue, index) => {
      const node = nodeForIssue(issue, nodes);
      findings.push({ id: `model-${index}`, severity: "critical", area: "model", title: issue, description: node ? tr(`Problem dotyczy bloku „${node.title}”. Otwórz go i uzupełnij konfigurację.`, `The issue concerns block “${node.title}”. Open it and complete the configuration.`) : tr("Struktura modelu wymaga uzupełnienia przed uruchomieniem.", "The model structure must be completed before execution."), nodeId: node?.id, action: "open-model" });
    });
  } else {
    const execution = executeDataModel(nodes, edges, rows, columns, parameters, language);
    findings.push({ id: "model-ready", severity: "ok", area: "model", title: tr("Model można wykonać od początku do końca", "The model can run from start to finish"), description: tr(`${execution.processedRows.toLocaleString(locale)} rekordów przechodzi przez ${nodes.length} bloków.`, `${execution.processedRows.toLocaleString(locale)} records pass through ${nodes.length} blocks.`), action: "open-model" });
    execution.transforms.forEach((transform) => {
      const coverage = rows.length ? transform.validCount / rows.length : 0;
      if (coverage < .8) findings.push({ id: `coverage-${transform.nodeId}`, severity: coverage < .5 ? "critical" : "warning", area: "model", title: tr(`Transformacja „${transform.nodeTitle}” zwraca wynik tylko dla ${Math.round(coverage * 100)}% rekordów`, `Transformation “${transform.nodeTitle}” returns a result for only ${Math.round(coverage * 100)}% of records`), description: tr("Sprawdź brakujące wartości, typy kolumn oraz formułę. Rekordy bez poprawnego wyniku mogą zmieniać końcowe metryki.", "Check missing values, field types and the formula. Records without a valid result may change final metrics."), nodeId: transform.nodeId, action: "open-model" });
    });
    if (!execution.outputs.length && !execution.rules.length) findings.push({ id: "empty-output", severity: "warning", area: "model", title: tr("Model nie zwraca jeszcze użytecznego rezultatu", "The model does not yet return a useful result"), description: tr("Dodaj metrykę, wynik albo regułę, aby można było ocenić działanie modelu.", "Add a metric, result or rule so the model can be evaluated."), action: "open-model" });
  }

  let simulationReady = false;
  if (!scenario) {
    findings.push({ id: "no-scenario", severity: "info", area: "simulation", title: tr("Nie utworzono jeszcze wariantu Co-jeśli", "No What-if variant has been created yet"), description: tr("Dodaj scenariusz, aby porównać wynik bazowy z wynikiem po zmianie danych.", "Add a scenario to compare the baseline result with the result after changing the data."), action: "open-simulation" });
  } else {
    const dependencies = inferModelDependencies(rows, columns, nodes, dependencyRules, scenario.inputField, scenario.econometricModel ?? "auto", scenario.econometricMaxLag ?? 12);
    const activeDependencies = dependencies.filter((rule) => rule.enabled);
    const unresolvedDependencies = dependencies.filter((rule) => rule.automatic && !rule.enabled && rule.sourceField === scenario.inputField);
    if (activeDependencies.length) findings.push({ id: "dependency-map", severity: "ok", area: "simulation", title: tr(`${activeDependencies.length} relacji może przekazywać zmianę dalej`, `${activeDependencies.length} relationships can propagate the change`), description: tr("Każda relacja ma zapisane źródło: formułę, wzorzec historyczny albo ustawienie użytkownika.", "Each relationship has a recorded source: formula, historical pattern or user setting."), action: "open-simulation" });
    if (unresolvedDependencies.length) findings.push({ id: "dependency-unresolved", severity: "warning", area: "simulation", title: tr(`${unresolvedDependencies.length} możliwych reakcji nie ma policzonej siły wpływu`, `${unresolvedDependencies.length} possible responses have no calculated impact strength`), description: tr("Nazwy wskazują możliwy kierunek, lecz wejście jest stałe albo dane nie pokazują stabilnej reakcji. Ustaw współczynnik ręcznie, jeśli znasz zachowanie procesu.", "Names suggest a possible direction, but the input is constant or the data does not show a stable response. Set the coefficient manually if you know the process behavior."), field: scenario.inputField, action: "open-simulation" });
    const evaluation = executeWhatIfModel(rows, columns, scenario, nodes, edges, dependencyRules, parameters, language);
    simulationReady = evaluation.modelReady && evaluation.direct.affectedRows > 0;
    findings.push({ id: "scenario-summary", severity: "info", area: "simulation", title: tr(`Zmiana objęła ${evaluation.direct.affectedRows.toLocaleString(locale)} rekordów`, `The change affected ${evaluation.direct.affectedRows.toLocaleString(locale)} records`), description: tr(`Przeanalizowano ${evaluation.facts.analyzedFields} kolumn liczbowych: ${evaluation.facts.changedFields} zmienionych, ${evaluation.facts.unchangedFields} bez wykrytej reakcji.`, `${evaluation.facts.analyzedFields} numeric fields analyzed: ${evaluation.facts.changedFields} changed, ${evaluation.facts.unchangedFields} with no detected response.`), action: "open-simulation" });
    if (evaluation.facts.extrapolated) findings.push({ id: "scenario-extrapolation", severity: "warning", area: "simulation", title: tr("Zmieniona wartość wychodzi poza dane historyczne", "The changed value falls outside historical data"), description: tr("Część wartości jest niższa lub wyższa niż wszystko, co występuje w pliku. To fakt techniczny — ocenę przydatności wariantu pozostawiono użytkownikowi.", "Some values are lower or higher than anything in the file. This is a technical fact; the variant's usefulness remains for the user to assess."), action: "open-simulation" });
    if (!evaluation.modelReady) findings.push({ id: "scenario-model-blocked", severity: "critical", area: "simulation", title: tr("Wariant nie przejdzie przez cały model", "The variant cannot pass through the entire model"), description: evaluation.variant.issues[0] ?? tr("Najpierw popraw konfigurację modelu.", "Fix the model configuration first."), action: "open-model" });
  }
  const blocked = !validation.ready || findings.some((finding) => finding.severity === "critical");
  const attention = findings.some((finding) => finding.severity === "warning");
  return { modelReady: validation.ready, simulationReady, status: blocked ? "blocked" : attention ? "attention" : "ready", processedRows: validation.ready ? rows.length : 0, findings };
}
