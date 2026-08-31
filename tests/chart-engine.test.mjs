import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartDataset,
  buildThresholdReport,
  createChartDraft,
  parseNumber,
  resolveThresholdRule,
  validateChartDefinition,
} from "../src/mechanics/charts/engine/chart-engine.ts";
import {
  applyTemplateToDataset,
  createDashboardTemplate,
  remapChartFields,
} from "../src/mechanics/charts/templates/dashboard-templates.ts";

const columns = [
  { name: "month", type: "date" },
  { name: "region", type: "text" },
  { name: "revenue", type: "number" },
  { name: "cost", type: "number" },
];

const rows = [
  { month: "2026-02", region: "Północ", revenue: "200", cost: "120" },
  { month: "2026-01", region: "Północ", revenue: "100", cost: "70" },
  { month: "2026-01", region: "Południe", revenue: "50", cost: "40" },
  { month: "2026-02", region: "Południe", revenue: "250,5", cost: "130" },
];

function definition(patch = {}) {
  return {
    id: "test",
    title: "Test",
    datasetId: "data",
    type: "line",
    xField: "month",
    yFields: ["revenue", "cost"],
    aggregation: "sum",
    filters: [],
    thresholds: [],
    size: "medium",
    ...patch,
  };
}

test("parses Polish decimal values and rejects malformed numbers", () => {
  assert.equal(parseNumber("1 234,50"), 1234.5);
  assert.equal(parseNumber("brak"), null);
  assert.equal(parseNumber(""), null);
});

test("reports exact below and above threshold occurrences and groups consecutive events", () => {
  const limitRows = [
    { month: "2026-01-01", revenue: "89" },
    { month: "2026-01-02", revenue: "80" },
    { month: "2026-01-03", revenue: "90" },
    { month: "2026-01-04", revenue: "110" },
    { month: "2026-01-05", revenue: "120" },
  ];
  const report = buildThresholdReport(limitRows, definition({
    yFields: ["revenue"],
    thresholds: [{ id: "safe-range", field: "revenue", lower: 90, upper: 110, evaluation: "raw", enabled: true }],
  }), columns);
  assert.equal(report.violationCount, 5);
  assert.equal(report.events.length, 2);
  assert.deepEqual(report.events.map((event) => [event.status, event.startX, event.endX]), [
    ["below", "2026-01-01", "2026-01-03"],
    ["above", "2026-01-04", "2026-01-05"],
  ]);
  assert.equal(report.events[0].largestDeviation, -10);
  assert.equal(report.events[0].violations.at(-1).deviation, 0);
  assert.equal(report.events[1].violations[0].deviation, 0);
});

test("resolves a P90 reference line and reports only values above it", () => {
  const percentileRows = Array.from({ length: 10 }, (_, index) => ({ month: `2026-01-${String(index + 1).padStart(2, "0")}`, revenue: String(index + 1) }));
  const percentileDefinition = definition({
    yFields: ["revenue"],
    thresholds: [{ id: "p90", field: "revenue", mode: "percentile", percentile: 90, direction: "above", label: "P90", severity: "warning", evaluation: "raw", enabled: true }],
  });
  const resolved = resolveThresholdRule(percentileRows, percentileDefinition, columns, percentileDefinition.thresholds[0]);
  assert.equal(resolved.upper, 9.1);
  const report = buildThresholdReport(percentileRows, percentileDefinition, columns);
  assert.equal(report.violationCount, 1);
  assert.equal(report.events[0].startX, "2026-01-10");
  assert.equal(report.events[0].label, "P90 · górny próg (90%)");
});

