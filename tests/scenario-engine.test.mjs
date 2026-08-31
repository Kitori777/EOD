import assert from "node:assert/strict";
import test from "node:test";

import { calculateScenario, supportsScenarioModel } from "../src/mechanics/modeling/engine/scenario-engine.ts";

const baseline = {
  id: "baseline",
  name: "Bazowy",
  priceChange: 0,
  marketingChange: 0,
  conversionChange: 0,
  choices: { pricing: "1", campaign: "4", market: "9" },
};

const rows = [
  { revenue: "100000", cost: "60000", customers: "1000" },
  { revenue: "120000", cost: "70000", customers: "1100" },
];

test("calculates deterministic scenario metrics from imported aliases", () => {
  const result = calculateScenario(baseline, rows, ["revenue", "cost", "customers"]);
  assert.ok(result.revenue > 0);
  assert.ok(result.cost > 0);
  assert.equal(result.profit, result.revenue - result.cost);
  assert.equal(result.margin, (result.profit / result.revenue) * 100);
});

test("growth choices change the baseline result", () => {
  const growth = calculateScenario({ ...baseline, priceChange: 8, marketingChange: 25, conversionChange: 12 }, rows, ["revenue", "cost", "customers"]);
  const base = calculateScenario(baseline, rows, ["revenue", "cost", "customers"]);
  assert.notEqual(growth.revenue, base.revenue);
  assert.notEqual(growth.customers, base.customers);
});

test("does not invent sales values for an unrelated imported file", () => {
  const industrialRows = [{ Timestamp: "2026-01-01", Dancer_Output: "48.2" }];
  assert.equal(supportsScenarioModel(["Timestamp", "Dancer_Output"]), false);
  assert.deepEqual(calculateScenario(baseline, industrialRows, ["Timestamp", "Dancer_Output"]), {
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: 0,
    customers: 0,
    risk: 0,
  });
});
