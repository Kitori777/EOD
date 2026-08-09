import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChartDataset,
  buildThresholdReport,
  createChartDraft,
  parseNumber,
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
  assert.equal(report.violationCount, 3);
  assert.equal(report.events.length, 2);
  assert.deepEqual(report.events.map((event) => [event.status, event.startX, event.endX]), [
    ["below", "2026-01-01", "2026-01-02"],
    ["above", "2026-01-05", "2026-01-05"],
  ]);
  assert.equal(report.events[0].largestDeviation, -10);
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

test("groups, aggregates and chronologically sorts a time chart", () => {
  const result = buildChartDataset(rows, definition(), columns);
  assert.deepEqual(result.categories, ["2026-01", "2026-02"]);
  assert.deepEqual(result.series[0], { name: "revenue", data: [150, 450.5] });
  assert.deepEqual(result.series[1], { name: "cost", data: [110, 250] });
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
