import type {
  Aggregation,
  ChartColumn,
  ChartDataset,
  ChartDefinition,
  ChartFilter,
  ChartSeries,
  ChartTimeRange,
  DataRow,
  ResolvedThresholdRule,
  ThresholdEvent,
  ThresholdReport,
  ThresholdRule,
  ThresholdViolation,
} from "../types/chart-types";
import { evaluateFormula, referencedFormulaFields, validateFormulaExpression } from "../../modeling/engine/formula-engine.ts";

const collator = new Intl.Collator("pl", { numeric: true, sensitivity: "base" });

export function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function passesFilter(row: DataRow, filter: ChartFilter): boolean {
  if (!filter.field || !filter.value) return true;
  const raw = row[filter.field] ?? "";
  if (filter.operator === "equals") return raw.toLocaleLowerCase("pl") === filter.value.toLocaleLowerCase("pl");
  if (filter.operator === "contains") return raw.toLocaleLowerCase("pl").includes(filter.value.toLocaleLowerCase("pl"));
  const left = parseNumber(raw);
  const right = parseNumber(filter.value);
  if (left == null || right == null) return false;
  return filter.operator === "greater" ? left > right : left < right;
}

export function passesTimeRange(row: DataRow, range?: ChartTimeRange): boolean {
  if (!range?.field || (!range.from && !range.to)) return true;
  const value = Date.parse(row[range.field] ?? "");
  if (Number.isNaN(value)) return false;
  const from = range.from ? Date.parse(range.from) : null;
  const to = range.to ? Date.parse(range.to) : null;
  if (from != null && !Number.isNaN(from) && value < from) return false;
  if (to != null && !Number.isNaN(to) && value > to) return false;
  return true;
}

