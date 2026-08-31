import type { ImportedDataset, ImportOptions } from "../types/data-types";
import { clearDataset, saveDatasetChunk, saveDatasetMeta } from "../storage/dataset-store";
import { importDelimitedFile } from "./delimited-import";
import { dataFormatForFile } from "./format-registry";
import { importJsonFile } from "./json-import";
import { importWorkbookFile } from "./workbook-import";
import { normalizeImportedLayout } from "./layout-normalizer";

export { supportedDataFile } from "./format-registry";

async function persistNormalizedDataset(dataset: ImportedDataset) {
  await clearDataset(dataset.meta.id);
  const chunkSize = 5_000;
  for (let offset = 0; offset < dataset.displayRows.length; offset += chunkSize) {
    await saveDatasetChunk(dataset.meta.id, Math.floor(offset / chunkSize), dataset.displayRows.slice(offset, offset + chunkSize));
  }
  await saveDatasetMeta(dataset.meta);
}

export async function importDataFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  const definition = dataFormatForFile(file);
  if (!definition) throw new Error("Nieobsługiwany format pliku.");
  let imported: ImportedDataset;
  if (definition.kind === "delimited") imported = await importDelimitedFile(file, options);
  else if (definition.kind === "json") imported = await importJsonFile(file, options);
  else if (definition.kind === "workbook") imported = await importWorkbookFile(file, options);
  else {
    const { importParquetFile } = await import("./parquet-import");
    imported = await importParquetFile(file, options);
  }
  const normalized = normalizeImportedLayout(imported);
  if (normalized !== imported && normalized.displayRows !== imported.displayRows && !imported.meta.sampled) await persistNormalizedDataset(normalized);
  return normalized;
}
