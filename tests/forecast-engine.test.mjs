import assert from "node:assert/strict";
import test from "node:test";

import { buildForecast } from "../src/mechanics/simulation/engine/forecast-engine.ts";

const rows = Array.from({ length: 12 }, (_, index) => ({
  time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  value: String(10 + index * 3),
}));

test("linear forecast extends the observed trend and exposes uncertainty", () => {
  const result = buildForecast(rows, { timeField: "time", valueField: "value", method: "linear", horizon: 3 });
  assert.equal(result.forecast.length, 3);
  assert.equal(result.forecast[0].value, 46);
  assert.ok(result.forecast[0].upper >= result.forecast[0].value);
  assert.equal(result.sampleSize, 12);
});

test("forecast fails clearly when there are too few points", () => {
  const result = buildForecast(rows.slice(0, 4), { timeField: "time", valueField: "value", method: "moving-average", horizon: 2 });
  assert.equal(result.forecast.length, 0);
  assert.match(result.warning ?? "", /co najmniej 8/);
});
