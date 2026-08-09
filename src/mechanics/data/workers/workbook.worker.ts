/// <reference lib="webworker" />

import { read, utils } from "xlsx";

type WorkerRequest =
  | { mode: "inspect"; buffer: ArrayBuffer }
  | { mode: "parse"; buffer: ArrayBuffer; sheetName: string; rowLimit: number; chunkRows: number };

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.mode === "inspect") {
      const workbook = read(event.data.buffer, { type: "array", bookSheets: true });
      self.postMessage({ type: "sheets", sheetNames: workbook.SheetNames });
      return;
    }
    const workbook = read(event.data.buffer, { type: "array", dense: true, cellDates: true });
    const sheet = workbook.Sheets[event.data.sheetName];
    if (!sheet) throw new Error(`Nie znaleziono arkusza „${event.data.sheetName}”.`);
    const matrix = utils.sheet_to_json<Array<string | number | boolean | Date>>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const rawHeaders = matrix[0] ?? [];
    const used = new Map<string, number>();
    const headers = rawHeaders.map((value, index) => {
      const base = String(value || `kolumna_${index + 1}`).trim();
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      return count ? `${base}_${count + 1}` : base;
    });
    const body = matrix.slice(1);
    if (body.length > event.data.rowLimit) {
      throw new Error(`Arkusz przekracza limit ${event.data.rowLimit.toLocaleString("pl-PL")} rekordów.`);
    }
    self.postMessage({ type: "start", headers, totalRows: body.length });
    for (let offset = 0; offset < body.length; offset += event.data.chunkRows) {
      const chunk = body.slice(offset, offset + event.data.chunkRows).map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "")])),
      );
      self.postMessage({
        type: "chunk",
        index: Math.floor(offset / event.data.chunkRows),
        rows: chunk,
        processedRows: Math.min(body.length, offset + chunk.length),
        totalRows: body.length,
      });
    }
    self.postMessage({ type: "complete", totalRows: body.length });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Nie udało się odczytać skoroszytu." });
  }
});