function aggregate(values: number[], mode: Aggregation): number | null {
  if (mode === "count") return values.length;
  if (!values.length) return null;
  if (mode === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (mode === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mode === "min") return Math.min(...values);
  return Math.max(...values);
}

function categorySort(left: string, right: string, kind: ChartColumn["type"]): number {
  if (kind === "date") {
    const leftDate = Date.parse(left);
    const rightDate = Date.parse(right);
    if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate - rightDate;
  }
  if (kind === "number") {
    const leftNumber = parseNumber(left);
    const rightNumber = parseNumber(right);
    if (leftNumber != null && rightNumber != null) return leftNumber - rightNumber;
  }
  return collator.compare(left, right);
}

function buildHistogram(rows: DataRow[], definition: ChartDefinition): ChartDataset {
  const values = rows.map((row) => parseNumber(row[definition.xField])).filter((value): value is number => value != null);
  if (!values.length) return { categories: [], series: [{ name: "Liczba rekordów", data: [] }], rejectedRows: rows.length, sourceRows: rows.length };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binCount = Math.max(4, Math.min(18, Math.ceil(Math.sqrt(values.length))));
  const width = max === min ? 1 : (max - min) / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  values.forEach((value) => {
    const index = max === min ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  });
  const formatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
  const categories = counts.map((_, index) => {
    const start = min + width * index;
    const end = start + width;
    return `${formatter.format(start)}–${formatter.format(end)}`;
  });
  return {
    categories,
    series: [{ name: "Liczba rekordów", data: counts }],
    rejectedRows: rows.length - values.length,
    sourceRows: rows.length,
  };
}

function buildScatter(rows: DataRow[], definition: ChartDefinition): ChartDataset {
  const yField = definition.yFields[0];
  const groups = new Map<string, Array<[number, number]>>();
  let rejectedRows = 0;
  rows.forEach((row) => {
    const x = parseNumber(row[definition.xField]);
    const y = parseNumber(row[yField]);
    if (x == null || y == null) {
      rejectedRows += 1;
      return;
    }
    const group = definition.seriesField ? row[definition.seriesField] || "Brak wartości" : yField;
    const points = groups.get(group) ?? [];
    points.push([x, y]);
    groups.set(group, points);
  });
  return {
    categories: [],
    series: Array.from(groups, ([name, data]) => ({ name, data })),
    rejectedRows,
    sourceRows: rows.length,
  };
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function buildBoxplot(rows: DataRow[], definition: ChartDefinition, columns: ChartColumn[]): ChartDataset {
  const xKind = columns.find((column) => column.name === definition.xField)?.type ?? "text";
  const field = definition.yFields[0];
  const grouped = new Map<string, number[]>();
  rows.forEach((row) => {
    const category = row[definition.xField]?.trim();
    const value = parseNumber(row[field]);
    if (!category || value == null) return;
    const values = grouped.get(category) ?? [];
    values.push(value);
    grouped.set(category, values);
  });
  const categories = [...grouped.keys()].sort((left, right) => categorySort(left, right, xKind));
  const data: Array<[number, number, number, number, number]> = categories.map((category) => {
    const values = grouped.get(category) ?? [];
    return [Math.min(...values), quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75), Math.max(...values)];
  });
  return { categories, series: [{ name: field, data, renderType: "boxplot" }], rejectedRows: rows.length - data.length, sourceRows: rows.length };
}

function buildHeatmap(rows: DataRow[], definition: ChartDefinition, columns: ChartColumn[]): ChartDataset {
  const yCategoryField = definition.seriesField;
  const valueField = definition.yFields[0];
  if (!yCategoryField || !valueField) return { categories: [], secondaryCategories: [], series: [], rejectedRows: rows.length, sourceRows: rows.length };
  const xKind = columns.find((column) => column.name === definition.xField)?.type ?? "text";
  const xCategories = [...new Set(rows.map((row) => row[definition.xField]?.trim()).filter(Boolean) as string[])].sort((left, right) => categorySort(left, right, xKind)).slice(0, 80);
  const yCategories = [...new Set(rows.map((row) => row[yCategoryField]?.trim()).filter(Boolean) as string[])].sort(collator.compare).slice(0, 60);
  const buckets = new Map<string, number[]>();
  rows.forEach((row) => {
    const x = row[definition.xField]?.trim();
    const y = row[yCategoryField]?.trim();
    const value = parseNumber(row[valueField]);
    if (!x || !y || value == null) return;
    const xIndex = xCategories.indexOf(x);
    const yIndex = yCategories.indexOf(y);
    if (xIndex < 0 || yIndex < 0) return;
    const key = `${xIndex}:${yIndex}`;
    const values = buckets.get(key) ?? [];
    values.push(value);
    buckets.set(key, values);
  });
  const data: Array<[number, number, number]> = [];
  buckets.forEach((values, key) => {
    const [x, y] = key.split(":").map(Number);
    data.push([x, y, aggregate(values, definition.aggregation) ?? 0]);
  });
  return { categories: xCategories, secondaryCategories: yCategories, series: [{ name: valueField, data, renderType: "heatmap" }], rejectedRows: rows.length - data.length, sourceRows: rows.length };
}

export function buildChartDataset(
  inputRows: DataRow[],
  definition: ChartDefinition,
  columns: ChartColumn[],
): ChartDataset {
  const rows = inputRows.filter((row) => passesTimeRange(row, definition.timeRange) && definition.filters.every((filter) => passesFilter(row, filter)));
  if (definition.type === "histogram") return buildHistogram(rows, definition);
  if (definition.type === "scatter") return buildScatter(rows, definition);
  if (definition.type === "boxplot") return buildBoxplot(rows, definition, columns);
  if (definition.type === "heatmap") return buildHeatmap(rows, definition, columns);

  const xKind = columns.find((column) => column.name === definition.xField)?.type ?? "text";
  const grouped = new Map<string, DataRow[]>();
  rows.forEach((row) => {
    const category = row[definition.xField]?.trim();
    if (!category) return;
    const groupRows = grouped.get(category) ?? [];
    groupRows.push(row);
    grouped.set(category, groupRows);
  });
  const categories = Array.from(grouped.keys()).sort((left, right) => categorySort(left, right, xKind));
  const series: ChartSeries[] = [];
  const rejectedRows = rows.filter((row) => {
    if (!row[definition.xField]?.trim()) return true;
    if (definition.formula?.expression.trim()) {
      try { evaluateFormula(definition.formula.expression, row); return false; }
      catch { return true; }
    }
    return definition.yFields.some((field) => parseNumber(row[field]) == null);
  }).length;

  if (definition.formula?.expression.trim()) {
    const formulaLabel = definition.formula.label.trim() || "Własne obliczenie";
    const evaluateRows = (categoryRows: DataRow[]) => {
      const values: number[] = [];
      categoryRows.forEach((row) => {
        try { values.push(evaluateFormula(definition.formula!.expression, row)); }
        catch { /* Błędny rekord jest uwzględniony w rejectedRows. */ }
      });
      return aggregate(values, definition.aggregation);
    };
    if (definition.seriesField) {
      const seriesNames = Array.from(new Set(rows.map((row) => row[definition.seriesField!] || "Brak wartości"))).sort(collator.compare);
      seriesNames.forEach((seriesName) => {
        const data = categories.map((category) => evaluateRows((grouped.get(category) ?? []).filter((row) => (row[definition.seriesField!] || "Brak wartości") === seriesName)));
        series.push({ name: seriesName, data });
      });
    } else {
      series.push({ name: formulaLabel, data: categories.map((category) => evaluateRows(grouped.get(category) ?? [])) });
    }
  } else if (definition.seriesField && definition.yFields.length === 1) {
    const seriesNames = Array.from(new Set(rows.map((row) => row[definition.seriesField!] || "Brak wartości"))).sort(collator.compare);
    seriesNames.forEach((seriesName) => {
      const data = categories.map((category) => {
        const categoryRows = (grouped.get(category) ?? []).filter((row) => (row[definition.seriesField!] || "Brak wartości") === seriesName);
        const values = categoryRows.map((row) => parseNumber(row[definition.yFields[0]])).filter((value): value is number => value != null);
        return aggregate(values, definition.aggregation);
      });
      series.push({ name: seriesName, data });
    });
  } else {
    definition.yFields.forEach((field) => {
      const data = categories.map((category) => {
        const values = (grouped.get(category) ?? []).map((row) => parseNumber(row[field])).filter((value): value is number => value != null);
        return aggregate(values, definition.aggregation);
      });
      series.push({ name: field, data });
    });
  }

  if (definition.type === "pareto" && series[0]) {
    const pairs = categories.map((category, index) => ({ category, value: typeof series[0].data[index] === "number" ? series[0].data[index] as number : 0 })).sort((a, b) => b.value - a.value);
    categories.splice(0, categories.length, ...pairs.map((pair) => pair.category));
    const total = pairs.reduce((sum, pair) => sum + Math.max(0, pair.value), 0);
    let cumulative = 0;
    series.splice(0, series.length,
      { name: series[0].name, data: pairs.map((pair) => pair.value), renderType: "bar" },
      { name: "Skumulowany %", data: pairs.map((pair) => total ? (cumulative += Math.max(0, pair.value)) / total * 100 : 0), renderType: "line", yAxisIndex: 1 },
    );
  }

  if (definition.type === "waterfall" && series[0]) {
    const name = series[0].name;
    const values = series[0].data.map((value) => typeof value === "number" ? value : 0);
    let running = 0;
    const assist = values.map((value) => {
      const start = value >= 0 ? running : running + value;
      running += value;
      return start;
    });
    series.splice(0, series.length,
      { name: "Baza", data: assist, renderType: "bar", stack: "waterfall", hidden: true },
      { name, data: values.map(Math.abs), renderType: "bar", stack: "waterfall" },
    );
  }

  if (definition.type === "control" && series[0]) {
    const values = series[0].data.filter((value): value is number => typeof value === "number");
    if (values.length) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1));
      const sigma = definition.diagnostic?.controlSigma ?? 3;
      series.push(
        { name: "Średnia", data: categories.map(() => mean), renderType: "line" },
        { name: "Górna granica", data: categories.map(() => mean + sigma * deviation), renderType: "line" },
        { name: "Dolna granica", data: categories.map(() => mean - sigma * deviation), renderType: "line" },
      );
    }
  }

  if (definition.type === "forecast" && series[0]) {
    const observed = series[0].data.map((value) => typeof value === "number" ? value : null);
    const numeric = observed.filter((value): value is number => value != null);
    const horizon = Math.max(1, Math.min(24, definition.diagnostic?.forecastHorizon ?? 6));
    if (numeric.length >= 8) {
      const recent = numeric.slice(-Math.min(12, numeric.length));
      const slope = recent.length > 1 ? (recent.at(-1)! - recent[0]) / (recent.length - 1) : 0;
      const last = numeric.at(-1)!;
      const residual = recent.map((value, index) => value - (recent[0] + slope * index));
      const band = 1.96 * Math.sqrt(residual.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, residual.length - 1));
      const future = Array.from({ length: horizon }, (_, index) => last + slope * (index + 1));
      const lastCategory = categories.at(-1) ?? "";
      categories.push(...Array.from({ length: horizon }, (_, index) => `${lastCategory} +${index + 1}`));
      series[0].data = [...observed, ...Array.from({ length: horizon }, () => null)];
      series.push(
        { name: "Prognoza", data: [...Array.from({ length: observed.length - 1 }, () => null), last, ...future], renderType: "line" },
        { name: "Dolna granica", data: [...Array.from({ length: observed.length }, () => null), ...future.map((value) => value - band)], renderType: "line", areaBand: true },
        { name: "Górna granica", data: [...Array.from({ length: observed.length }, () => null), ...future.map((value) => value + band)], renderType: "line", areaBand: true },
      );
    }
  }

  let comparison: ChartDataset["comparison"];
  const referenceField = definition.comparison?.referenceField;
  const targetField = definition.yFields.find((field) => field !== referenceField);
  if (referenceField && targetField) {
    const referenceSeries = series.find((item) => item.name === referenceField);
    const targetSeries = series.find((item) => item.name === targetField);
    const referenceValues = (referenceSeries?.data ?? []).filter((value): value is number => typeof value === "number");
    const targetValues = (targetSeries?.data ?? []).filter((value): value is number => typeof value === "number");
    const referenceValue = referenceValues.at(-1);
    const targetValue = targetValues.at(-1);
    if (referenceValue != null && targetValue != null) {
      const difference = targetValue - referenceValue;
      comparison = {
        targetField,
        referenceField,
        targetValue,
        referenceValue,
        difference,
        percent: referenceValue === 0 ? null : (difference / referenceValue) * 100,
      };
    }
  }

  return { categories, series, rejectedRows, sourceRows: rows.length, comparison };
}

