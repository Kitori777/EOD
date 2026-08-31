import type { DataRow } from "../../charts/types/chart-types";
import type { ModelMemoryEntry } from "../types/model-types";
import type { WhatIfScenario } from "../../simulation/types/simulation-types";

function timeValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function inEntryRange(row: DataRow, entry: ModelMemoryEntry): boolean {
  if (!entry.timeField || (!entry.from && !entry.to)) return true;
  const current = timeValue(row[entry.timeField]);
  if (current == null) return false;
  const from = entry.from ? timeValue(entry.from) : null;
  const to = entry.to ? timeValue(entry.to) : null;
  return (from == null || current >= from) && (to == null || current <= to);
}

export function applyMemoryValue(value: number, entry: Pick<ModelMemoryEntry, "operation" | "value">): number {
  if (entry.operation === "percent") return value * (1 + entry.value / 100);
  if (entry.operation === "add") return value + entry.value;
  if (entry.operation === "multiply") return value * entry.value;
  return entry.value;
}

export function applyModelMemory(rows: DataRow[], entries: ModelMemoryEntry[]): DataRow[] {
  const active = entries.filter((entry) => entry.enabled && entry.useInModel && entry.field);
  if (!active.length) return rows;
  return rows.map((row) => {
    let next = row;
    for (const entry of active) {
      if (!inEntryRange(row, entry)) continue;
      const source = Number(next[entry.field]);
      if (!Number.isFinite(source)) continue;
      if (next === row) next = { ...row };
      next[entry.field] = String(Number(applyMemoryValue(source, entry).toPrecision(15)));
    }
    return next;
  });
}

export function modelMemoryToScenario(entry: ModelMemoryEntry, index = 0): WhatIfScenario {
  return {
    id: `memory-scenario-${entry.id}-${Date.now()}-${index}`,
    name: entry.name,
    inputField: entry.field,
    operation: entry.operation,
    value: entry.value,
    scope: entry.timeField && (entry.from || entry.to)
      ? { kind: "time", field: entry.timeField, from: entry.from, to: entry.to }
      : { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
    econometricModel: "auto",
    econometricMaxLag: 12,
  };
}

export function describeMemoryChange(entry: ModelMemoryEntry, english = false): string {
  const sign = entry.value > 0 ? "+" : "";
  if (entry.operation === "percent") return `${entry.field}: ${sign}${entry.value}%`;
  if (entry.operation === "add") return `${entry.field}: ${sign}${entry.value}`;
  if (entry.operation === "multiply") return `${entry.field}: ×${entry.value}`;
  return `${entry.field}: ${english ? "set to" : "ustawiono"} ${entry.value}`;
}
