import type { DataRow } from "../../charts/types/chart-types";
import type { ImportedDataset } from "../types/data-types";

const TIME_ALIASES = new Set(["timestamp", "time", "datetime", "date", "date_time", "event_time", "recorded_at", "data", "czas", "data_czas", "ts"]);
const TAG_ALIASES = new Set(["tag", "tagid", "tag_id", "tagname", "tag_name", "signal", "signal_name", "variable", "variable_name", "parameter", "name", "nazwa", "punkt", "point", "point_name", "channel", "sensor"]);
const VALUE_ALIASES = new Set(["value", "val", "tagvalue", "tag_value", "current_value", "process_value", "reading", "measurement", "measurement_value", "wartosc", "wynik", "pv", "numericvalue"]);
const META_ALIASES = new Set(["quality", "jakosc", "status", "unit", "jednostka", "engineeringunit", "alarm", "source", "zrodlo"]);
const MAX_PIVOT_COLUMNS = 1_000;

function canonical(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function matchingHeader(headers: string[], aliases: Set<string>) {
  return headers.find((header) => aliases.has(canonical(header)));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function normalizeDateValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const local = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?$/);
  if (local) {
    const day = Number(local[1]);
    const month = Number(local[2]);
    const year = Number(local[3]);
    const hour = Number(local[4] ?? 0);
    const minute = Number(local[5] ?? 0);
    const second = Number(local[6] ?? 0);
    if (month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate() && hour <= 23 && minute <= 59 && second <= 59) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      return local[4] ? `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}` : date;
    }
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function normalizeTimeColumn(rows: DataRow[], header: string) {
  let changed = false;
  const normalized = rows.map((row) => {
    const current = row[header] ?? "";
    const next = normalizeDateValue(current);
    if (!next || next === current) return row;
    changed = true;
    return { ...row, [header]: next };
  });
  return { rows: normalized, changed };
}

function uniqueHeader(preferred: string, used: Set<string>) {
  const base = preferred.trim() || "Tag";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base} (${index})`)) index += 1;
  const result = `${base} (${index})`;
  used.add(result);
  return result;
}

function transposeTagMatrix(dataset: ImportedDataset, tagHeader: string): ImportedDataset | null {
  const timestampHeaders = dataset.meta.headers.filter((header) => header !== tagHeader);
  if (timestampHeaders.length < 2) return null;
  const dateHeaders = timestampHeaders.filter((header) => normalizeDateValue(header));
  if (dateHeaders.length / timestampHeaders.length < 0.6) return null;

  const used = new Set<string>(["Timestamp"]);
  const tagNames = new Map<string, string>();
  for (const row of dataset.displayRows) {
    const tag = (row[tagHeader] ?? "").trim();
    if (tag && !tagNames.has(tag)) tagNames.set(tag, uniqueHeader(tag, used));
  }
  if (!tagNames.size || tagNames.size + 1 > MAX_PIVOT_COLUMNS) return null;

  const rows = dateHeaders.map((sourceTime) => {
    const row: DataRow = { Timestamp: normalizeDateValue(sourceTime) ?? sourceTime };
    for (const source of dataset.displayRows) {
      const tag = (source[tagHeader] ?? "").trim();
      const output = tagNames.get(tag);
      if (output) row[output] = source[sourceTime] ?? "";
    }
    return row;
  });
  const headers = ["Timestamp", ...tagNames.values()];
  return {
    meta: { ...dataset.meta, headers, totalRows: rows.length, sourceRows: dataset.meta.totalRows, layout: "transposed", chunkCount: Math.ceil(rows.length / 5_000), sampled: false },
    displayRows: rows,
    warnings: [...dataset.warnings, `Rozpoznano tabelę odwróconą: ${tagNames.size.toLocaleString("pl-PL")} tagów ułożono w kolumnach, a czas w wierszach.`],
  };
}

function pivotLongTags(dataset: ImportedDataset, timeHeader: string, tagHeader: string, valueHeader: string): ImportedDataset | null {
  const tagValues = [...new Set(dataset.displayRows.map((row) => (row[tagHeader] ?? "").trim()).filter(Boolean))];
  const metaHeaders = dataset.meta.headers.filter((header) => META_ALIASES.has(canonical(header)));
  const projectedColumns = 1 + tagValues.length * (1 + metaHeaders.length);
  if (tagValues.length < 2 || projectedColumns > MAX_PIVOT_COLUMNS) return null;

  const used = new Set<string>([timeHeader]);
  const tagNames = new Map(tagValues.map((tag) => [tag, uniqueHeader(tag, used)]));
  const rowsByTime = new Map<string, DataRow>();
  let duplicateValues = 0;
  dataset.displayRows.forEach((source, index) => {
    const rawTime = source[timeHeader] ?? "";
    const time = normalizeDateValue(rawTime) ?? rawTime.trim();
    const groupKey = time || `__row_${index}`;
    let target = rowsByTime.get(groupKey);
    if (!target) {
      target = { [timeHeader]: time };
      rowsByTime.set(groupKey, target);
    }
    const tag = (source[tagHeader] ?? "").trim();
    const output = tagNames.get(tag);
    if (!output) return;
    if (target[output] !== undefined && target[output] !== "") duplicateValues += 1;
    target[output] = source[valueHeader] ?? "";
    for (const metadataHeader of metaHeaders) {
      const metadataValue = source[metadataHeader] ?? "";
      if (metadataValue !== "") target[`${output} · ${metadataHeader}`] = metadataValue;
    }
  });

  const rowValues = [...rowsByTime.values()];
  const metadataOutputs: string[] = [];
  for (const tag of tagValues) {
    const output = tagNames.get(tag)!;
    for (const metadataHeader of metaHeaders) {
      const header = `${output} · ${metadataHeader}`;
      if (rowValues.some((row) => row[header] !== undefined)) metadataOutputs.push(header);
    }
  }
  const headers = [timeHeader, ...tagValues.map((tag) => tagNames.get(tag)!), ...metadataOutputs];
  const estimatedRows = dataset.meta.sampled
    ? Math.ceil(dataset.meta.totalRows / Math.max(1, tagValues.length))
    : rowValues.length;
  const warnings = [...dataset.warnings, `Rozpoznano układ czas + tag + wartość: ${dataset.meta.totalRows.toLocaleString("pl-PL")} rekordów ułożono w ${tagValues.length.toLocaleString("pl-PL")} kolumn tagów.`];
  if (metaHeaders.length) warnings.push(`Zachowano metadane tagów: ${metaHeaders.join(", ")}.`);
  if (duplicateValues) warnings.push(`${duplicateValues.toLocaleString("pl-PL")} powtórzonych par czas–tag zastąpiono ostatnią wartością.`);
  return {
    meta: { ...dataset.meta, headers, totalRows: estimatedRows, sourceRows: dataset.meta.totalRows, layout: "long-pivoted", chunkCount: Math.ceil(rowValues.length / 5_000), sampled: dataset.meta.sampled || estimatedRows > rowValues.length },
    displayRows: rowValues,
    warnings,
  };
}

export function normalizeImportedLayout(dataset: ImportedDataset): ImportedDataset {
  if (!dataset.displayRows.length) return dataset;
  const headers = dataset.meta.headers;
  const timeHeader = matchingHeader(headers, TIME_ALIASES);
  const tagHeader = matchingHeader(headers, TAG_ALIASES);
  const explicitValueHeader = matchingHeader(headers, VALUE_ALIASES);
  const remainingValueHeaders = headers.filter((header) => header !== timeHeader && header !== tagHeader && !META_ALIASES.has(canonical(header)));
  const valueHeader = explicitValueHeader ?? (remainingValueHeaders.length === 1 ? remainingValueHeaders[0] : undefined);

  if (tagHeader) {
    const transposed = transposeTagMatrix(dataset, tagHeader);
    if (transposed) return transposed;
  }
  if (timeHeader && tagHeader && valueHeader && new Set([timeHeader, tagHeader, valueHeader]).size === 3) {
    const pivoted = pivotLongTags(dataset, timeHeader, tagHeader, valueHeader);
    if (pivoted) return pivoted;
  }
  if (timeHeader && tagHeader && !valueHeader) {
    return { ...dataset, warnings: [...dataset.warnings, "Rozpoznano kolumny czasu i tagu, ale brak kolumny Value/Wartość — dane pozostawiono w układzie źródłowym."] };
  }
  if (timeHeader) {
    const normalized = normalizeTimeColumn(dataset.displayRows, timeHeader);
    if (normalized.changed) {
      return { ...dataset, meta: { ...dataset.meta, layout: "wide" }, displayRows: normalized.rows, warnings: [...dataset.warnings, `Daty w kolumnie ${timeHeader} ujednolicono do formatu obsługiwanego przez wykresy.`] };
    }
  }
  return dataset;
}
