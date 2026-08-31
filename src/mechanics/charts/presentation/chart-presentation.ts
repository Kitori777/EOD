import type { ChartPalette, ChartPresentation } from "../types/chart-types";

export const DEFAULT_CHART_PRESENTATION: ChartPresentation = {
  palette: "theme",
  lineCurve: "smooth",
  lineWidth: 3,
  showSymbols: false,
  areaOpacity: 16,
  barOrientation: "vertical",
  stacked: false,
  showDataLabels: false,
  legendPosition: "top",
  showGrid: true,
  showZoom: true,
  showBrush: false,
};

export const CHART_PALETTES: Record<Exclude<ChartPalette, "theme" | "custom">, string[]> = {
  ocean: ["#0f9f91", "#3972db", "#22a6c7", "#7657d5", "#52a078"],
  violet: ["#7657d5", "#a14fc2", "#3972db", "#d4699f", "#6457a8"],
  sunset: ["#d6683c", "#c8790a", "#d24868", "#8f62c7", "#e0a63b"],
  mono: ["#263640", "#526673", "#748794", "#9aabb4", "#c2cdd2"],
};

export function resolveChartPresentation(presentation?: Partial<ChartPresentation>): ChartPresentation {
  return { ...DEFAULT_CHART_PRESENTATION, ...presentation };
}
