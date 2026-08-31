import type { Aggregation, DataRow } from "../charts/types/chart-types";

function parseNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ComparisonMode = "columns" | "groups";

export type DataComparison = {
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  difference: number;
  percent: number | null;
  leftRecords: number;
  rightRecords: number;
};

export function aggregateField(rows: DataRow[], field: string, aggregation: Aggregation): { value: number; records: number } {
  if (aggregation === "count") return { value: rows.length, records: rows.length };
  const values = rows.map((row) => parseNumber(row[field])).filter((value): value is number => value != null);
  if (!values.length) return { value: 0, records: 0 };
  if (aggregation === "average") return { value: values.reduce((sum, value) => sum + value, 0) / values.length, records: values.length };
  if (aggregation === "min") return { value: Math.min(...values), records: values.length };
  if (aggregation === "max") return { value: Math.max(...values), records: values.length };
  return { value: values.reduce((sum, value) => sum + value, 0), records: values.length };
}

function finish(leftLabel: string, rightLabel: string, left: { value: number; records: number }, right: { value: number; records: number }): DataComparison {
  const difference = right.value - left.value;
  return {
    leftLabel,
    rightLabel,
    leftValue: left.value,
    rightValue: right.value,
    difference,
    percent: left.value === 0 ? null : (difference / Math.abs(left.value)) * 100,
    leftRecords: left.records,
    rightRecords: right.records,
  };
}

export function compareColumns(rows: DataRow[], leftField: string, rightField: string, aggregation: Aggregation): DataComparison {
  return finish(leftField, rightField, aggregateField(rows, leftField, aggregation), aggregateField(rows, rightField, aggregation));
}

export function compareGroups(rows: DataRow[], metricField: string, groupField: string, leftGroup: string, rightGroup: string, aggregation: Aggregation): DataComparison {
  const leftRows = rows.filter((row) => String(row[groupField] ?? "") === leftGroup);
  const rightRows = rows.filter((row) => String(row[groupField] ?? "") === rightGroup);
  return finish(leftGroup, rightGroup, aggregateField(leftRows, metricField, aggregation), aggregateField(rightRows, metricField, aggregation));
}

export function getGroupValues(rows: DataRow[], field: string, limit = 250): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = String(row[field] ?? "").trim();
    if (value) values.add(value);
    if (values.size >= limit) break;
  }
  return [...values].sort((left, right) => left.localeCompare(right, "pl", { numeric: true }));
}
