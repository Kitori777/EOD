import assert from "node:assert/strict";
import test from "node:test";

import { applyWhatIfScenario, executeWhatIfModel, fitLinearResponse } from "../src/mechanics/simulation/engine/what-if-engine.ts";
import { fitEconometricResponse } from "../src/mechanics/simulation/engine/econometric-engine.ts";
import { inferModelDependencies } from "../src/mechanics/simulation/engine/production-dependency-engine.ts";
import { parseProductionField } from "../src/mechanics/modeling/engine/production-field-engine.ts";

const rows = Array.from({ length: 20 }, (_, index) => ({
  time: `2026-01-${String(index + 1).padStart(2, "0")}`,
  group: index < 10 ? "A" : "B",
  input: String(index + 1),
  output: String(5 + (index + 1) * 2),
}));

const responseRows = Array.from({ length: 120 }, (_, index) => {
  const input = 10 + Math.sin(index / 3) * 3 + Math.cos(index / 7);
  return {
    time: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    input: String(input),
    output: String(5 + input * 2 + Math.sin(index * 1.7) * .04),
  };
});

test("what-if keeps source rows immutable and changes only the selected scope", () => {
  const source = rows.map((row) => ({ ...row }));
  const result = applyWhatIfScenario(rows, {
    id: "test",
    name: "Test",
    inputField: "input",
    operation: "percent",
    value: 10,
    scope: { kind: "group", field: "group", value: "A" },
    outputFields: [],
    estimateOutputs: false,
  });
  assert.deepEqual(rows, source);
  assert.equal(result.affectedRows, 10);
  assert.equal(Number(result.rows[0].input), 1.1);
  assert.equal(Number(result.rows[10].input), 11);
});

test("estimated response follows the fitted relationship and reports quality", () => {
  const result = applyWhatIfScenario(responseRows, {
    id: "test",
    name: "Test",
    inputField: "input",
    operation: "add",
    value: 2,
    scope: { kind: "all" },
    outputFields: ["output"],
    estimateOutputs: true,
  });
  assert.ok(Math.abs(Number(result.rows[0].output) - (Number(responseRows[0].output) + 4)) < .2);
  assert.equal(result.impacts.find((impact) => impact.field === "output")?.quality, "high");
  assert.equal(fitLinearResponse(rows, "input", "output")?.slope, 2);
});

test("automatic response analyzes every numeric column and keeps unsupported fields unchanged", () => {
  const extended = responseRows.map((row) => ({ ...row, constant: "7", mirrored: String(Number(row.input) * 3) }));
  const result = applyWhatIfScenario(extended, {
    id: "auto",
    name: "Wszystkie kolumny",
    inputField: "input",
    operation: "add",
    value: 2,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
  }, ["input", "output", "constant", "mirrored"]);
  assert.deepEqual(result.impacts.map((impact) => impact.field), ["input", "output", "constant", "mirrored"]);
  assert.equal(result.impacts.find((impact) => impact.field === "mirrored")?.response, "estimated");
  assert.equal(result.impacts.find((impact) => impact.field === "constant")?.response, "unchanged");
  assert.ok(Math.abs(Number(result.rows[0].mirrored) - (Number(extended[0].mirrored) + 6)) < .2);
  assert.equal(Number(result.rows[0].constant), 7);
});

test("econometric fit finds a delayed response and validates it on later observations", () => {
  const delayedRows = Array.from({ length: 180 }, (_, index) => {
    const source = Math.sin(index / 4) * 4 + Math.cos(index / 11) * 2 + (index % 7) * .05;
    const delayedIndex = Math.max(0, index - 2);
    const delayedSource = Math.sin(delayedIndex / 4) * 4 + Math.cos(delayedIndex / 11) * 2 + (delayedIndex % 7) * .05;
    return { source: String(source), target: String(20 + delayedSource * 1.8 + Math.sin(index * 2.1) * .03) };
  });
  const fit = fitEconometricResponse(delayedRows, "source", "target", 6);
  assert.ok(fit);
  assert.equal(fit.lagSteps, 2);
  assert.ok(Math.abs(fit.coefficient - 1.8) < .1);
  assert.ok(fit.pValue < .05);
  assert.ok(fit.validationRows >= 20);
  assert.ok((fit.validationRSquared ?? 0) > .95);
  assert.ok(fit.testedSpecifications > 1);
  assert.ok(fit.specificationAdjustedPValue >= fit.pValue);
});

