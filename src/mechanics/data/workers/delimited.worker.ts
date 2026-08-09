/// <reference lib="webworker" />

import Papa, { type ParseError, type ParseResult, type Parser } from "papaparse";

import type { DataRow } from "../../charts/types/chart-types";

type ParseRequest = {
  type: "parse";
  file: File;
  delimiter?: string;
  rowLimit: number;
  chunkSize: number;
};

type ControlRequest = { type: "resume" } | { type: "abort" };

const workerScope = self as DedicatedWorkerGlobalScope;
let activeParser: Parser | null = null;
let aborted = false;

function normalizedRows(rows: DataRow[]): DataRow[] {
  return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== ""));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nie udało się odczytać pliku tekstowego.";
}

workerScope.onmessage = (event: MessageEvent<ParseRequest | ControlRequest>) => {
  const message = event.data;
  if (message.type === "resume") {
    activeParser?.resume();
    return;
  }
  if (message.type === "abort") {
    aborted = true;
    activeParser?.abort();
    return;
  }

  aborted = false;
  let headers: string[] = [];
  let totalRows = 0;
  let chunkIndex = 0;

  try {
    Papa.parse<DataRow>(message.file, {
      header: true,
      worker: false,
      delimiter: message.delimiter,
      skipEmptyLines: "greedy",
      chunkSize: message.chunkSize,
      chunk: (result: ParseResult<DataRow>, parser: Parser) => {
        activeParser = parser;
        if (aborted) {
          parser.abort();
          return;
        }
        if (!headers.length) {
          headers = (result.meta.fields ?? []).filter(Boolean);
          workerScope.postMessage({ type: "start", headers });
        }
        const rows = normalizedRows(result.data);
        if (totalRows + rows.length > message.rowLimit) {
          parser.abort();
          workerScope.postMessage({ type: "error", message: "Plik przekracza limit 2 000 000 rekordów." });
          return;
        }
        totalRows += rows.length;
        parser.pause();
        workerScope.postMessage({
          type: "chunk",
          index: chunkIndex,
          rows,
          processedRows: totalRows,
          cursor: result.meta.cursor ?? 0,
          warnings: result.errors.slice(0, 10).map((error: ParseError) => `Wiersz ${error.row ?? "?"}: ${error.message}`),
        });
        chunkIndex += 1;
      },
      complete: () => {
        activeParser = null;
        if (!aborted) workerScope.postMessage({ type: "complete", totalRows, chunkCount: chunkIndex });
      },
      error: (error) => workerScope.postMessage({ type: "error", message: errorMessage(error) }),
    });
  } catch (error) {
    workerScope.postMessage({ type: "error", message: errorMessage(error) });
  }
};

export {};
