import assert from "node:assert/strict";
import test from "node:test";

import { executeDataModel, validateDataModel } from "../src/mechanics/modeling/engine/model-execution-engine.ts";

const nodes = [
  { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
  { id: "rule", kind: "decision", title: "Kontrola P90", subtitle: "", x: 200, y: 0, config: { field: "value", timeField: "time", thresholdMode: "percentile", percentile: 90, direction: "above", severity: "warning" } },
  { id: "result", kind: "result", title: "Średnia wartości", subtitle: "", x: 400, y: 0, config: { field: "value", calculation: "average", sourceRuleId: "rule" } },
];
const edges = [
  { id: "one", from: "source", to: "rule" },
  { id: "two", from: "rule", to: "result" },
];
const rows = Array.from({ length: 10 }, (_, index) => ({ time: `2026-01-${String(index + 1).padStart(2, "0")}`, value: String(index + 1) }));
const columns = [{ name: "time", type: "date" }, { name: "value", type: "number" }];

test("validates an executable source-rule-result graph", () => {
  assert.deepEqual(validateDataModel(nodes, edges, ["time", "value"]), { ready: true, issues: [] });
});

test("executes a percentile rule and returns event metrics", () => {
  const result = executeDataModel(nodes, edges, rows, columns);
  assert.equal(result.ready, true);
  assert.equal(result.rules[0].boundary, 9.1);
  assert.equal(result.rules[0].violationCount, 1);
  assert.equal(result.rules[0].eventCount, 1);
  assert.equal(result.rules[0].peakValue, 10);
  assert.equal(result.outputs[0].nodeTitle, "Średnia wartości");
  assert.equal(result.outputs[0].value, 5.5);
});

test("uses a selected rule as the source of a result calculation", () => {
  const eventNodes = nodes.map((node) => node.id === "result" ? { ...node, config: { sourceRuleId: "rule", calculation: "events" } } : node);
  const result = executeDataModel(eventNodes, edges, rows, columns);
  assert.equal(result.ready, true);
  assert.equal(result.outputs[0].value, 1);
  assert.match(result.outputs[0].detail, /Kontrola P90/);
});

test("rejects a graph that does not connect its rule to a result", () => {
  const result = validateDataModel(nodes, edges.slice(0, 1), ["time", "value"]);
  assert.equal(result.ready, false);
  assert.match(result.issues.join(" "), /Połącz regułę/);
});

test("runs a complete formula model without requiring an alert rule", () => {
  const formulaNodes = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "transform", kind: "transform", title: "Podwój wartość", subtitle: "", x: 180, y: 0, config: { transformOperation: "formula", formula: "[value] * 2", outputField: "value_x2" } },
    { id: "metric", kind: "metric", title: "Średnia po zmianie", subtitle: "", x: 360, y: 0, config: { field: "value_x2", calculation: "average" } },
    { id: "result", kind: "result", title: "Wynik", subtitle: "", x: 540, y: 0 },
  ];
  const formulaEdges = [
    { id: "a", from: "source", to: "transform" },
    { id: "b", from: "transform", to: "metric" },
    { id: "c", from: "metric", to: "result" },
  ];
  assert.equal(validateDataModel(formulaNodes, formulaEdges, ["time", "value"]).ready, true);
  const result = executeDataModel(formulaNodes, formulaEdges, rows, columns);
  assert.equal(result.ready, true);
  assert.equal(result.processedRows, 10);
  assert.equal(result.transforms[0].outputField, "value_x2");
  assert.equal(result.transforms[0].validCount, 10);
  assert.equal(result.outputs[0].value, 11);
});

test("uses project parameters in formulas and keeps their values outside source rows", () => {
  const parameterNodes = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "transform", kind: "transform", title: "Przelicz współczynnik", subtitle: "", x: 180, y: 0, config: { transformOperation: "formula", formula: "[value] * {{Współczynnik}} + {{Korekta}}", outputField: "adjusted" } },
    { id: "metric", kind: "metric", title: "Wynik", subtitle: "", x: 360, y: 0, config: { field: "adjusted", calculation: "average" } },
  ];
  const parameterEdges = [{ id: "a", from: "source", to: "transform" }, { id: "b", from: "transform", to: "metric" }];
  const parameters = [
    { id: "factor", name: "Współczynnik", value: 2, unit: "x" },
    { id: "offset", name: "Korekta", value: 1 },
  ];
  assert.equal(validateDataModel(parameterNodes, parameterEdges, ["value"], parameters).ready, true);
  const result = executeDataModel(parameterNodes, parameterEdges, rows, columns, parameters);
  assert.equal(result.ready, true);
  assert.equal(result.outputs[0].value, 12);
  assert.equal(rows[0].Współczynnik, undefined);
});

test("blocks missing and duplicated project parameters", () => {
  const parameterNodes = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "metric", kind: "metric", title: "Wynik", subtitle: "", x: 180, y: 0, config: { formula: "[value] * {{Mnożnik}}", calculation: "average" } },
  ];
  const parameterEdges = [{ id: "a", from: "source", to: "metric" }];
  const missing = validateDataModel(parameterNodes, parameterEdges, ["value"]);
  assert.equal(missing.ready, false);
  assert.match(missing.issues.join(" "), /nieznanego parametru/);
  const duplicated = validateDataModel(parameterNodes, parameterEdges, ["value"], [{ id: "a", name: "Mnożnik", value: 2 }, { id: "b", name: "mnożnik", value: 3 }]);
  assert.equal(duplicated.ready, false);
  assert.match(duplicated.issues.join(" "), /nie mogą się powtarzać/);
});

test("blocks malformed formulas with a readable validation message", () => {
  const broken = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "metric", kind: "metric", title: "Błędna metryka", subtitle: "", x: 200, y: 0, config: { formula: "[value] +", calculation: "average" } },
  ];
  const result = validateDataModel(broken, [{ id: "one", from: "source", to: "metric" }], ["value"]);
  assert.equal(result.ready, false);
  assert.match(result.issues.join(" "), /Popraw formułę.*kończy się zbyt wcześnie/);
});