test("maximum econometric delay is a real scenario constraint", () => {
  const delayedRows = Array.from({ length: 160 }, (_, index) => {
    const source = Math.sin(index / 3) * 4 + Math.cos(index / 9);
    const delayedIndex = Math.max(0, index - 3);
    const delayed = Math.sin(delayedIndex / 3) * 4 + Math.cos(delayedIndex / 9);
    return { source: String(source), target: String(12 + delayed * 1.5) };
  });
  assert.equal(fitEconometricResponse(delayedRows, "source", "target", 0)?.lagSteps, 0);
  assert.equal(fitEconometricResponse(delayedRows, "source", "target", 6)?.lagSteps, 3);
});

test("econometric validation does not learn a relationship introduced only in the final period", () => {
  const shifted = Array.from({ length: 100 }, (_, index) => {
    const source = Math.sin(index / 3) * 5;
    const target = index < 80 ? Math.cos(index / 5) : source * 8;
    return { source: String(source), target: String(target) };
  });
  const fit = fitEconometricResponse(shifted, "source", "target", 0);
  assert.ok(fit);
  assert.ok(Math.abs(fit.coefficient) < 1);
  assert.ok(fit.relativeValidationError > .25 || (fit.validationRSquared ?? 0) < 0);
});

test("econometric model selection is respected instead of silently using another method", () => {
  const dynamicRows = Array.from({ length: 180 }, (_, index) => {
    const source = Math.sin(index / 5) * 3 + Math.cos(index / 13);
    const previousTarget = index ? Number((20 + Math.sin((index - 1) / 5) * 3).toFixed(8)) : 20;
    return { source: String(source), target: String(8 + source * 1.4 + previousTarget * .25 + index * .002) };
  });
  const ols = fitEconometricResponse(dynamicRows, "source", "target", 4, "ols");
  const arx = fitEconometricResponse(dynamicRows, "source", "target", 4, "arx");
  const trend = fitEconometricResponse(dynamicRows, "source", "target", 4, "arx-trend");
  assert.equal(ols?.model, "ols");
  assert.equal(arx?.model, "arx");
  assert.equal(trend?.model, "arx-trend");
});

test("scenario model preference reaches learned dependencies", () => {
  const result = applyWhatIfScenario(responseRows, {
    id: "fixed-ols",
    name: "OLS",
    inputField: "input",
    operation: "add",
    value: 1,
    scope: { kind: "all" },
    outputFields: ["output"],
    estimateOutputs: true,
    responseMode: "manual",
    econometricModel: "ols",
  }, ["input", "output"], [], [], [
    { name: "time", type: "date" },
    { name: "input", type: "number" },
    { name: "output", type: "number" },
  ]);
  assert.equal(result.impacts.find((impact) => impact.field === "output")?.modelType, "ols");
});

test("econometric dependencies expose a multiple-field corrected significance", () => {
  const expanded = responseRows.map((row, index) => ({
    ...row,
    secondOutput: String(3 * Number(row.input) + Math.cos(index * 1.3) * .05),
  }));
  const dependencies = inferModelDependencies(expanded, [
    { name: "time", type: "date" },
    { name: "input", type: "number" },
    { name: "output", type: "number" },
    { name: "secondOutput", type: "number" },
  ], [], [], "input");
  const learned = dependencies.filter((rule) => rule.method === "learned" && rule.econometrics);
  assert.ok(learned.length >= 2);
  learned.forEach((rule) => {
    assert.ok(rule.econometrics.adjustedPValue >= rule.econometrics.pValue);
    assert.ok(rule.econometrics.adjustedPValue >= rule.econometrics.specificationAdjustedPValue);
    assert.match(rule.evidence, /· q /);
    assert.match(rule.evidence, /p po wyborze/);
  });
});

