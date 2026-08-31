import type { DataRow } from "../../charts/types/chart-types";
import type { Scenario, ScenarioMetrics } from "../types/model-types";

function matchingHeader(headers: string[], aliases: string[]) {
  return headers.find((candidate) => aliases.some((alias) => candidate.toLowerCase().includes(alias)));
}

function numericAverage(rows: DataRow[], header: string | undefined, fallback: number): number {
  if (!header) return fallback;

  const values = rows
    .map((row) => Number((row[header] ?? "").replace(",", ".")))
    .filter(Number.isFinite);

  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

export function supportsScenarioModel(headers: string[]) {
  return Boolean(
    matchingHeader(headers, ["revenue", "sales", "przych", "obrót"])
    && matchingHeader(headers, ["cost", "koszt", "expense"]),
  );
}

export function calculateScenario(item: Scenario, rows: DataRow[], headers: string[]): ScenarioMetrics {
  if (!supportsScenarioModel(headers)) return { revenue: 0, cost: 0, profit: 0, margin: 0, customers: 0, risk: 0 };
  const baseRevenue = numericAverage(rows, matchingHeader(headers, ["revenue", "sales", "przych", "obrót"]), 0);
  const baseCost = numericAverage(rows, matchingHeader(headers, ["cost", "koszt", "expense"]), 0);
  const baseCustomers = numericAverage(rows, matchingHeader(headers, ["customer", "klient", "users"]), Math.max(rows.length, 1));
  const priceEffect = 1 + item.priceChange / 100;
  const demandEffect = 1 - Math.max(item.priceChange, 0) * 0.004 + Math.min(item.priceChange, 0) * 0.002;
  const campaignEffect = item.choices.campaign === "4" ? 1.08 : 1.035;
  const marketEffect = item.choices.market === "9" ? 1.14 : 1.04;
  const marketingEffect = 1 + item.marketingChange * 0.0032;
  const conversionEffect = 1 + item.conversionChange / 100;
  const customers = Math.round(baseCustomers * demandEffect * campaignEffect * marketEffect * marketingEffect * conversionEffect);
  const revenue = baseRevenue * priceEffect * (customers / baseCustomers);
  const variableCost = baseCost * (0.72 + 0.28 * (customers / baseCustomers));
  const campaignCost = baseCost * Math.max(item.marketingChange, 0) * 0.0035;
  const expansionCost = item.choices.market === "9" ? 54_000 : 16_000;
  const cost = variableCost + campaignCost + expansionCost;
  const profit = revenue - cost;
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const risk = Math.min(96, Math.max(8, 28 + item.marketingChange * 0.12 + (item.choices.market === "9" ? 10 : 2) - item.conversionChange * 0.18));

  return { revenue, cost, profit, margin, customers, risk };
}
