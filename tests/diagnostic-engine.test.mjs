import assert from "node:assert/strict";
import test from "node:test";

import { analyzeDataset, analyzeModelReadiness } from "../src/mechanics/simulation/engine/diagnostic-engine.ts";

test("diagnostics find constant fields, missing values and strong relationships", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    x: String(index),
    y: String(index * 4),
    constant: "1",
    optional: index < 10 ? "" : String(index),
  }));
  const report = analyzeDataset(rows, [
    { name: "x", type: "number" },
    { name: "y", type: "number" },
    { name: "constant", type: "number" },
    { name: "optional", type: "number" },
  ]);
  assert.equal(report.columns.find((column) => column.field === "constant")?.constant, true);
  assert.equal(report.columns.find((column) => column.field === "optional")?.missingPercent, 50);
  assert.ok(Math.abs(report.relationships.find((item) => item.left === "x" && item.right === "y")?.correlation ?? 0) > 0.99);
});

test("constant settings are informative and never become critical by themselves", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    Timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    Temperature_Setpoint: "100",
    Temperature_Process_Value: String(99 + Math.sin(index)),
  }));
  const report = analyzeDataset(rows, [
    { name: "Timestamp", type: "date" },
    { name: "Temperature_Setpoint", type: "number" },
    { name: "Temperature_Process_Value", type: "number" },
  ]);
  const setting = report.columns.find((column) => column.field === "Temperature_Setpoint");
  assert.equal(setting?.role, "setting");
  assert.equal(setting?.status, "info");
  assert.match(setting?.summary ?? "", /może być prawidłowe/i);
  assert.equal(report.expectedConstants, 1);
  assert.equal(report.criticalIssues, 0);
});

test("a constant non-setting field stays informational instead of becoming an error", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ batch: "A", value: String(index) }));
  const report = analyzeDataset(rows, [
    { name: "batch", type: "text" },
    { name: "value", type: "number" },
  ]);
  const batch = report.columns.find((column) => column.field === "batch");
  assert.equal(batch?.constant, true);
  assert.equal(batch?.status, "info");
  assert.equal(report.informationalConstants, 1);
  assert.equal(report.criticalIssues, 0);
});

test("diagnostics explain timeline duplicates and gaps in plain language", () => {
  const times = [0, 5, 10, 10, 30, 35, 40, 45, 50, 55, 60, 65];
  const rows = times.map((minute, index) => ({
    Timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
    value: String(index),
  }));
  const report = analyzeDataset(rows, [
    { name: "Timestamp", type: "date" },
    { name: "value", type: "number" },
  ]);
  assert.equal(report.time?.duplicates, 1);
  assert.equal(report.time?.gaps, 1);
  assert.equal(report.time?.status, "warning");
  assert.match(report.time?.summary ?? "", /powtórzonych znaczników czasu/);
  assert.match(report.time?.summary ?? "", /większych przerw/);
});

test("large missingness remains a real critical issue", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ value: index < 5 ? "" : String(index) }));
  const report = analyzeDataset(rows, [{ name: "value", type: "number" }]);
  assert.equal(report.columns[0].status, "critical");
  assert.equal(report.criticalIssues, 1);
  assert.equal(report.overallStatus, "critical");
  assert.ok(report.findings.some((finding) => finding.severity === "critical"));
});

test("model diagnostics explain whether graph and scenario can run", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1) }));
  const columns = [{ name: "value", type: "number" }];
  const nodes = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "metric", kind: "metric", title: "Średnia", subtitle: "", x: 200, y: 0, config: { field: "value", calculation: "average" } },
  ];
  const report = analyzeModelReadiness(rows, columns, nodes, [{ id: "edge", from: "source", to: "metric" }], {
    id: "scenario",
    name: "Wzrost",
    inputField: "value",
    operation: "percent",
    value: 5,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: false,
  });
  assert.equal(report.modelReady, true);
  assert.equal(report.simulationReady, true);
  assert.ok(report.findings.some((finding) => finding.id === "model-ready"));
  assert.ok(report.findings.some((finding) => finding.id === "scenario-summary"));
  assert.ok(report.findings.every((finding) => !finding.description.includes("/100")));
});
