import { buildThresholdReport, parseNumber, resolveThresholdRule } from "../../charts/engine/chart-engine.ts";
import type { ChartColumn, ChartDefinition, DataRow, ThresholdRule } from "../../charts/types/chart-types";
import { evaluateFormula, evaluateFormulaSeries, referencedFormulaFields, referencedFormulaParameters, validateFormulaExpression } from "./formula-engine.ts";
import type { ModelEdge, ModelExecutionResult, ModelNode, ModelParameter, ModelRuleResult, ModelTransformResult, ModelValidation } from "../types/model-types";

function reachable(from: string, to: string, edges: ModelEdge[]) {
  const queue = [from];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    edges.filter((edge) => edge.from === current).forEach((edge) => queue.push(edge.to));
  }
  return false;
}

function hasCycle(nodes: ModelNode[], edges: ModelEdge[]) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = edges.filter((edge) => edge.from === id).some((edge) => visit(edge.to));
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  return nodes.some((node) => visit(node.id));
}

function orderedNodes(nodes: ModelNode[], edges: ModelEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1));
  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0);
  const ordered: ModelNode[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    ordered.push(node);
    edges.filter((edge) => edge.from === node.id).forEach((edge) => {
      const next = (indegree.get(edge.to) ?? 1) - 1;
      indegree.set(edge.to, next);
      if (next === 0) {
        const target = nodes.find((candidate) => candidate.id === edge.to);
        if (target) queue.push(target);
      }
    });
  }
  return ordered.length === nodes.length ? ordered : nodes;
}

