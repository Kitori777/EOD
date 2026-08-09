import type {
  Aggregation,
  ChartColumn,
  ChartDataset,
  ChartDefinition,
  ChartFilter,
  ChartSeries,
  ChartTimeRange,
  DataRow,
  ThresholdEvent,
  ThresholdReport,
  ThresholdRule,
  ThresholdViolation,
} from "../types/chart-types";

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

export function buildChartDataset(
  inputRows: DataRow[],
  definition: ChartDefinition,
  columns: ChartColumn[],
): ChartDataset {
  const rows = inputRows.filter((row) => passesTimeRange(row, definition.timeRange) && definition.filters.every((filter) => passesFilter(row, filter)));
  if (definition.type === "histogram") return buildHistogram(rows, definition);
  if (definition.type === "scatter") return buildScatter(rows, definition);

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
    return definition.yFields.some((field) => parseNumber(row[field]) == null);
  }).length;

  if (definition.seriesField && definition.yFields.length === 1) {
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

function thresholdViolation(x: string, value: number, rule: ThresholdRule): ThresholdViolation | null {
  if (!rule.enabled) return null;
  if (rule.lower != null && value < rule.lower) {
    return { x, value, status: "below", boundary: rule.lower, deviation: value - rule.lower };
  }
  if (rule.upper != null && value > rule.upper) {
    return { x, value, status: "above", boundary: rule.upper, deviation: value - rule.upper };
  }
  return null;
}

function groupViolations(rule: ThresholdRule, violations: Array<ThresholdViolation | null>): ThresholdEvent[] {
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
  const rules = (definition.thresholds ?? []).filter((rule) => rule.enabled && (rule.lower != null || rule.upper != null));
  if (!rules.length) return { events: [], violationCount: 0, evaluatedPoints: 0 };
  const plotted = buildChartDataset(inputRows, definition, columns);
  const xKind = columns.find((column) => column.name === definition.xField)?.type ?? "text";
  const events: ThresholdEvent[] = [];
  let evaluatedPoints = 0;

  rules.forEach((rule) => {
    if (rule.evaluation === "raw") {
      const rows = inputRows
        .filter((row) => passesTimeRange(row, definition.timeRange) && definition.filters.every((filter) => passesFilter(row, filter)))
        .filter((row) => row[definition.xField]?.trim())
        .sort((left, right) => categorySort(left[definition.xField], right[definition.xField], xKind));
      const violations = rows.map((row) => {
        const value = parseNumber(row[rule.field]);
        if (value == null) return null;
        evaluatedPoints += 1;
        return thresholdViolation(row[definition.xField], value, rule);
      });
      events.push(...groupViolations(rule, violations));
      return;
    }
    const series = plotted.series.find((item) => item.name === rule.field);
    if (!series || plotted.categories.length === 0) return;
    const violations = plotted.categories.map((category, index) => {
      const value = series.data[index];
      if (typeof value !== "number") return null;
      evaluatedPoints += 1;
      return thresholdViolation(category, value, rule);
    });
    events.push(...groupViolations(rule, violations));
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
  if (definition.type !== "histogram" && !y.length) errors.push("Wybierz co najmniej jedno pole osi Y.");
  if (definition.type === "histogram" && x?.type !== "number") errors.push("Histogram wymaga liczbowej osi X.");
  if (definition.type === "scatter" && (x?.type !== "number" || y[0]?.type !== "number")) errors.push("Wykres punktowy wymaga liczbowych osi X i Y.");
  if (["line", "area"].includes(definition.type) && x && !["date", "number"].includes(x.type)) errors.push("Dla trendu wybierz datę lub uporządkowaną kolumnę liczbową na osi X.");
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
    if (rule.lower == null && rule.upper == null) errors.push(`Uzupełnij co najmniej jedną granicę dla „${rule.field}”.`);
    if (rule.lower != null && rule.upper != null && rule.lower >= rule.upper) errors.push(`Dolny limit „${rule.field}” musi być mniejszy od górnego.`);
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