export function resolveThresholdRule(
  inputRows: DataRow[],
  definition: ChartDefinition,
  columns: ChartColumn[],
  rule: ThresholdRule,
): ResolvedThresholdRule {
  const mode = rule.mode ?? "manual";
  if (mode === "manual") {
    return {
      lower: rule.lower,
      upper: rule.upper,
      label: rule.label?.trim() || (rule.lower != null && rule.upper != null ? "Zakres" : "Limit"),
      mode,
    };
  }

  const coverage = Math.max(1, Math.min(99, rule.percentile ?? 90));
  const direction = rule.direction ?? "above";
  // A selected 90% monitoring level means an upper P90 boundary or a lower
  // P10 boundary. Reusing P90 for the lower tail would mark about 90% of the
  // observations as alerts, which is mathematically valid but diagnostically
  // misleading.
  const percentile = direction === "below" ? 100 - coverage : coverage;
  const fraction = percentile / 100;
  let values: number[] = [];
  if (rule.evaluation === "raw") {
    values = inputRows
      .filter((row) => passesTimeRange(row, definition.timeRange) && definition.filters.every((filter) => passesFilter(row, filter)))
      .map((row) => parseNumber(row[rule.field]))
      .filter((value): value is number => value != null);
  } else {
    const dataset = buildChartDataset(inputRows, definition, columns);
    const series = dataset.series.find((item) => item.name === rule.field);
    values = (series?.data ?? []).filter((value): value is number => typeof value === "number");
  }
  const customLabel = rule.label?.trim();
  const autoLabel = !customLabel || /^P\d+(?:[.,]\d+)?$/i.test(customLabel);
  const label = autoLabel
    ? `P${percentile} · ${direction === "below" ? "dolny" : "górny"} próg (${coverage}%)`
    : `${customLabel} · P${percentile}`;
  if (!values.length) return { label, mode, percentile, coverage };
  const boundary = quantile(values, fraction);
  return {
    boundary,
    lower: direction === "below" ? boundary : undefined,
    upper: direction === "above" ? boundary : undefined,
    percentile,
    coverage,
    label,
    mode,
  };
}

