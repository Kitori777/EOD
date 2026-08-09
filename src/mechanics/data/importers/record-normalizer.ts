import type { DataRow } from "../../charts/types/chart-types";

export type UnknownRecord = Record<string, unknown>;

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue: unknown) =>
    typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
  );
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return safeJson(value);
}

export function requireRecord(value: unknown, description: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} musi być obiektem z nazwanymi polami.`);
  }
  return value as UnknownRecord;
}

export function parseJsonDocument(text: string): UnknownRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Nieprawidłowy JSON: ${error instanceof Error ? error.message : "błąd składni"}`);
  }

  const values = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : [parsed];
  if (values.length === 0) throw new Error("JSON nie zawiera żadnych rekordów.");
  return values.map((value, index) => requireRecord(value, `Rekord JSON ${index + 1}`));
}

export function normalizeRecord(record: UnknownRecord): DataRow {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, cellToString(value)]));
}

export function collectHeaders(records: readonly UnknownRecord[], preferredHeaders: readonly string[] = []): string[] {
  const headers = new Set(preferredHeaders);
  records.forEach((record) => Object.keys(record).forEach((key) => headers.add(key)));
  return [...headers];
}
