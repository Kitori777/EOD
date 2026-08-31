import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildThresholdReport } from "../src/mechanics/charts/engine/chart-engine.ts";

const text = fs.readFileSync(new URL("../outputs/percentyl-demo-0.1.2/eyes_of_odin_demo_percentyle.csv", import.meta.url), "utf8").replace(/^\uFEFF/, "");
const [headerLine, ...dataLines] = text.trim().split(/\r?\n/);
const headers = headerLine.split(",");
const rows = dataLines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
const columns = headers.map((name) => ({ name, type: name === "Timestamp" ? "date" : ["Shift", "Demo_Event"].includes(name) ? "text" : "number" }));

function report(field, direction) {
  return buildThresholdReport(rows, {
    id: `${field}-${direction}`,
    title: field,
    datasetId: "demo",
    type: "line",
    xField: "Timestamp",
    yFields: [field],
    aggregation: "average",
    filters: [],
    thresholds: [{ id: `${field}-${direction}`, field, mode: "percentile", percentile: 90, direction, label: "Poziom 90%", severity: "warning", evaluation: "raw", enabled: true }],
    size: "large",
  }, columns);
}

test("demo dataset contains four visible percentile scenarios", () => {
  assert.equal(rows.length, 288);
  const scenarios = [
    ["Dancer_Process_Value", "below", "2026-09-15T10:30:00.000Z"],
    ["Dancer_Output", "above", "2026-09-15T13:30:00.000Z"],
    ["Nip_Process_Value", "below", "2026-09-15T17:00:00.000Z"],
    ["Line_Speed", "above", "2026-09-16T00:00:00.000Z"],
  ];
  scenarios.forEach(([field, direction, expectedTime]) => {
    const result = report(field, direction);
    assert.equal(result.violationCount, 29, `${field} should have a clear 10% tail`);
    assert.ok(result.events.some((event) => event.violations.some((violation) => violation.x === expectedTime)), `${field} should include the annotated demo event`);
  });
});
