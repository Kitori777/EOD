import assert from "node:assert/strict";
import test from "node:test";

import { aggregateField, compareColumns, compareGroups, getGroupValues } from "../src/mechanics/compare/comparison-engine.ts";

const rows = [
  { month: "2026-01", region: "A", revenue: "100", cost: "60" },
  { month: "2026-02", region: "A", revenue: "120", cost: "70" },
  { month: "2026-01", region: "B", revenue: "160", cost: "90" },
  { month: "2026-02", region: "B", revenue: "180", cost: "100" },
];

test("aggregates only real values from the selected field", () => {
  assert.deepEqual(aggregateField(rows, "revenue", "sum"), { value: 560, records: 4 });
  assert.deepEqual(aggregateField(rows, "revenue", "average"), { value: 140, records: 4 });
  assert.deepEqual(aggregateField(rows, "missing", "sum"), { value: 0, records: 0 });
});

test("compares two numeric columns and exposes absolute and percent changes", () => {
  const result = compareColumns(rows, "cost", "revenue", "sum");
  assert.equal(result.leftValue, 320);
  assert.equal(result.rightValue, 560);
  assert.equal(result.difference, 240);
  assert.equal(result.percent, 75);
});

test("compares two selected groups using the same metric", () => {
  const result = compareGroups(rows, "revenue", "region", "A", "B", "average");
  assert.equal(result.leftValue, 110);
  assert.equal(result.rightValue, 170);
  assert.equal(result.difference, 60);
  assert.equal(result.leftRecords, 2);
  assert.equal(result.rightRecords, 2);
});

test("returns sorted unique group values", () => {
  assert.deepEqual(getGroupValues(rows, "month"), ["2026-01", "2026-02"]);
});
