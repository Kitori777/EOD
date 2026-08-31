import type { DataRow } from "../../charts/types/chart-types";
import type { ForecastPoint, ForecastResult, ForecastSpec } from "../types/simulation-types";

function numericValue(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timestampLabel(previous: string, step: number, index: number): string {
  const parsed = Date.parse(previous);
  return Number.isNaN(parsed) ? `Prognoza ${index + 1}` : new Date(parsed + step * (index + 1)).toISOString();
}

function confidence(points: number[], fitted: number[]): number {
  if (!points.length || points.length !== fitted.length) return 0;
  const variance = points.reduce((sum, value, index) => sum + (value - fitted[index]) ** 2, 0) / Math.max(1, points.length - 1);
  return 1.96 * Math.sqrt(variance);
}

export function buildForecast(rows: DataRow[], spec: ForecastSpec): ForecastResult {
  const observed = rows
    .map((row) => ({ x: row[spec.timeField] ?? "", value: numericValue(row[spec.valueField]) }))
    .filter((point): point is { x: string; value: number } => Boolean(point.x) && point.value != null)
    .sort((left, right) => {
      const a = Date.parse(left.x);
      const b = Date.parse(right.x);
      return Number.isNaN(a) || Number.isNaN(b) ? left.x.localeCompare(right.x, "pl", { numeric: true }) : a - b;
    });
  if (observed.length < 8) return { observed, forecast: [], method: spec.method, mae: null, sampleSize: observed.length, warning: "Prognoza wymaga co najmniej 8 poprawnych punktów." };
  const values = observed.map((point) => point.value);
  const horizon = Math.max(1, Math.min(48, Math.round(spec.horizon)));
  let predictions: number[] = [];
  let fitted: number[] = [];
  if (spec.method === "linear") {
    const meanX = (values.length - 1) / 2;
    const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
    const covariance = values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0);
    const variance = values.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0);
    const slope = variance ? covariance / variance : 0;
    const intercept = meanY - slope * meanX;
    fitted = values.map((_, index) => intercept + slope * index);
    predictions = Array.from({ length: horizon }, (_, index) => intercept + slope * (values.length + index));
  } else if (spec.method === "moving-average") {
    const window = Math.max(2, Math.min(values.length, Math.round(spec.movingWindow ?? 5)));
    fitted = values.map((value, index) => index < window ? value : values.slice(index - window, index).reduce((sum, item) => sum + item, 0) / window);
    const working = [...values];
    predictions = Array.from({ length: horizon }, () => {
      const next = working.slice(-window).reduce((sum, item) => sum + item, 0) / window;
      working.push(next);
      return next;
    });
  } else {
    const alpha = Math.max(0.05, Math.min(0.95, spec.alpha ?? 0.3));
    let level = values[0];
    fitted = values.map((value, index) => {
      if (index === 0) return level;
      level = alpha * value + (1 - alpha) * level;
      return level;
    });
    predictions = Array.from({ length: horizon }, () => level);
  }
  const error = confidence(values, fitted);
  const mae = values.reduce((sum, value, index) => sum + Math.abs(value - fitted[index]), 0) / values.length;
  const parsedTimes = observed.map((point) => Date.parse(point.x)).filter(Number.isFinite);
  const steps = parsedTimes.slice(1).map((value, index) => value - parsedTimes[index]).filter((value) => value > 0);
  const step = steps.length ? median(steps) : 1;
  const lastX = observed.at(-1)?.x ?? "";
  const forecast: ForecastPoint[] = predictions.map((value, index) => ({
    x: timestampLabel(lastX, step, index),
    value,
    lower: value - error,
    upper: value + error,
  }));
  return { observed, forecast, method: spec.method, mae, sampleSize: observed.length };
}
