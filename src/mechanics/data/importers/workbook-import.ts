import type { DataRow } from "../../charts/types/chart-types";
import { clearDataset, saveDatasetChunk, saveDatasetMeta } from "../storage/dataset-store";
import { DATA_LIMITS, type ImportedDataset, type ImportOptions } from "../types/data-types";
import { dataFormatForFile } from "./format-registry";

type WorkerMessage =
  | { type: "sheets"; sheetNames: string[] }
  | { type: "start"; headers: string[]; totalRows: number }
  | { type: "chunk"; index: number; rows: DataRow[]; processedRows: number; totalRows: number }
  | { type: "complete"; totalRows: number }
  | { type: "error"; message: string };

const WORKER_START_TIMEOUT_MS = 10_000;

function createWorker() {
  return new Worker(new URL("../workers/workbook.worker.ts", import.meta.url), { type: "module" });
}

function workbookDefinition(file: File) {
  const definition = dataFormatForFile(file);
  if (!definition || definition.kind !== "workbook") throw new Error("Nie rozpoznano formatu arkusza.");
  if (file.size > DATA_LIMITS.spreadsheetBytes) throw new Error(`${definition.label} przekracza limit 50 MB.`);
  return definition;
}

export async function inspectWorkbookSheets(file: File, signal?: AbortSignal): Promise<string[]> {
  const definition = workbookDefinition(file);
  if (signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");
  const worker = createWorker();
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(startupTimer);
      signal?.removeEventListener("abort", abortListener);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abortListener = () => fail(new DOMException("Import anulowany.", "AbortError"));
    const startupTimer = setTimeout(() => fail(new Error(`Nie udało się rozpocząć odczytu ${definition.label}.`)), WORKER_START_TIMEOUT_MS);
    signal?.addEventListener("abort", abortListener, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "sheets") {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(event.data.sheetNames);
      } else if (event.data.type === "error") {
        fail(new Error(event.data.message));
      }
    };
    worker.onerror = () => fail(new Error(`Nie udało się sprawdzić arkuszy ${definition.label}.`));
    worker.postMessage({ mode: "inspect", buffer }, [buffer]);
  });
}

export async function importWorkbookFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  const definition = workbookDefinition(file);
  if (!options.sheetName) throw new Error("Wybierz arkusz do zaimportowania.");

  const format = definition.extension;
  const datasetId = `${format}-${file.name}-${options.sheetName}-${file.size}-${file.lastModified}`;
  await clearDataset(datasetId);
  const worker = createWorker();
  const buffer = await file.arrayBuffer();
  const displayRows: DataRow[] = [];
  const writes: Promise<void>[] = [];
  let headers: string[] = [];
  let chunkCount = 0;
  let settled = false;

  return new Promise((resolve, reject) => {
    let startupTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      void abort(new Error(`Nie udało się rozpocząć importu ${definition.label}.`));
    }, WORKER_START_TIMEOUT_MS);
    const abort = async (error: Error) => {
      if (settled) return;
      settled = true;
      if (startupTimer) clearTimeout(startupTimer);
      worker.terminate();
      await clearDataset(datasetId).catch(() => undefined);
      reject(error);
    };
    const abortListener = () => void abort(new DOMException("Import anulowany.", "AbortError"));
    options.signal?.addEventListener("abort", abortListener, { once: true });
    options.onProgress?.({ stage: "preparing", processedRows: 0, percent: 0, message: `Przygotowanie arkusza ${definition.label}` });
    worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = undefined;
      }
      const message = event.data;
      if (message.type === "error") {
        await abort(new Error(message.message));
        return;
      }
      if (message.type === "start") {
        headers = message.headers;
        options.onProgress?.({ stage: "reading", processedRows: 0, percent: 2, message: `Odczytywanie arkusza ${options.sheetName}` });
        return;
      }
      if (message.type === "chunk") {
        if (displayRows.length < DATA_LIMITS.sampleRows) {
          displayRows.push(...message.rows.slice(0, DATA_LIMITS.sampleRows - displayRows.length));
        }
        writes.push(saveDatasetChunk(datasetId, message.index, message.rows));
        chunkCount = Math.max(chunkCount, message.index + 1);
        options.onProgress?.({
          stage: "reading",
          processedRows: message.processedRows,
          percent: Math.min(98, Math.round((message.processedRows / Math.max(1, message.totalRows)) * 100)),
          message: `Wczytano ${message.processedRows.toLocaleString("pl-PL")} rekordów`,
        });
        return;
      }
      if (message.type === "complete") {
        try {
          options.onProgress?.({ stage: "storing", processedRows: message.totalRows, percent: 99, message: "Zapisywanie danych lokalnie" });
          await Promise.all(writes);
          if (!headers.length || message.totalRows === 0) throw new Error("Arkusz nie zawiera tabeli z danymi.");
          const meta = {
            id: datasetId,
            name: file.name,
            format,
            sheetName: options.sheetName,
            headers,
            totalRows: message.totalRows,
            fileSize: file.size,
            importedAt: new Date().toISOString(),
            chunkCount,
            sampled: message.totalRows > displayRows.length,
          };
          await saveDatasetMeta(meta);
          settled = true;
          worker.terminate();
          options.signal?.removeEventListener("abort", abortListener);
          options.onProgress?.({ stage: "complete", processedRows: message.totalRows, percent: 100, message: "Import zakończony" });
          resolve({ meta, displayRows, warnings: [] });
        } catch (error) {
          await abort(error instanceof Error ? error : new Error(`Nie udało się zapisać danych ${definition.label}.`));
        }
      }
    };
    worker.onerror = () => void abort(new Error(`Nie udało się przetworzyć pliku ${definition.label}.`));
    worker.postMessage({
      mode: "parse",
      buffer,
      sheetName: options.sheetName,
      rowLimit: DATA_LIMITS.spreadsheetRows,
      chunkRows: DATA_LIMITS.chunkRows,
    }, [buffer]);
  });
}
