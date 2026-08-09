import type { DataRow } from "../../charts/types/chart-types";
import type { DatasetMeta } from "../types/data-types";

const DATABASE_NAME = "eyes-of-odin-data-v1";
const DATABASE_VERSION = 1;
const DATASETS = "datasets";
const CHUNKS = "chunks";
const DATABASE_OPEN_TIMEOUT_MS = 8_000;

type StoredChunk = {
  key: string;
  datasetId: string;
  index: number;
  rows: DataRow[];
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Błąd lokalnego magazynu danych."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Operacja zapisu została przerwana."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Nie udało się zapisać danych lokalnie."));
  });
}

export function supportsDatasetStore() {
  return typeof indexedDB !== "undefined";
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!supportsDatasetStore()) throw new Error("Ta przeglądarka nie obsługuje lokalnego magazynu dużych danych.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Lokalny magazyn danych nie odpowiada. Zamknij inne okna aplikacji i spróbuj ponownie."));
    }, DATABASE_OPEN_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DATASETS)) database.createObjectStore(DATASETS, { keyPath: "id" });
      if (!database.objectStoreNames.contains(CHUNKS)) {
        const chunks = database.createObjectStore(CHUNKS, { keyPath: "key" });
        chunks.createIndex("datasetId", "datasetId", { unique: false });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => fail(request.error ?? new Error("Błąd lokalnego magazynu danych."));
    request.onblocked = () => fail(new Error("Magazyn danych jest używany przez inne okno aplikacji. Zamknij je i spróbuj ponownie."));
  });
}

export async function saveDatasetMeta(meta: DatasetMeta): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(DATASETS, "readwrite");
  transaction.objectStore(DATASETS).put(meta);
  await transactionDone(transaction);
  database.close();
}

export async function saveDatasetChunk(datasetId: string, index: number, rows: DataRow[]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CHUNKS, "readwrite");
  const chunk: StoredChunk = { key: `${datasetId}:${String(index).padStart(8, "0")}`, datasetId, index, rows };
  transaction.objectStore(CHUNKS).put(chunk);
  await transactionDone(transaction);
  database.close();
}

export async function clearDataset(datasetId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction([DATASETS, CHUNKS], "readwrite");
  transaction.objectStore(DATASETS).delete(datasetId);
  const index = transaction.objectStore(CHUNKS).index("datasetId");
  const request = index.openKeyCursor(IDBKeyRange.only(datasetId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    transaction.objectStore(CHUNKS).delete(cursor.primaryKey);
    cursor.continue();
  };
  await transactionDone(transaction);
  database.close();
}

export async function iterateDatasetRows(
  datasetId: string,
  visitor: (rows: DataRow[], chunkIndex: number) => void | Promise<void>,
): Promise<void> {
  const database = await openDatabase();
  const keyTransaction = database.transaction(CHUNKS, "readonly");
  const keyIndex = keyTransaction.objectStore(CHUNKS).index("datasetId");
  const keys = await requestResult(keyIndex.getAllKeys(IDBKeyRange.only(datasetId)));
  await transactionDone(keyTransaction);
  keys.sort((left, right) => String(left).localeCompare(String(right)));
  for (const key of keys) {
    const transaction = database.transaction(CHUNKS, "readonly");
    const chunk = await requestResult(transaction.objectStore(CHUNKS).get(key)) as StoredChunk | undefined;
    await transactionDone(transaction);
    if (chunk) await visitor(chunk.rows, chunk.index);
  }
  database.close();
}

export async function loadDatasetRows(datasetId: string, limit = Number.POSITIVE_INFINITY): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  await iterateDatasetRows(datasetId, (chunkRows) => {
    if (rows.length >= limit) return;
    rows.push(...chunkRows.slice(0, Math.max(0, limit - rows.length)));
  });
  return rows;
}
