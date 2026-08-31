import test from "node:test";
import assert from "node:assert/strict";
import { applyModelMemory, modelMemoryToScenario } from "../src/mechanics/modeling/engine/model-memory-engine.ts";

const base = { id: "memory-1", name: "Wzrost", field: "Power", operation: "percent", value: 10, capturedAt: "2026-08-26T10:00:00.000Z", enabled: true, useInModel: true, availableInSimulation: true };

test("model memory applies enabled changes without mutating source rows", () => {
  const rows = [{ Power: 100 }, { Power: 50 }];
  const changed = applyModelMemory(rows, [base]);
  assert.deepEqual(changed.map((row) => row.Power), ["110", "55"]);
  assert.deepEqual(rows.map((row) => row.Power), [100, 50]);
});

test("model memory honors its saved time range", () => {
  const rows = [{ Timestamp: "2026-08-25T12:00:00Z", Power: 100 }, { Timestamp: "2026-08-26T12:00:00Z", Power: 100 }];
  const changed = applyModelMemory(rows, [{ ...base, timeField: "Timestamp", from: "2026-08-26T00:00:00Z", to: "2026-08-26T23:59:59Z" }]);
  assert.deepEqual(changed.map((row) => row.Power), [100, "110"]);
});

test("saved memory becomes an automatic what-if scenario", () => {
  const scenario = modelMemoryToScenario({ ...base, timeField: "Timestamp", from: "2026-08-26T00:00" });
  assert.equal(scenario.inputField, "Power");
  assert.equal(scenario.operation, "percent");
  assert.equal(scenario.scope.kind, "time");
  assert.equal(scenario.responseMode, "auto");
  assert.equal(scenario.econometricModel, "auto");
  assert.equal(scenario.econometricMaxLag, 12);
});
