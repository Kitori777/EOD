import assert from "node:assert/strict";
import test from "node:test";

import { calculateScenario } from "../src/mechanics/modeling/engine/scenario-engine.ts";

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
