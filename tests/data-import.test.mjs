import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DATA_FILE_ACCEPT,
  dataFormatForFile,
  supportedDataFile,
  SUPPORTED_DATA_FORMATS,
  workbookDataFile,
} from "../src/mechanics/data/importers/format-registry.ts";
import { cellToString, collectHeaders, normalizeRecord, parseJsonDocument } from "../src/mechanics/data/importers/record-normalizer.ts";

const expectedExtensions = [
  "csv", "tsv", "txt", "json", "jsonl", "ndjson",
  "xls", "xlsx", "xlsm", "xlsb", "ods", "fods", "parquet",
];

test("registers all 13 supported data formats and builds the file picker filter", () => {
  assert.deepEqual(SUPPORTED_DATA_FORMATS.map(({ extension }) => extension), expectedExtensions);
  for (const extension of expectedExtensions) {
    const file = { name: `dataset.${extension.toUpperCase()}` };
    assert.equal(supportedDataFile(file), true);
    assert.equal(dataFormatForFile(file)?.extension, extension);
    assert.match(DATA_FILE_ACCEPT, new RegExp(`\\.${extension}(?:,|$)`));
  }
  assert.equal(supportedDataFile({ name: "dataset.zip" }), false);
  assert.equal(workbookDataFile({ name: "book.ods" }), true);
  assert.equal(workbookDataFile({ name: "rows.jsonl" }), false);
});

test("accepts JSON arrays, one object and a data envelope", () => {
  assert.deepEqual(parseJsonDocument('[{"time":"10:00","value":101}]'), [{ time: "10:00", value: 101 }]);
  assert.deepEqual(parseJsonDocument('{"time":"10:00","value":101}'), [{ time: "10:00", value: 101 }]);
  assert.deepEqual(parseJsonDocument('{"data":[{"value":99}]}'), [{ value: 99 }]);
  assert.throws(() => parseJsonDocument('[1,2]'), /musi być obiektem/);
  assert.throws(() => parseJsonDocument('{bad json}'), /Nieprawidłowy JSON/);
});

test("normalizes nested and special values into chart-safe strings", () => {
  const record = {
    timestamp: new Date("2026-08-08T10:00:00Z"),
    value: 101.5,
    active: true,
    details: { source: "seal-1" },
    missing: null,
  };
  const row = normalizeRecord(record);
  assert.equal(row.timestamp, "2026-08-08T10:00:00.000Z");
  assert.equal(row.value, "101.5");
  assert.equal(row.active, "true");
  assert.equal(row.details, '{"source":"seal-1"}');
  assert.equal(row.missing, "");
  assert.equal(cellToString(12n), "12");
  assert.deepEqual(collectHeaders([{ a: 1 }, { b: 2 }], ["timestamp"]), ["timestamp", "a", "b"]);
});

test("ships small JSON, JSONL and TSV import fixtures", async () => {
  const json = await readFile(new URL("./fixtures/import/sample.json", import.meta.url), "utf8");
  const jsonLines = await readFile(new URL("./fixtures/import/sample.jsonl", import.meta.url), "utf8");
  const tsv = await readFile(new URL("./fixtures/import/sample.tsv", import.meta.url), "utf8");
  assert.equal(parseJsonDocument(json).length, 3);
  assert.equal(jsonLines.trim().split(/\r?\n/).length, 3);
  assert.match(tsv, /Timestamp\tValue\tStatus/);
});

test("desktop CSV import owns its worker lifecycle and can abort before the first chunk", async () => {
  const [importer, worker, store] = await Promise.all([
    readFile(new URL("../src/mechanics/data/importers/delimited-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/data/workers/delimited.worker.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/data/storage/dataset-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(importer, /new Worker\(new URL\("\.\.\/workers\/delimited\.worker\.ts"/);
  assert.match(importer, /addEventListener\("abort"/);
  assert.match(importer, /worker\.terminate\(\)/);
  assert.match(importer, /WORKER_START_TIMEOUT_MS/);
  assert.match(worker, /parser\.pause\(\)/);
  assert.match(worker, /activeParser\?\.abort\(\)/);
  assert.match(store, /request\.onblocked/);
  assert.match(store, /DATABASE_OPEN_TIMEOUT_MS/);
});