test("uses the lower P10 boundary when a 90% percentile alert monitors values below", () => {
  const percentileRows = Array.from({ length: 10 }, (_, index) => ({ month: `2026-01-${String(index + 1).padStart(2, "0")}`, revenue: String(index + 1) }));
  const percentileDefinition = definition({
    yFields: ["revenue"],
    thresholds: [{ id: "lower-90", field: "revenue", mode: "percentile", percentile: 90, direction: "below", label: "P90", severity: "warning", evaluation: "raw", enabled: true }],
  });
  const resolved = resolveThresholdRule(percentileRows, percentileDefinition, columns, percentileDefinition.thresholds[0]);
  assert.equal(resolved.percentile, 10);
  assert.equal(resolved.lower, 1.9);
  assert.equal(resolved.label, "P10 · dolny próg (90%)");
  const report = buildThresholdReport(percentileRows, percentileDefinition, columns);
  assert.equal(report.violationCount, 1);
  assert.equal(report.events[0].status, "below");
  assert.equal(report.events[0].startX, "2026-01-01");
});

test("moves a dashboard template to another file with automatic and manual column mapping", () => {
  const template = createDashboardTemplate("Sprzedaż", 4, [definition({ xField: "Data", yFields: ["Przychód"], thresholds: [{ id: "limit", field: "Przychód", lower: 90, upper: 110, evaluation: "raw", enabled: true }] })]);
  const targetColumns = [{ name: "data", type: "date" }, { name: "revenue", type: "number" }];
  const applied = applyTemplateToDataset(template, targetColumns, "new-data");
  assert.deepEqual(applied.missing, ["Przychód"]);
  assert.equal(applied.charts[0].xField, "data");
  const remapped = remapChartFields(applied.charts, { "Przychód": "revenue" }, "new-data");
  assert.deepEqual(remapped[0].yFields, ["revenue"]);
  assert.equal(remapped[0].thresholds[0].field, "revenue");
});

test("dashboard templates preserve all chart sets and two-sided thresholds", () => {
  const charts = Array.from({ length: 8 }, (_, index) => definition({
    id: `chart-${index + 1}`,
    title: `Wykres ${index + 1}`,
    yFields: ["revenue"],
    thresholds: [{ id: `range-${index}`, field: "revenue", mode: "manual", lower: 40, upper: 60, label: "Zakres pracy", evaluation: "raw", enabled: true }],
  }));
  const template = createDashboardTemplate("Dwa zestawy", 4, charts);
  charts[0].thresholds[0].lower = 0;
  assert.equal(template.charts.length, 8);
  assert.equal(template.charts[0].thresholds[0].lower, 40);
  assert.equal(template.charts[7].title, "Wykres 8");
});

test("groups, aggregates and chronologically sorts a time chart", () => {
  const result = buildChartDataset(rows, definition(), columns);
  assert.deepEqual(result.categories, ["2026-01", "2026-02"]);
  assert.deepEqual(result.series[0], { name: "revenue", data: [150, 450.5] });
  assert.deepEqual(result.series[1], { name: "cost", data: [110, 250] });
});

test("calculates a user formula for every record and aggregates it by X", () => {
  const custom = definition({
    yFields: [],
    formula: { expression: "[revenue] - [cost]", label: "Marża" },
  });
  assert.deepEqual(validateChartDefinition(custom, columns), []);
  const result = buildChartDataset(rows, custom, columns);
  assert.deepEqual(result.categories, ["2026-01", "2026-02"]);
  assert.deepEqual(result.series[0], { name: "Marża", data: [40, 200.5] });
});

test("reports missing fields in a custom chart formula", () => {
  const errors = validateChartDefinition(definition({ yFields: [], formula: { expression: "[missing] * 2", label: "Test" } }), columns);
  assert.match(errors.join(" "), /brakujących kolumn: missing/);
});

test("splits a single measure into named series", () => {
  const result = buildChartDataset(rows, definition({ yFields: ["revenue"], seriesField: "region" }), columns);
  assert.deepEqual(result.series.map((series) => series.name), ["Południe", "Północ"]);
  assert.deepEqual(result.series[0].data, [50, 250.5]);
});