function thresholdViolation(x: string, value: number, rule: ThresholdRule, resolved: ResolvedThresholdRule): ThresholdViolation | null {
  if (!rule.enabled) return null;
  if (resolved.lower != null && value <= resolved.lower) {
    return { x, value, status: "below", boundary: resolved.lower, deviation: value - resolved.lower };
  }
  if (resolved.upper != null && value >= resolved.upper) {
    return { x, value, status: "above", boundary: resolved.upper, deviation: value - resolved.upper };
  }
  return null;
}

function groupViolations(rule: ThresholdRule, resolved: ResolvedThresholdRule, violations: Array<ThresholdViolation | null>): ThresholdEvent[] {
  const events: ThresholdEvent[] = [];
  let current: ThresholdViolation[] = [];
  const flush = () => {
    if (!current.length) return;
    const status = current[0].status;
    events.push({
      id: `${rule.id}-${events.length + 1}`,
      ruleId: rule.id,
      field: rule.field,
      status,
      startX: current[0].x,
      endX: current.at(-1)?.x ?? current[0].x,
      pointCount: current.length,
      minimum: Math.min(...current.map((item) => item.value)),
      maximum: Math.max(...current.map((item) => item.value)),
      largestDeviation: current.reduce((largest, item) => Math.abs(item.deviation) > Math.abs(largest) ? item.deviation : largest, 0),
      label: resolved.label,
      severity: rule.severity ?? "warning",
      description: rule.description,
      thresholdMode: resolved.mode,
      violations: current,
    });
    current = [];
  };
  violations.forEach((violation) => {
    if (!violation) {
      flush();
      return;
    }
    if (current.length && current[0].status !== violation.status) flush();
    current.push(violation);
  });
  flush();
  return events;
}

