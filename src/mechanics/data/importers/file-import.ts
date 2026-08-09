import type { ImportedDataset, ImportOptions } from "../types/data-types";
import { importDelimitedFile } from "./delimited-import";
import { dataFormatForFile } from "./format-registry";
import { importJsonFile } from "./json-import";
import { importWorkbookFile } from "./workbook-import";

export { supportedDataFile } from "./format-registry";

export async function importDataFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  const definition = dataFormatForFile(file);
  if (!definition) throw new Error("Nieobsługiwany format pliku.");
  if (definition.kind === "delimited") return importDelimitedFile(file, options);
  if (definition.kind === "json") return importJsonFile(file, options);
  if (definition.kind === "workbook") return importWorkbookFile(file, options);
  const { importParquetFile } = await import("./parquet-import");
  return importParquetFile(file, options);
}