test("applies a filter before aggregation", () => {
  const result = buildChartDataset(rows, definition({ filters: [{ field: "region", operator: "equals", value: "Północ" }] }), columns);
  assert.deepEqual(result.series[0].data, [100, 200]);
  assert.equal(result.sourceRows, 2);
});

test("limits a chart and threshold report to the selected time range", () => {
  const timedRows = [
    { month: "2026-07-01T08:00:00Z", revenue: "80", cost: "50" },
    { month: "2026-07-01T09:00:00Z", revenue: "95", cost: "60" },
    { month: "2026-07-01T10:00:00Z", revenue: "120", cost: "70" },
  ];
  const rangedDefinition = definition({
    yFields: ["revenue"],
    timeRange: { field: "month", from: "2026-07-01T08:30:00Z", to: "2026-07-01T10:00:00Z" },
    thresholds: [{ id: "limit", field: "revenue", lower: 90, upper: 110, evaluation: "raw", enabled: true }],
  });
  const dataset = buildChartDataset(timedRows, rangedDefinition, columns);
  assert.deepEqual(dataset.categories, ["2026-07-01T09:00:00Z", "2026-07-01T10:00:00Z"]);
  const report = buildThresholdReport(timedRows, rangedDefinition, columns);
  assert.equal(report.violationCount, 1);
  assert.equal(report.events[0].startX, "2026-07-01T10:00:00Z");
});

test("counts a malformed record only once when several Y fields are missing", () => {
  const malformed = [...rows, { month: "2026-03", region: "Północ", revenue: "brak", cost: "" }];
  const result = buildChartDataset(malformed, definition(), columns);
  assert.equal(result.rejectedRows, 1);
});

test("calculates absolute and percent difference against a reference series", () => {
  const result = buildChartDataset(rows, definition({ comparison: { referenceField: "cost", mode: "percent" } }), columns);
  assert.equal(result.comparison?.difference, 200.5);
  assert.equal(result.comparison?.percent, 80.2);
});

test("builds histogram bins whose counts cover all valid values", () => {
  const result = buildChartDataset(rows, definition({ type: "histogram", xField: "revenue", yFields: [] }), columns);
  const total = result.series[0].data.reduce((sum, value) => sum + value, 0);
  assert.equal(total, rows.length);
  assert.ok(result.categories.length >= 4);
});

test("validates incompatible axis mappings and creates a useful default", () => {
  const invalid = validateChartDefinition(definition({ type: "scatter", xField: "month" }), columns);
  assert.match(invalid.join(" "), /liczbowych osi X i Y/);
  const draft = createChartDraft(columns, "data");
  assert.equal(draft.xField, "month");
  assert.deepEqual(draft.yFields, ["revenue", "cost"]);
});

test("builds diagnostic boxplot, heatmap, Pareto and control datasets", () => {
  const boxplot = buildChartDataset(rows, definition({ type: "boxplot", xField: "region", yFields: ["revenue"] }), columns);
  assert.equal(boxplot.series[0].renderType, "boxplot");
  assert.equal(boxplot.series[0].data[0].length, 5);

  const heatmap = buildChartDataset(rows, definition({ type: "heatmap", xField: "month", yFields: ["revenue"], seriesField: "region" }), columns);
  assert.equal(heatmap.series[0].renderType, "heatmap");
  assert.equal(heatmap.secondaryCategories.length, 2);

  const pareto = buildChartDataset(rows, definition({ type: "pareto", xField: "region", yFields: ["revenue"] }), columns);
  assert.deepEqual(pareto.series.map((series) => series.renderType), ["bar", "line"]);
  assert.equal(pareto.series[1].data.at(-1), 100);

  const control = buildChartDataset(rows, definition({ type: "control", yFields: ["revenue"] }), columns);
  assert.deepEqual(control.series.slice(1).map((series) => series.name), ["Średnia", "Górna granica", "Dolna granica"]);
});
