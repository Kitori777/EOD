import type { DataRow } from "../../charts/types/chart-types";
import { clearDataset, saveDatasetChunk, saveDatasetMeta } from "../storage/dataset-store";
import { DATA_LIMITS, type ImportedDataset, type ImportOptions } from "../types/data-types";
import { dataFormatForFile } from "./format-registry";
import { normalizeRecord, parseJsonDocument, requireRecord, type UnknownRecord } from "./record-normalizer";

type JsonImportState = {
  headers: Set<string>;
  displayRows: DataRow[];
  totalRows: number;
  chunkCount: number;
};

async function storeRecords(datasetId: string, records: UnknownRecord[], state: JsonImportState) {
  if (state.totalRows + records.length > DATA_LIMITS.jsonRows) {
    throw new Error("Plik JSON przekracza limit 2 000 000 rekordów.");
  }
  records.forEach((record) => Object.keys(record).forEach((key) => state.headers.add(key)));
  const rows = records.map(normalizeRecord);
  if (state.displayRows.length < DATA_LIMITS.sampleRows) {
    state.displayRows.push(...rows.slice(0, DATA_LIMITS.sampleRows - state.displayRows.length));
  }
  await saveDatasetChunk(datasetId, state.chunkCount, rows);
  state.chunkCount += 1;
  state.totalRows += rows.length;
}

async function importJsonLines(
  file: File,
  datasetId: string,
  state: JsonImportState,
  options: ImportOptions,
) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let lineNumber = 0;
  let bytesRead = 0;
  let records: UnknownRecord[] = [];

  const processLine = async (line: string) => {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Nieprawidłowy JSON w wierszu ${lineNumber}: ${error instanceof Error ? error.message : "błąd składni"}`);
    }
    records.push(requireRecord(parsed, `Wiersz ${lineNumber}`));
    if (records.length >= DATA_LIMITS.chunkRows) {
      await storeRecords(datasetId, records, state);
      records = [];
    }
  };

  while (true) {
    if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");
    const result = await reader.read();
    if (result.done) break;
    bytesRead += result.value.byteLength;
    pending += decoder.decode(result.value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) await processLine(line);
    options.onProgress?.({
      stage: "reading",
      processedRows: state.totalRows + records.length,
      percent: Math.min(98, Math.round((bytesRead / Math.max(1, file.size)) * 100)),
      message: `Wczytano ${(state.totalRows + records.length).toLocaleString("pl-PL")} rekordów`,
    });
  }
  pending += decoder.decode();
  if (pending.trim()) await processLine(pending);
  if (records.length) await storeRecords(datasetId, records, state);
}

export async function importJsonFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  const definition = dataFormatForFile(file);
  if (!definition || definition.kind !== "json") throw new Error("Nie rozpoznano formatu JSON.");
  const isLines = definition.extension === "jsonl" || definition.extension === "ndjson";
  const byteLimit = isLines ? DATA_LIMITS.jsonLinesBytes : DATA_LIMITS.jsonBytes;
  if (file.size > byteLimit) {
    throw new Error(`${definition.label} przekracza limit ${isLines ? "500" : "100"} MB.`);
  }

  const datasetId = `${definition.extension}-${file.name}-${file.size}-${file.lastModified}`;
  await clearDataset(datasetId);
  const state: JsonImportState = { headers: new Set(), displayRows: [], totalRows: 0, chunkCount: 0 };
  options.onProgress?.({ stage: "preparing", processedRows: 0, percent: 0, message: `Przygotowanie importu ${definition.label}` });

  try {
    if (isLines) {
      await importJsonLines(file, datasetId, state, options);
    } else {
      if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");
      const records = parseJsonDocument(await file.text());
      for (let offset = 0; offset < records.length; offset += DATA_LIMITS.chunkRows) {
        await storeRecords(datasetId, records.slice(offset, offset + DATA_LIMITS.chunkRows), state);
        options.onProgress?.({
          stage: "reading",
          processedRows: state.totalRows,
          percent: Math.min(98, Math.round((state.totalRows / records.length) * 100)),
          message: `Wczytano ${state.totalRows.toLocaleString("pl-PL")} rekordów`,
        });
      }
    }

    const headers = [...state.headers];
    if (!headers.length || state.totalRows === 0) throw new Error("Plik JSON nie zawiera tabeli z danymi.");
    const meta = {
      id: datasetId,
      name: file.name,
      format: definition.extension,
      headers,
      totalRows: state.totalRows,
      fileSize: file.size,
      importedAt: new Date().toISOString(),
      chunkCount: state.chunkCount,
      sampled: state.totalRows > state.displayRows.length,
    };
    await saveDatasetMeta(meta);
    options.onProgress?.({ stage: "complete", processedRows: state.totalRows, percent: 100, message: "Import zakończony" });
    return { meta, displayRows: state.displayRows, warnings: [] };
  } catch (error) {
    await clearDataset(datasetId).catch(() => undefined);
    throw error;
  }
}