export function buildThresholdReport(
  inputRows: DataRow[],
  definition: ChartDefinition,
  columns: ChartColumn[],
): ThresholdReport {
  const rules = (definition.thresholds ?? []).filter((rule) => rule.enabled && ((rule.mode ?? "manual") === "percentile" || rule.lower != null || rule.upper != null));
  if (!rules.length) return { events: [], violationCount: 0, evaluatedPoints: 0 };
  const plotted = buildChartDataset(inputRows, definition, columns);
  const xKind = columns.find((column) => column.name === definition.xField)?.type ?? "text";
  const events: ThresholdEvent[] = [];
  let evaluatedPoints = 0;

  rules.forEach((rule) => {
    const resolved = resolveThresholdRule(inputRows, definition, columns, rule);
    if (resolved.lower == null && resolved.upper == null) return;
    if (rule.evaluation === "raw") {
      const rows = inputRows
        .filter((row) => passesTimeRange(row, definition.timeRange) && definition.filters.every((filter) => passesFilter(row, filter)))
        .filter((row) => row[definition.xField]?.trim())
        .sort((left, right) => categorySort(left[definition.xField], right[definition.xField], xKind));
      const violations = rows.map((row) => {
        const value = parseNumber(row[rule.field]);
        if (value == null) return null;
        evaluatedPoints += 1;
        return thresholdViolation(row[definition.xField], value, rule, resolved);
      });
      events.push(...groupViolations(rule, resolved, violations));
      return;
    }
    const series = plotted.series.find((item) => item.name === rule.field);
    if (!series || plotted.categories.length === 0) return;
    const violations = plotted.categories.map((category, index) => {
      const value = series.data[index];
      if (typeof value !== "number") return null;
      evaluatedPoints += 1;
      return thresholdViolation(category, value, rule, resolved);
    });
    events.push(...groupViolations(rule, resolved, violations));
  });
  return {
    events,
    violationCount: events.reduce((sum, event) => sum + event.violations.length, 0),
    evaluatedPoints,
  };
}

