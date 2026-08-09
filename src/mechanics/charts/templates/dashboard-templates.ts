import type { ChartColumn, ChartDefinition } from "../types/chart-types";

export type DashboardGrid = 1 | 4 | 9 | "custom";

export type DashboardTemplate = {
  id: string;
  name: string;
  grid: DashboardGrid;
  charts: ChartDefinition[];
  version: 1;
  createdAt: string;
  updatedAt: string;
};

function cloneCharts(charts: ChartDefinition[]): ChartDefinition[] {
  return charts.map((chart) => ({
    ...chart,
    yFields: [...chart.yFields],
    filters: chart.filters.map((filter) => ({ ...filter })),
    thresholds: (chart.thresholds ?? []).map((rule) => ({ ...rule })),
    comparison: chart.comparison ? { ...chart.comparison } : undefined,
    timeRange: chart.timeRange ? { ...chart.timeRange } : undefined,
  }));
}

export function createDashboardTemplate(name: string, grid: DashboardGrid, charts: ChartDefinition[]): DashboardTemplate {
  const now = new Date().toISOString();
  return { id: `template-${Date.now()}`, name: name.trim() || "Mój układ", grid, charts: cloneCharts(charts), version: 1, createdAt: now, updatedAt: now };
}

function normalized(value: string) {
  return value.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function applyTemplateToDataset(template: DashboardTemplate, columns: ChartColumn[], datasetId: string) {
  const byNormalized = new Map(columns.map((column) => [normalized(column.name), column.name]));
  const missing = new Set<string>();
  const resolve = (field: string) => {
    const match = byNormalized.get(normalized(field));
    if (!match) missing.add(field);
    return match ?? field;
  };
  const charts = cloneCharts(template.charts).map((chart) => ({
    ...chart,
    datasetId,
    xField: resolve(chart.xField),
    yFields: chart.yFields.map(resolve),
    seriesField: chart.seriesField ? resolve(chart.seriesField) : undefined,
    timeRange: chart.timeRange ? { ...chart.timeRange, field: resolve(chart.timeRange.field) } : undefined,
    filters: chart.filters.map((filter) => ({ ...filter, field: resolve(filter.field) })),
    comparison: chart.comparison ? { ...chart.comparison, referenceField: resolve(chart.comparison.referenceField) } : undefined,
    thresholds: (chart.thresholds ?? []).map((rule) => ({ ...rule, field: resolve(rule.field) })),
  }));
  return { charts, missing: Array.from(missing) };
}

export function remapChartFields(charts: ChartDefinition[], fieldMap: Record<string, string>, datasetId: string) {
  const resolve = (field: string) => fieldMap[field] || field;
  return cloneCharts(charts).map((chart) => ({
    ...chart,
    datasetId,
    xField: resolve(chart.xField),
    yFields: chart.yFields.map(resolve),
    seriesField: chart.seriesField ? resolve(chart.seriesField) : undefined,
    timeRange: chart.timeRange ? { ...chart.timeRange, field: resolve(chart.timeRange.field) } : undefined,
    filters: chart.filters.map((filter) => ({ ...filter, field: resolve(filter.field) })),
    comparison: chart.comparison ? { ...chart.comparison, referenceField: resolve(chart.comparison.referenceField) } : undefined,
    thresholds: (chart.thresholds ?? []).map((rule) => ({ ...rule, field: resolve(rule.field) })),
  }));
}

export function isDashboardTemplate(value: unknown): value is DashboardTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<DashboardTemplate>;
  return template.version === 1 && typeof template.id === "string" && typeof template.name === "string" && [1, 4, 9, "custom"].includes(template.grid as DashboardGrid) && Array.isArray(template.charts);
}
