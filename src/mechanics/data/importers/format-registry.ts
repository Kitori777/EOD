import type { DatasetFormat } from "../types/data-types";

export type DataFileKind = "delimited" | "json" | "workbook" | "parquet";

export type DataFormatDefinition = {
  extension: DatasetFormat;
  label: string;
  kind: DataFileKind;
};

export const SUPPORTED_DATA_FORMATS: readonly DataFormatDefinition[] = [
  { extension: "csv", label: "CSV", kind: "delimited" },
  { extension: "tsv", label: "TSV", kind: "delimited" },
  { extension: "txt", label: "TXT", kind: "delimited" },
  { extension: "json", label: "JSON", kind: "json" },
  { extension: "jsonl", label: "JSONL", kind: "json" },
  { extension: "ndjson", label: "NDJSON", kind: "json" },
  { extension: "xls", label: "XLS", kind: "workbook" },
  { extension: "xlsx", label: "XLSX", kind: "workbook" },
  { extension: "xlsm", label: "XLSM", kind: "workbook" },
  { extension: "xlsb", label: "XLSB", kind: "workbook" },
  { extension: "ods", label: "ODS", kind: "workbook" },
  { extension: "fods", label: "FODS", kind: "workbook" },
  { extension: "parquet", label: "Parquet", kind: "parquet" },
] as const;

const FORMAT_BY_EXTENSION = new Map(SUPPORTED_DATA_FORMATS.map((format) => [format.extension, format]));

export const DATA_FILE_ACCEPT = SUPPORTED_DATA_FORMATS.map(({ extension }) => `.${extension}`).join(",");
export const SUPPORTED_DATA_FORMAT_LABELS = SUPPORTED_DATA_FORMATS.map(({ label }) => label).join(", ");

export function fileExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.trim());
  return match?.[1].toLowerCase() ?? "";
}

export function dataFormatForFile(file: Pick<File, "name">): DataFormatDefinition | undefined {
  return FORMAT_BY_EXTENSION.get(fileExtension(file.name) as DatasetFormat);
}

export function supportedDataFile(file: Pick<File, "name">): boolean {
  return dataFormatForFile(file) !== undefined;
}

export function workbookDataFile(file: Pick<File, "name">): boolean {
  return dataFormatForFile(file)?.kind === "workbook";
}