test("what-if variant is executed through the same model as the baseline", () => {
  const nodes = [
    { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
    { id: "metric", kind: "metric", title: "Średnie wejście", subtitle: "", x: 200, y: 0, config: { field: "input", calculation: "average" } },
  ];
  const evaluation = executeWhatIfModel(rows, [{ name: "time", type: "date" }, { name: "group", type: "text" }, { name: "input", type: "number" }, { name: "output", type: "number" }], {
    id: "model-scenario",
    name: "Dodaj dwa",
    inputField: "input",
    operation: "add",
    value: 2,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: false,
  }, nodes, [{ id: "edge", from: "source", to: "metric" }]);
  assert.equal(evaluation.modelReady, true);
  assert.equal(evaluation.baseline.outputs[0].value, 10.5);
  assert.equal(evaluation.variant.outputs[0].value, 12.5);
  assert.equal(evaluation.outputChanges[0].difference, 2);
  assert.equal(evaluation.facts.extrapolated, true);
  assert.equal(evaluation.facts.changedFields, 1);
});

test("production names are normalized into one component and signal roles", () => {
  assert.deepEqual(
    [parseProductionField("Seal1_Heat2_Setpoint"), parseProductionField("Seal1 Heat2 PV"), parseProductionField("Seal1-Heat2-Draw Temp Correction")].map(({ component, role }) => ({ component, role })),
    [
      { component: "seal1_heat2", role: "setting" },
      { component: "seal1_heat2", role: "measurement" },
      { component: "seal1_heat2", role: "correction" },
    ],
  );
});

test("manual dependencies propagate a change through every downstream stage", () => {
  const cascadeRows = Array.from({ length: 12 }, (_, index) => ({ input: String(index + 1), middle: String((index + 1) * 2), output: String((index + 1) * 6) }));
  const rules = [
    { id: "input-middle", sourceField: "input", targetField: "middle", method: "manual", sensitivity: 2, lagSteps: 0, enabled: true, confidence: "high", evidence: "test" },
    { id: "middle-output", sourceField: "middle", targetField: "output", method: "manual", sensitivity: 3, lagSteps: 0, enabled: true, confidence: "high", evidence: "test" },
  ];
  const result = applyWhatIfScenario(cascadeRows, {
    id: "cascade",
    name: "Kaskada",
    inputField: "input",
    operation: "add",
    value: 1,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
  }, ["input", "middle", "output"], rules, [], [{ name: "input", type: "number" }, { name: "middle", type: "number" }, { name: "output", type: "number" }]);
  assert.equal(Number(result.rows[0].middle), 4);
  assert.equal(Number(result.rows[0].output), 12);
  assert.deepEqual(result.propagation.map((step) => `${step.sourceField}->${step.targetField}`), ["input->middle", "middle->output"]);
});

test("delayed propagation follows timestamp order when source rows are shuffled", () => {
  const shuffled = [
    { time: "2026-01-03", input: "3", output: "6" },
    { time: "2026-01-01", input: "1", output: "2" },
    { time: "2026-01-04", input: "4", output: "8" },
    { time: "2026-01-02", input: "2", output: "4" },
  ];
  const result = applyWhatIfScenario(shuffled, {
    id: "chronological-lag",
    name: "Chronological lag",
    inputField: "input",
    operation: "add",
    value: 1,
    scope: { kind: "time", field: "time", from: "2026-01-01", to: "2026-01-01" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
  }, ["input", "output"], [{
    id: "lagged",
    sourceField: "input",
    targetField: "output",
    method: "manual",
    sensitivity: 2,
    lagSteps: 1,
    enabled: true,
    confidence: "high",
    evidence: "test",
  }], [], [
    { name: "time", type: "date" },
    { name: "input", type: "number" },
    { name: "output", type: "number" },
  ]);
  assert.equal(Number(result.rows.find((row) => row.time === "2026-01-02").output), 6);
  assert.equal(Number(result.rows.find((row) => row.time === "2026-01-04").output), 8);
});

test("cyclic dependencies are stopped after the first valid propagation", () => {
  const cyclicRows = Array.from({ length: 12 }, (_, index) => ({ input: String(index + 1), output: String((index + 1) * 2) }));
  const rules = [
    { id: "input-output", sourceField: "input", targetField: "output", method: "manual", sensitivity: 2, lagSteps: 0, enabled: true, confidence: "high", evidence: "test" },
    { id: "output-input", sourceField: "output", targetField: "input", method: "manual", sensitivity: 0.5, lagSteps: 0, enabled: true, confidence: "high", evidence: "test" },
  ];
  const result = applyWhatIfScenario(cyclicRows, {
    id: "cycle",
    name: "Pętla",
    inputField: "input",
    operation: "add",
    value: 1,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
  }, ["input", "output"], rules, [], [{ name: "input", type: "number" }, { name: "output", type: "number" }]);
  assert.equal(Number(result.rows[0].input), 2);
  assert.equal(Number(result.rows[0].output), 4);
  assert.equal(result.propagation.length, 1);
  assert.match(result.warnings.join(" "), /pętl/i);
});

test("a production correction is recomputed exactly when its process value changes", () => {
  const correctionRows = Array.from({ length: 12 }, (_, index) => ({
    Seal1_Heat1_Setpoint: "100",
    Seal1_Heat1_Process_Value: String(99 + index / 10),
    Seal1_Heat1_Draw_Temp_Correction: String(1 - index / 10),
  }));
  const columns = Object.keys(correctionRows[0]).map((name) => ({ name, type: "number" }));
  const result = applyWhatIfScenario(correctionRows, {
    id: "correction",
    name: "Korekta",
    inputField: "Seal1_Heat1_Process_Value",
    operation: "add",
    value: 1,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
  }, columns.map((column) => column.name), [], [], columns);
  assert.equal(Number(result.rows[0].Seal1_Heat1_Draw_Temp_Correction), 0);
  assert.equal(result.propagation[0].method, "formula");
  assert.match(result.propagation[0].evidence, /korekta = nastawa/);
});