function aggregate(values: number[], calculation: NonNullable<ModelNode["config"]>["calculation"] = "average") {
  if (!values.length) return 0;
  if (calculation === "sum") return values.reduce((sum, item) => sum + item, 0);
  if (calculation === "minimum") return Math.min(...values);
  if (calculation === "maximum") return Math.max(...values);
  if (calculation === "last") return values.at(-1) ?? 0;
  if (calculation === "count") return values.length;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

export function validateDataModel(nodes: ModelNode[], edges: ModelEdge[], headers: string[], parameters: ModelParameter[] = [], language: "pl" | "en" = "pl"): ModelValidation {
  const issues: string[] = [];
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const sources = nodes.filter((node) => node.kind === "source");
  const decisions = nodes.filter((node) => node.kind === "decision");
  const results = nodes.filter((node) => node.kind === "result");
  const metrics = nodes.filter((node) => node.kind === "metric");
  const transforms = nodes.filter((node) => node.kind === "transform");
  const terminalNodes = [...results, ...metrics];
  const generatedFields = transforms.map((node) => node.config?.outputField?.trim()).filter((field): field is string => Boolean(field));
  const availableFields = new Set([...headers, ...generatedFields]);
  const availableParameters = new Set(parameters.map((parameter) => parameter.name.trim().toLowerCase()));
  const validateParameters = (formula: string, title: string) => referencedFormulaParameters(formula).forEach((parameter) => {
    if (!availableParameters.has(parameter.toLowerCase())) issues.push(tr(`Formuła „${title}” używa nieznanego parametru „${parameter}”.`, `Formula “${title}” uses unknown parameter “${parameter}”.`));
  });
  const parameterNames = parameters.map((parameter) => parameter.name.trim().toLowerCase()).filter(Boolean);
  if (parameters.some((parameter) => !parameter.name.trim())) issues.push(tr("Każdy parametr modelu musi mieć nazwę.", "Every model parameter must have a name."));
  if (new Set(parameterNames).size !== parameterNames.length) issues.push(tr("Nazwy parametrów modelu nie mogą się powtarzać.", "Model parameter names must be unique."));
  if (parameters.some((parameter) => !Number.isFinite(parameter.value))) issues.push(tr("Każdy parametr modelu musi mieć poprawną wartość liczbową.", "Every model parameter must have a valid numeric value."));
  if (!sources.length) issues.push(tr("Dodaj źródło danych.", "Add a data source."));
  if (!terminalNodes.length) issues.push(tr("Dodaj metrykę lub blok wyniku.", "Add a metric or result block."));
  if (hasCycle(nodes, edges)) issues.push(tr("Model zawiera pętlę połączeń.", "The model contains a connection loop."));

  nodes.filter((node) => node.kind !== "source").forEach((node) => {
    if (!sources.some((source) => reachable(source.id, node.id, edges))) issues.push(tr(`Połącz źródło z blokiem „${node.title}”.`, `Connect a source to block “${node.title}”.`));
  });

  transforms.forEach((node) => {
    const config = node.config;
    if (!config?.outputField?.trim()) issues.push(tr(`Podaj nazwę wyniku transformacji „${node.title}”.`, `Enter the output name for transformation “${node.title}”.`));
    if ((config?.transformOperation ?? "none") === "formula") {
      if (!config?.formula?.trim()) issues.push(tr(`Wpisz formułę w transformacji „${node.title}”.`, `Enter a formula in transformation “${node.title}”.`));
      else {
        try { const fields = referencedFormulaFields(config.formula); fields.forEach((field) => { if (!availableFields.has(field)) issues.push(tr(`Formuła „${node.title}” używa nieznanej kolumny „${field}”.`, `Formula “${node.title}” uses unknown field “${field}”.`)); }); validateParameters(config.formula, node.title); if (fields.includes(config.outputField?.trim() ?? "")) issues.push(tr(`Formuła „${node.title}” nie może używać własnej kolumny wynikowej.`, `Formula “${node.title}” cannot use its own output field.`)); validateFormulaExpression(config.formula, fields, parameters); }
        catch (reason) { issues.push(tr(`Popraw formułę „${node.title}”: ${reason instanceof Error ? reason.message : "błędna składnia"}`, `Fix formula “${node.title}”: ${reason instanceof Error ? reason.message : "invalid syntax"}`)); }
      }
    } else {
      if (!config?.field || !availableFields.has(config.field)) issues.push(tr(`Wybierz kolumnę w transformacji „${node.title}”.`, `Choose a field in transformation “${node.title}”.`));
      if ((config?.transformOperation ?? "none") === "none") issues.push(tr(`Wybierz operację w transformacji „${node.title}”.`, `Choose an operation in transformation “${node.title}”.`));
    }
  });

  decisions.forEach((node) => {
    const config = node.config;
    if (!config?.field || !availableFields.has(config.field)) issues.push(tr(`Wybierz analizowane pole w regule „${node.title}”.`, `Choose the analyzed field in rule “${node.title}”.`));
    if (!config?.timeField || !availableFields.has(config.timeField)) issues.push(tr(`Wybierz pole czasu w regule „${node.title}”.`, `Choose the time field in rule “${node.title}”.`));
    if ((config?.thresholdMode ?? "percentile") === "manual" && !Number.isFinite(config?.thresholdValue)) issues.push(tr(`Podaj wartość graniczną w regule „${node.title}”.`, `Enter the boundary value in rule “${node.title}”.`));
    if (!terminalNodes.some((result) => result.id !== node.id && reachable(node.id, result.id, edges))) issues.push(tr(`Połącz regułę „${node.title}” z metryką lub wynikiem.`, `Connect rule “${node.title}” to a metric or result.`));
  });

  metrics.forEach((node) => {
    const config = node.config;
    if (!config?.field && !config?.formula?.trim() && !config?.sourceRuleId) issues.push(tr(`Wybierz kolumnę, formułę albo regułę dla metryki „${node.title}”.`, `Choose a field, formula or rule for metric “${node.title}”.`));
  });
  results.forEach((node) => {
    const config = node.config;
    const hasConfiguredUpstream = [...metrics, ...decisions].some((upstream) => reachable(upstream.id, node.id, edges));
    if (!config?.field && !config?.formula?.trim() && !config?.sourceRuleId && !hasConfiguredUpstream) issues.push(tr(`Wybierz kolumnę lub formułę dla wyniku „${node.title}”.`, `Choose a field or formula for result “${node.title}”.`));
  });
  [...metrics, ...results].forEach((node) => {
    const config = node.config;
    if (config?.field && !availableFields.has(config.field)) issues.push(tr(`Pole „${config.field}” w bloku „${node.title}” nie istnieje.`, `Field “${config.field}” in block “${node.title}” does not exist.`));
    if (config?.formula?.trim()) {
      try { const fields = referencedFormulaFields(config.formula); fields.forEach((field) => { if (!availableFields.has(field)) issues.push(tr(`Formuła „${node.title}” używa nieznanej kolumny „${field}”.`, `Formula “${node.title}” uses unknown field “${field}”.`)); }); validateParameters(config.formula, node.title); validateFormulaExpression(config.formula, fields, parameters); }
      catch (reason) { issues.push(tr(`Popraw formułę „${node.title}”: ${reason instanceof Error ? reason.message : "błędna składnia"}`, `Fix formula “${node.title}”: ${reason instanceof Error ? reason.message : "invalid syntax"}`)); }
    }
  });
  return { ready: issues.length === 0, issues: [...new Set(issues)] };
}

export function executeDataModel(
  nodes: ModelNode[],
  edges: ModelEdge[],
  rows: DataRow[],
  columns: ChartColumn[],
  parameters: ModelParameter[] = [],
  language: "pl" | "en" = "pl",
): ModelExecutionResult {
  const startedAt = performance.now();
  const headers = columns.map((column) => column.name);
  const validation = validateDataModel(nodes, edges, headers, parameters, language);
  if (!validation.ready) return { ...validation, processedRows: 0, rules: [], outputs: [], transforms: [] };
  let processedRows = rows.map((row) => ({ ...row }));
  const processedColumns = [...columns];
  const transforms: ModelTransformResult[] = [];
  orderedNodes(nodes, edges).filter((node) => node.kind === "transform").forEach((node) => {
    const config = node.config!;
    const outputField = config.outputField!.trim();
    const beforeValues = config.field ? processedRows.map((row) => parseNumber(row[config.field!])).filter((value): value is number => value != null) : [];
    processedRows = processedRows.map((row) => {
      let value: number | undefined;
      if (config.transformOperation === "formula") {
        try { value = evaluateFormula(config.formula!, row, parameters); }
        catch { value = undefined; }
      } else {
        const current = parseNumber(row[config.field!]);
        if (current != null) {
          if (config.transformOperation === "add") value = current + (config.transformValue ?? 0);
          else if (config.transformOperation === "multiply") value = current * (config.transformValue ?? 1);
          else if (config.transformOperation === "percent") value = current * (1 + (config.transformValue ?? 0) / 100);
        }
      }
      return value == null || !Number.isFinite(value) ? row : { ...row, [outputField]: String(value) };
    });
    const afterValues = processedRows.map((row) => parseNumber(row[outputField])).filter((value): value is number => value != null);
    const beforeAverage = beforeValues.length ? aggregate(beforeValues) : undefined;
    const afterAverage = afterValues.length ? aggregate(afterValues) : undefined;
    transforms.push({ nodeId: node.id, nodeTitle: node.title, outputField, validCount: afterValues.length, beforeAverage, afterAverage, deltaPercent: beforeAverage && afterAverage != null ? (afterAverage / beforeAverage - 1) * 100 : undefined });
    if (!processedColumns.some((column) => column.name === outputField)) processedColumns.push({ name: outputField, type: "number" });
  });
  const rules: ModelRuleResult[] = nodes.filter((node) => node.kind === "decision").map((node) => {
    const config = node.config!;
    const direction = config.direction ?? "above";
    const mode = config.thresholdMode ?? "percentile";
    const threshold: ThresholdRule = {
      id: `model-${node.id}`,
      field: config.field!,
      mode,
      percentile: config.percentile ?? 90,
      direction,
      lower: mode === "manual" && direction === "below" ? config.thresholdValue : undefined,
      upper: mode === "manual" && direction === "above" ? config.thresholdValue : undefined,
      label: mode === "percentile" ? `P${config.percentile ?? 90}` : node.title,
      severity: config.severity ?? "warning",
      evaluation: "raw",
      enabled: true,
    };
    const definition: ChartDefinition = {
      id: `model-chart-${node.id}`,
      title: node.title,
      datasetId: "active-model-data",
      type: "line",
      xField: config.timeField!,
      yFields: [config.field!],
      aggregation: "average",
      filters: [],
      thresholds: [threshold],
      size: "large",
    };
    const resolved = resolveThresholdRule(processedRows, definition, processedColumns, threshold);
    const report = buildThresholdReport(processedRows, definition, processedColumns);
    const allEvents = report.events;
    const values = allEvents.flatMap((event) => event.violations.map((violation) => violation.value));
    const deviations = allEvents.map((event) => event.largestDeviation);
    return {
      nodeId: node.id,
      nodeTitle: node.title,
      field: config.field!,
      boundary: resolved.boundary ?? resolved.upper ?? resolved.lower ?? config.thresholdValue ?? 0,
      thresholdLabel: resolved.label,
      direction,
      severity: config.severity ?? "warning",
      evaluatedPoints: report.evaluatedPoints,
      violationCount: report.violationCount,
      eventCount: allEvents.length,
      firstEvent: allEvents[0] ? { start: allEvents[0].startX, end: allEvents[0].endX } : undefined,
      peakValue: values.length ? (direction === "above" ? Math.max(...values) : Math.min(...values)) : undefined,
      largestDeviation: deviations.length ? deviations.reduce((largest, value) => Math.abs(value) > Math.abs(largest) ? value : largest, 0) : undefined,
    };
  });
  const outputs = nodes.filter((node) => (node.kind === "metric" || node.kind === "result") && (node.config?.field || node.config?.formula || node.config?.sourceRuleId)).map((node) => {
    const calculation = node.config?.calculation ?? "average";
    const sourceRule = rules.find((rule) => rule.nodeId === node.config?.sourceRuleId) ?? rules[0];
    if (calculation === "violations" || calculation === "events") {
      const value = calculation === "violations" ? sourceRule?.violationCount ?? 0 : sourceRule?.eventCount ?? 0;
      return { nodeId: node.id, nodeTitle: node.title, calculation, value, detail: sourceRule ? `${sourceRule.nodeTitle} · ${sourceRule.field}` : "Brak wybranej reguły" };
    }
    const formula = node.config?.formula?.trim();
    const values = formula ? evaluateFormulaSeries(formula, processedRows, parameters).values : processedRows.map((row) => parseNumber(row[node.config?.field ?? ""])).filter((value): value is number => value != null);
    const value = aggregate(values, calculation);
    return { nodeId: node.id, nodeTitle: node.title, field: node.config?.field, calculation, value, detail: `${formula ? "Formuła" : node.config?.field ?? "Brak kolumny"} · ${values.length.toLocaleString("pl-PL")} wartości` };
  });
  return { ready: true, issues: [], processedRows: processedRows.length, rules, outputs, transforms, durationMs: performance.now() - startedAt, executedAt: new Date().toISOString() };
}
