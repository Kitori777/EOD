import { parquetMetadataAsync, parquetReadObjects, parquetSchema, type AsyncBuffer } from "hyparquet";
import { compressors } from "hyparquet-compressors";

import type { DataRow } from "../../charts/types/chart-types";
import { clearDataset, saveDatasetChunk, saveDatasetMeta } from "../storage/dataset-store";
import { DATA_LIMITS, type ImportedDataset, type ImportOptions } from "../types/data-types";
import { normalizeRecord, type UnknownRecord } from "./record-normalizer";

function asyncBufferForFile(file: File): AsyncBuffer {
  return {
    byteLength: file.size,
    slice: (start, end) => file.slice(start, end).arrayBuffer(),
  };
}

export async function importParquetFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  if (file.size > DATA_LIMITS.parquetBytes) throw new Error("Parquet przekracza limit 2 GB.");
  const datasetId = `parquet-${file.name}-${file.size}-${file.lastModified}`;
  await clearDataset(datasetId);
  options.onProgress?.({ stage: "preparing", processedRows: 0, percent: 0, message: "Odczytywanie metadanych Parquet" });

  try {
    const asyncFile = asyncBufferForFile(file);
    const metadata = await parquetMetadataAsync(asyncFile);
    const totalRows = Number(metadata.num_rows);
    if (!Number.isSafeInteger(totalRows)) throw new Error("Plik Parquet zawiera zbyt wiele rekordów do bezpiecznego odczytu.");
    if (totalRows > DATA_LIMITS.parquetRows) throw new Error("Parquet przekracza limit 2 000 000 rekordów.");
    if (totalRows === 0) throw new Error("Plik Parquet nie zawiera rekordów.");

    const schema = parquetSchema(metadata);
    const headers = schema.children.map((child) => child.element.name);
    if (!headers.length) throw new Error("Plik Parquet nie zawiera kolumn.");
    const displayRows: DataRow[] = [];
    let chunkCount = 0;

    for (let rowStart = 0; rowStart < totalRows; rowStart += DATA_LIMITS.chunkRows) {
      if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");
      const rowEnd = Math.min(totalRows, rowStart + DATA_LIMITS.chunkRows);
      const records = await parquetReadObjects({
        file: asyncFile,
        metadata,
        compressors,
        rowFormat: "object",
        rowStart,
        rowEnd,
      }) as UnknownRecord[];
      const rows = records.map(normalizeRecord);
      if (displayRows.length < DATA_LIMITS.sampleRows) {
        displayRows.push(...rows.slice(0, DATA_LIMITS.sampleRows - displayRows.length));
      }
      await saveDatasetChunk(datasetId, chunkCount, rows);
      chunkCount += 1;
      options.onProgress?.({
        stage: "reading",
        processedRows: rowEnd,
        percent: Math.min(98, Math.round((rowEnd / totalRows) * 100)),
        message: `Wczytano ${rowEnd.toLocaleString("pl-PL")} rekordów`,
      });
    }

    const meta = {
      id: datasetId,
      name: file.name,
      format: "parquet" as const,
      headers,
      totalRows,
      fileSize: file.size,
      importedAt: new Date().toISOString(),
      chunkCount,
      sampled: totalRows > displayRows.length,
    };
    await saveDatasetMeta(meta);
    options.onProgress?.({ stage: "complete", processedRows: totalRows, percent: 100, message: "Import zakończony" });
    return { meta, displayRows, warnings: [] };
  } catch (error) {
    await clearDataset(datasetId).catch(() => undefined);
    throw error instanceof Error ? error : new Error("Nie udało się odczytać pliku Parquet.");
  }
}
