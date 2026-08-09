import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { read, utils } from "xlsx";

const datasets = [
  { interval: "5-minutes", stem: "eyes_of_odin_5_minutes", rows: 2016 },
  { interval: "10-minutes", stem: "eyes_of_odin_10_minutes", rows: 1008 },
  { interval: "15-minutes", stem: "eyes_of_odin_15_minutes", rows: 672 },
];

for (const dataset of datasets) {
  test(`${dataset.interval} CSV and XLSX share the expected industrial schema`, async () => {
    const base = new URL(`../data/ready/${dataset.interval}/${dataset.stem}`, import.meta.url);
    const [csvBuffer, xlsxBuffer] = await Promise.all([
      readFile(new URL(`${base.href}.csv`)),
      readFile(new URL(`${base.href}.xlsx`)),
    ]);
    const csvLines = csvBuffer.toString("utf8").trim().split(/\r?\n/);
    const csvHeaders = csvLines[0].split(",");
    assert.equal(csvHeaders.length, 44);
    assert.equal(csvLines.length - 1, dataset.rows);
    assert.equal(csvHeaders[0], "Timestamp");

    const workbook = read(xlsxBuffer, { type: "buffer", cellDates: true });
    assert.deepEqual(workbook.SheetNames, ["Data"]);
    const matrix = utils.sheet_to_json(workbook.Sheets.Data, { header: 1, raw: false, defval: "" });
    assert.equal(matrix[0].length, 44);
    assert.equal(matrix.length - 1, dataset.rows);
    assert.equal(matrix[0][0], "Timestamp");
    assert.ok(!Number.isNaN(Date.parse(csvLines[1].split(",")[0])));

    const heatColumn = csvHeaders.indexOf("Seal1_Heat1_Process_Value");
    const values = csvLines.slice(1).map((line) => Number(line.split(",")[heatColumn]));
    assert.ok(Math.min(...values) < 90);
    assert.ok(Math.max(...values) > 110);
  });
}
