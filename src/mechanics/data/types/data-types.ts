import type { DataRow } from "../../charts/types/chart-types";

export type DatasetFormat =
  | "csv"
  | "tsv"
  | "txt"
  | "json"
  | "jsonl"
  | "ndjson"
  | "xls"
  | "xlsx"
  | "xlsm"
  | "xlsb"
  | "ods"
  | "fods"
  | "parquet";

export type DatasetMeta = {
  id: string;
  name: string;
  format: DatasetFormat;
  sheetName?: string;
  headers: string[];
  totalRows: number;
  fileSize: number;
  importedAt: string;
  chunkCount: number;
  sampled: boolean;
};

export type ImportedDataset = {
  meta: DatasetMeta;
  displayRows: DataRow[];
  warnings: string[];
};

export type ImportStage = "preparing" | "reading" | "storing" | "profiling" | "complete";

export type ImportProgress = {
  stage: ImportStage;
  processedRows: number;
  percent: number;
  message: string;
};

export type ImportOptions = {
  sheetName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
};

export const DATA_LIMITS = {
  delimitedBytes: 500 * 1024 * 1024,
  delimitedRows: 2_000_000,
  jsonBytes: 100 * 1024 * 1024,
  jsonLinesBytes: 500 * 1024 * 1024,
  jsonRows: 2_000_000,
  spreadsheetBytes: 50 * 1024 * 1024,
  spreadsheetRows: 250_000,
  parquetBytes: 2 * 1024 * 1024 * 1024,
  parquetRows: 2_000_000,
  memoryRows: 100_000,
  sampleRows: 50_000,
  previewRows: 500,
  chunkRows: 5_000,
} as const;