export function validateChartDefinition(definition: ChartDefinition, columns: ChartColumn[]): string[] {
  const errors: string[] = [];
  const x = columns.find((column) => column.name === definition.xField);
  const y = columns.filter((column) => definition.yFields.includes(column.name));
  if (!x) errors.push("Wybierz pole osi X.");
  const usesFormula = Boolean(definition.formula?.expression.trim());
  if (definition.type !== "histogram" && !usesFormula && !y.length) errors.push("Wybierz co najmniej jedno pole osi Y albo wpisz własną formułę.");
  if (usesFormula) {
    try {
      const fields = referencedFormulaFields(definition.formula!.expression);
      if (!fields.length) errors.push("Formuła musi używać co najmniej jednej kolumny, np. [Wartość].");
      const available = new Set(columns.map((column) => column.name));
      const missing = fields.filter((field) => !available.has(field));
      if (missing.length) errors.push(`Formuła używa brakujących kolumn: ${[...new Set(missing)].join(", ")}.`);
      else validateFormulaExpression(definition.formula!.expression, columns.map((column) => column.name));
    } catch (reason) {
      errors.push(reason instanceof Error ? `Błąd formuły: ${reason.message}` : "Błąd formuły.");
    }
  }
  if (definition.type === "histogram" && x?.type !== "number") errors.push("Histogram wymaga liczbowej osi X.");
  if (definition.type === "scatter" && (x?.type !== "number" || y[0]?.type !== "number")) errors.push("Wykres punktowy wymaga liczbowych osi X i Y.");
  if (["line", "area", "control", "forecast"].includes(definition.type) && x && !["date", "number"].includes(x.type)) errors.push("Dla trendu wybierz datę lub uporządkowaną kolumnę liczbową na osi X.");
  if (definition.type === "heatmap" && !definition.seriesField) errors.push("Mapa cieplna wymaga pola wierszy w opcji podziału na serie.");
  if (["boxplot", "pareto", "waterfall", "control", "forecast", "heatmap"].includes(definition.type) && !usesFormula && definition.yFields.length !== 1) errors.push("Ten rodzaj analizy wymaga dokładnie jednej wartości Y.");
  if (definition.type !== "histogram" && y.some((column) => column.type !== "number")) errors.push("Oś Y musi zawierać wartości liczbowe.");
  if (definition.seriesField && definition.yFields.length > 1) errors.push("Podział na serie działa z jednym polem Y.");
  if (definition.timeRange) {
    const timeColumn = columns.find((column) => column.name === definition.timeRange?.field);
    if (!timeColumn) errors.push("Wybierz istniejącą kolumnę czasu.");
    else if (timeColumn.type !== "date") errors.push("Zakres czasu wymaga kolumny rozpoznanej jako data.");
    const from = definition.timeRange.from ? Date.parse(definition.timeRange.from) : null;
    const to = definition.timeRange.to ? Date.parse(definition.timeRange.to) : null;
    if (from != null && to != null && !Number.isNaN(from) && !Number.isNaN(to) && from > to) errors.push("Początek zakresu czasu musi być wcześniejszy niż koniec.");
  }
  (definition.thresholds ?? []).forEach((rule) => {
    if (!definition.yFields.includes(rule.field)) errors.push(`Limit wskazuje niedostępną serię „${rule.field}”.`);
    if ((rule.mode ?? "manual") === "manual" && rule.lower == null && rule.upper == null) errors.push(`Uzupełnij co najmniej jedną granicę dla „${rule.field}”.`);
    if ((rule.mode ?? "manual") === "manual" && rule.lower != null && rule.upper != null && rule.lower >= rule.upper) errors.push(`Dolny limit „${rule.field}” musi być mniejszy od górnego.`);
    if ((rule.mode ?? "manual") === "percentile" && ((rule.percentile ?? 90) <= 0 || (rule.percentile ?? 90) >= 100)) errors.push(`Percentyl „${rule.field}” musi być między 1 a 99.`);
  });
  return errors;
}

export function createChartDraft(columns: ChartColumn[], datasetId: string): ChartDefinition {
  const date = columns.find((column) => column.type === "date");
  const numbers = columns.filter((column) => column.type === "number");
  const xField = date?.name ?? columns[0]?.name ?? "";
  const yFields = numbers.filter((column) => column.name !== xField).slice(0, 2).map((column) => column.name);
  return {
    id: `chart-${Date.now()}`,
    title: yFields.length ? `${yFields.join(" i ")} według ${xField}` : "Nowy wykres",
    datasetId,
    type: date ? "line" : "bar",
    xField,
    yFields,
    aggregation: "sum",
    filters: [],
    thresholds: [],
    size: "medium",
  };
}
