import type { DataRow } from "../../charts/types/chart-types";
import { clearDataset, saveDatasetChunk, saveDatasetMeta } from "../storage/dataset-store";
import { DATA_LIMITS, type DatasetFormat, type ImportedDataset, type ImportOptions } from "../types/data-types";
import { dataFormatForFile } from "./format-registry";

type WorkerMessage =
  | { type: "start"; headers: string[] }
  | { type: "chunk"; index: number; rows: DataRow[]; processedRows: number; cursor: number; warnings: string[] }
  | { type: "complete"; totalRows: number; chunkCount: number }
  | { type: "error"; message: string };

const WORKER_START_TIMEOUT_MS = 10_000;

function delimiterFor(format: DatasetFormat): string | undefined {
  return format === "tsv" ? "\t" : undefined;
}

function createWorker() {
  return new Worker(new URL("../workers/delimited.worker.ts", import.meta.url), { type: "module" });
}

export async function importDelimitedFile(file: File, options: ImportOptions = {}): Promise<ImportedDataset> {
  const definition = dataFormatForFile(file);
  if (!definition || definition.kind !== "delimited") throw new Error("Nie rozpoznano formatu tekstowego.");
  if (file.size > DATA_LIMITS.delimitedBytes) throw new Error(`${definition.label} przekracza limit 500 MB.`);
  if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");

  const format = definition.extension;
  const datasetId = `${format}-${file.name}-${file.size}-${file.lastModified}`;
  await clearDataset(datasetId);
  if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");

  const worker = createWorker();
  const displayRows: DataRow[] = [];
  const warnings: string[] = [];
  let headers: string[] = [];
  let settled = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;

  options.onProgress?.({ stage: "preparing", processedRows: 0, percent: 0, message: `Przygotowanie importu ${definition.label}` });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (startupTimer) clearTimeout(startupTimer);
      options.signal?.removeEventListener("abort", abortListener);
      worker.terminate();
    };

    const fail = async (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      await clearDataset(datasetId).catch(() => undefined);
      reject(error instanceof Error ? error : new Error(`Nie udało się odczytać pliku ${definition.label}.`));
    };

    const abortListener = () => {
      worker.postMessage({ type: "abort" });
      void fail(new DOMException("Import anulowany.", "AbortError"));
    };

    options.signal?.addEventListener("abort", abortListener, { once: true });
    startupTimer = setTimeout(() => {
      void fail(new Error(`Import ${definition.label} nie rozpoczął się. Spróbuj ponownie lub sprawdź plik.`));
    }, WORKER_START_TIMEOUT_MS);

    worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
      if (settled) return;
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = undefined;
      }
      const message = event.data;
      if (message.type === "error") {
        await fail(new Error(message.message));
        return;
      }
      if (message.type === "start") {
        headers = message.headers;
        options.onProgress?.({ stage: "reading", processedRows: 0, percent: 1, message: `Odczytywanie ${definition.label}` });
        return;
      }
      if (message.type === "chunk") {
        try {
          if (options.signal?.aborted) throw new DOMException("Import anulowany.", "AbortError");
          if (displayRows.length < DATA_LIMITS.sampleRows) {
            displayRows.push(...message.rows.slice(0, DATA_LIMITS.sampleRows - displayRows.length));
          }
          if (message.rows.length) await saveDatasetChunk(datasetId, message.index, message.rows);
          warnings.push(...message.warnings);
          options.onProgress?.({
            stage: "reading",
            processedRows: message.processedRows,
            percent: Math.min(98, Math.round((message.cursor / Math.max(1, file.size)) * 100)),
            message: `Wczytano ${message.processedRows.toLocaleString("pl-PL")} rekordów`,
          });
          worker.postMessage({ type: "resume" });
        } catch (error) {
          await fail(error);
        }
        return;
      }
      if (message.type === "complete") {
        try {
          if (!headers.length || message.totalRows === 0) throw new Error("Plik nie zawiera tabeli z danymi.");
          options.onProgress?.({ stage: "storing", processedRows: message.totalRows, percent: 99, message: "Zapisywanie danych lokalnie" });
          const meta = {
            id: datasetId,
            name: file.name,
            format,
            headers,
            totalRows: message.totalRows,
            fileSize: file.size,
            importedAt: new Date().toISOString(),
            chunkCount: message.chunkCount,
            sampled: message.totalRows > displayRows.length,
          };
          await saveDatasetMeta(meta);
          settled = true;
          cleanup();
          options.onProgress?.({ stage: "complete", processedRows: message.totalRows, percent: 100, message: "Import zakończony" });
          resolve({ meta, displayRows, warnings: warnings.slice(0, 50) });
        } catch (error) {
          await fail(error);
        }
      }
    };

    worker.onerror = () => void fail(new Error(`Nie udało się uruchomić importu ${definition.label}.`));
    worker.postMessage({
      type: "parse",
      file,
      delimiter: delimiterFor(format),
      rowLimit: DATA_LIMITS.delimitedRows,
      chunkSize: 5 * 1024 * 1024,
    });
  });
}
