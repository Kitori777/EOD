"use client";

import { BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { BrushComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, ToolboxComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { init, use as registerECharts, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { useI18n } from "../../../app/i18n/translations";
import { useAppPreferences } from "../../../app/settings/preferences";
import { buildChartDataset, buildThresholdReport, resolveThresholdRule } from "../engine/chart-engine";
import { CHART_PALETTES, resolveChartPresentation } from "../presentation/chart-presentation";
import type { ChartColumn, ChartDefinition, DataRow } from "../types/chart-types";

registerECharts([BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, ToolboxComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const colors = ["#43d9c5", "#6f93ff", "#f0b45a", "#a48aff", "#80a7c7"];
const lightColors = ["#0f9f91", "#3972db", "#c8790a", "#7657d5", "#527b98"];
type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  definition: ChartDefinition;
  height?: number;
  syncedX?: string;
  onSyncX?: (value: string) => void;
};

export type ChartRendererHandle = {
  exportImage: (format: "png" | "jpg") => boolean;
};

export const ChartRenderer = forwardRef<ChartRendererHandle, Props>(function ChartRenderer({ rows, columns, definition, height = 270, syncedX, onSyncX }, ref) {
  const { preferences } = useAppPreferences();
  const { language, locale } = useI18n();
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }), [locale]);
  const formatAxisValue = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numberFormatter.format(numeric) : String(value ?? "");
  };
  const isLight = preferences.theme === "aurora";
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const dataset = useMemo(() => buildChartDataset(rows, definition, columns), [rows, definition, columns]);
  const thresholdReport = useMemo(() => buildThresholdReport(rows, definition, columns), [rows, definition, columns]);
  const presentation = resolveChartPresentation(definition.presentation);

  useImperativeHandle(ref, () => ({
    exportImage(format) {
      const chart = chartRef.current;
      if (!chart) return false;
      const dataUrl = chart.getDataURL({ type: format === "jpg" ? "jpeg" : "png", pixelRatio: 2, backgroundColor: isLight ? "#ffffff" : "#0d1117" });
      const safeName = definition.title.trim().replace(/[^a-z0-9ąćęłńóśźż_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || (language === "en" ? "chart" : "wykres");
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${safeName}.${format}`;
      anchor.click();
      return true;
    },
  }), [definition.title, isLight, language]);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = init(hostRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(hostRef.current);

    const handleAxisPointer = (event: unknown) => {
      if (!onSyncX || !event || typeof event !== "object" || !("axesInfo" in event)) return;
      const axesInfo = (event as { axesInfo?: Array<{ value?: string | number }> }).axesInfo;
      const value = axesInfo?.[0]?.value;
      if (value != null) onSyncX(String(value));
    };
    chart.on("updateAxisPointer", handleAxisPointer);
    return () => {
      observer.disconnect();
      chart.off("updateAxisPointer", handleAxisPointer);
      chart.dispose();
      chartRef.current = null;
    };
  }, [onSyncX]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isScatter = definition.type === "scatter";
    const isHeatmap = definition.type === "heatmap";
    const isHorizontalBar = definition.type === "bar" && presentation.barOrientation === "horizontal";
    const isDenseBar = definition.type === "bar" && dataset.categories.length > 120;
    const chartType = isScatter ? "scatter" : definition.type === "histogram" || (definition.type === "bar" && !isDenseBar) ? "bar" : "line";
    const palette = presentation.palette === "theme"
      ? (isLight ? lightColors : colors)
      : presentation.palette === "custom"
        ? (presentation.customColors?.length ? presentation.customColors : lightColors)
        : CHART_PALETTES[presentation.palette];
    const legendVisible = dataset.series.filter((series) => !series.hidden).length > 1 && presentation.legendPosition !== "hidden" && !isHeatmap;
    const legendAtBottom = legendVisible && presentation.legendPosition === "bottom";
    const visibleValues = dataset.series.filter((series) => !series.hidden).flatMap((series) => series.data.flatMap((value) => typeof value === "number" ? [value] : []));
    const thresholdValues = (definition.thresholds ?? []).filter((rule) => rule.enabled).flatMap((rule) => {
      const resolved = resolveThresholdRule(rows, definition, columns, rule);
      return [resolved.lower, resolved.upper].filter((value): value is number => value != null && Number.isFinite(value));
    });
    const boundedValues = [...visibleValues, ...thresholdValues];
    const boundedMinimum = boundedValues.length ? Math.min(...boundedValues) : undefined;
    const boundedMaximum = boundedValues.length ? Math.max(...boundedValues) : undefined;
    const boundedPadding = boundedMinimum != null && boundedMaximum != null ? Math.max((boundedMaximum - boundedMinimum) * .04, Math.abs(boundedMaximum || 1) * .01) : 0;
    const categoryAxis = {
      type: "category" as const,
      data: dataset.categories,
      name: definition.xField,
      nameLocation: "middle" as const,
      nameGap: isHorizontalBar ? 52 : 32,
      nameTextStyle: { color: isLight ? "#71818f" : "#758298", fontSize: 10, fontWeight: 500 },
      axisLine: { lineStyle: { color: isLight ? "#cbd6dd" : "#354152" } },
      axisTick: { show: false },
      axisLabel: { color: isLight ? "#687888" : "#8793a6", fontSize: 10, hideOverlap: true, margin: 11 },
      splitLine: { show: false },
    };
    const valueAxis = {
      type: "value" as const,
      name: definition.type === "histogram" ? (language === "en" ? "Count" : "Liczba") : definition.yFields.join(" · "),
      nameTextStyle: { color: isLight ? "#71818f" : "#758298", fontSize: 10, fontWeight: 500, padding: [0, 0, 4, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: isLight ? "#687888" : "#8793a6", fontSize: 10, margin: 12, formatter: formatAxisValue },
      splitLine: { show: presentation.showGrid, lineStyle: { color: isLight ? "#e3eaee" : "#202a36", type: "dashed" as const } },
      scale: isDenseBar || isScatter || ["line", "area", "control", "forecast"].includes(definition.type),
      ...(!isScatter && !isHeatmap && thresholdValues.length ? { min: (boundedMinimum ?? 0) - boundedPadding, max: (boundedMaximum ?? 0) + boundedPadding } : {}),
    };
    const heatValues: number[] = [];
    if (isHeatmap) {
      dataset.series.forEach((series) => series.data.forEach((value) => {
        if (Array.isArray(value) && typeof value[2] === "number") heatValues.push(value[2]);
      }));
    }
    const heatMin = heatValues.length ? Math.min(...heatValues) : 0;
    const heatMax = heatValues.length ? Math.max(...heatValues) : 1;
    const option: EChartsCoreOption = {
      animationDuration: 320,
      animationEasing: "cubicOut",
      color: palette,
      grid: { left: isHeatmap ? 190 : isHorizontalBar ? 100 : 66, right: presentation.showDataLabels && !isHeatmap ? 58 : 28, top: legendVisible && !legendAtBottom ? 48 : 26, bottom: isHeatmap ? 105 : legendAtBottom || (presentation.showZoom && dataset.categories.length > 20) ? 62 : 42, containLabel: false },
      legend: legendVisible ? { ...(legendAtBottom ? { bottom: 5 } : { top: 5 }), left: 60, textStyle: { color: isLight ? "#687888" : "#9aa6b8", fontSize: 11 }, itemWidth: 18, itemHeight: 4, itemGap: 18 } : undefined,
      tooltip: {
        trigger: isScatter || isHeatmap || definition.type === "boxplot" ? "item" : "axis",
        axisPointer: { type: isScatter ? "cross" : "line", lineStyle: { color: "#7d8ca3", type: "dashed", width: 1 } },
        backgroundColor: isLight ? "rgba(255, 255, 255, .98)" : "rgba(10, 15, 22, .98)",
        borderColor: isLight ? "#d5dee5" : "#3a4657",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: isLight ? "#18232d" : "#e6ebf2", fontSize: 12, lineHeight: 20 },
        valueFormatter: formatAxisValue,
        extraCssText: `box-shadow:0 14px 36px rgba(26,48,62,${isLight ? ".16" : ".38"});border-radius:7px`,
      },
      xAxis: isHorizontalBar ? valueAxis : isScatter ? { ...valueAxis, name: definition.xField } : isHeatmap ? { ...categoryAxis, axisLabel: { ...categoryAxis.axisLabel, rotate: 32, margin: 14 } } : categoryAxis,
      yAxis: isHeatmap
        ? { ...categoryAxis, data: dataset.secondaryCategories ?? [], name: definition.seriesField ?? "" }
        : definition.type === "pareto"
          ? [valueAxis, { ...valueAxis, name: language === "en" ? "cumulative %" : "% skumulowany", min: 0, max: 100, axisLabel: { ...valueAxis.axisLabel, formatter: (value: unknown) => `${formatAxisValue(value)}%` } }]
          : isHorizontalBar ? { ...categoryAxis, name: "" } : valueAxis,
      visualMap: isHeatmap ? { min: heatMin, max: heatMax === heatMin ? heatMin + 1 : heatMax, calculable: true, orient: "horizontal", left: "center", bottom: 2, inRange: { color: isLight ? ["#dce8ff", "#ffffff", "#0f9f91"] : ["#273b62", "#111820", "#43d9c5"] }, textStyle: { color: isLight ? "#687888" : "#9aa6b8" } } : undefined,
      toolbox: presentation.showBrush && !isHeatmap ? { right: 10, top: 4, feature: { brush: { type: ["rect", "lineX", "clear"] } }, iconStyle: { borderColor: isLight ? "#607180" : "#9aa6b8" } } : undefined,
      brush: presentation.showBrush && !isHeatmap ? { toolbox: ["rect", "lineX", "clear"], xAxisIndex: "all", brushMode: "single", throttleType: "debounce", throttleDelay: 200 } : undefined,
      dataZoom: presentation.showZoom && dataset.categories.length > 20 ? isHorizontalBar
        ? [{ type: "inside", yAxisIndex: 0 }, { type: "slider", yAxisIndex: 0, width: 12, right: 7, borderColor: isLight ? "#d5dee5" : "#28303c", fillerColor: isLight ? "rgba(15,159,145,.16)" : "rgba(57,216,194,.14)", backgroundColor: isLight ? "#f1f5f7" : "#111720", showDetail: false }]
        : [{ type: "inside", xAxisIndex: 0 }, { type: "slider", height: 12, bottom: legendAtBottom ? 30 : 9, borderColor: isLight ? "#d5dee5" : "#28303c", fillerColor: isLight ? "rgba(15,159,145,.16)" : "rgba(57,216,194,.14)", backgroundColor: isLight ? "#f1f5f7" : "#111720", showDetail: false }]
        : undefined,
      series: dataset.series.map((series) => {
        const rules = (definition.thresholds ?? []).filter((item) => item.enabled && item.field === series.name);
        const resolvedRules = rules.map((rule) => resolveThresholdRule(rows, definition, columns, rule));
        const rangeRule = resolvedRules.find((item) => item.lower != null && item.upper != null);
        const violations = thresholdReport.events.filter((event) => event.field === series.name).flatMap((event) => event.violations).filter((item) => dataset.categories.includes(item.x)).slice(0, 250);
        const renderedType = series.renderType ?? chartType;
        const lowerBand = definition.type === "forecast" ? dataset.series.find((item) => item.name === "Dolna granica") : undefined;
        const renderedData = series.name === "Górna granica" && lowerBand
          ? series.data.map((value, index) => typeof value === "number" && typeof lowerBand.data[index] === "number" ? value - (lowerBand.data[index] as number) : null)
          : series.data;
        return ({
        name: series.name,
        type: renderedType,
        data: renderedData,
        yAxisIndex: series.yAxisIndex,
        showSymbol: isScatter || presentation.showSymbols,
        symbol: isScatter ? "circle" : "emptyCircle",
        symbolSize: isScatter ? 8 : 6,
        smooth: ["line", "area"].includes(definition.type) && presentation.lineCurve === "smooth" ? 0.22 : false,
        step: ["line", "area"].includes(definition.type) && presentation.lineCurve === "step" ? "middle" : false,
        areaStyle: isDenseBar
          ? { opacity: .12, origin: "start" }
          : definition.type === "area"
          ? { opacity: Math.min(presentation.areaOpacity, 24) / 100, origin: "start" }
          : series.name === "Górna granica" && lowerBand ? { opacity: .16, color: palette[1] ?? palette[0] }
            : series.name === "Dolna granica" && lowerBand ? { opacity: 0 } : undefined,
        lineStyle: { width: presentation.lineWidth },
        stack: series.name === "Górna granica" && lowerBand || series.name === "Dolna granica" && lowerBand ? "confidence-band" : series.stack ?? (presentation.stacked && definition.type === "bar" ? "total" : undefined),
        label: presentation.showDataLabels ? { show: true, position: isHeatmap ? "inside" : isHorizontalBar ? "right" : "top", color: isLight ? "#536471" : "#c0c9d5", fontSize: isHeatmap ? 8 : 9, formatter: (params: { value?: unknown }) => isHeatmap && Array.isArray(params.value) ? formatAxisValue(params.value[2]) : formatAxisValue(params.value) } : undefined,
        itemStyle: series.hidden ? { color: "transparent", borderColor: "transparent" } : renderedType === "bar" ? { borderRadius: isHorizontalBar ? [0, 4, 4, 0] : [4, 4, 0, 0], opacity: .92 } : { borderWidth: 2 },
        emphasis: { focus: "series", scale: true },
        large: isScatter && rows.length > 2000,
        largeThreshold: 2000,
        markLine: resolvedRules.length ? {
          silent: true,
          symbol: "none",
          label: { show: true, color: isLight ? "#536471" : "#c0c9d5", fontSize: 10, backgroundColor: isLight ? "#f3f6f8" : "#151c25", padding: [3, 5], borderRadius: 3, formatter: "{b}: {c}" },
          lineStyle: { color: "#8e9bad", width: 1.2, type: "dashed" },
          data: resolvedRules.flatMap((resolvedRule) => [
            ...(resolvedRule.lower != null ? [{ name: resolvedRule.mode === "percentile" ? resolvedRule.label : `${resolvedRule.label || (language === "en" ? "Range" : "Zakres")} · ${language === "en" ? "lower" : "dolna"}`, ...(isHorizontalBar ? { xAxis: resolvedRule.lower } : { yAxis: resolvedRule.lower }) }] : []),
            ...(resolvedRule.upper != null ? [{ name: resolvedRule.mode === "percentile" ? resolvedRule.label : `${resolvedRule.label || (language === "en" ? "Range" : "Zakres")} · ${language === "en" ? "upper" : "górna"}`, ...(isHorizontalBar ? { xAxis: resolvedRule.upper } : { yAxis: resolvedRule.upper }) }] : []),
          ]),
        } : undefined,
        markArea: rangeRule?.lower != null && rangeRule.upper != null ? {
          silent: true,
          label: { show: false },
          itemStyle: { color: "rgba(111, 147, 255, .075)" },
          data: [[isHorizontalBar ? { xAxis: rangeRule.lower } : { yAxis: rangeRule.lower }, isHorizontalBar ? { xAxis: rangeRule.upper } : { yAxis: rangeRule.upper }]],
        } : undefined,
        markPoint: violations.length ? {
          silent: true,
          label: { show: false },
          data: violations.map((violation) => ({
            coord: [violation.x, violation.value],
            value: violation.value,
            symbol: "triangle",
            symbolRotate: violation.status === "below" ? 180 : 0,
            symbolSize: 10,
            itemStyle: { color: violation.status === "below" ? "#9b7cff" : "#f5b85b", borderColor: isLight ? "#ffffff" : "#0d1117", borderWidth: 1 },
          })),
        } : undefined,
      });}),
    };
    chart.setOption(option, { notMerge: true });
  }, [dataset, definition, rows, columns, isLight, language, numberFormatter]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !syncedX || definition.type === "scatter") return;
    const index = dataset.categories.indexOf(syncedX);
    if (index >= 0) chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
  }, [syncedX, dataset.categories, definition.type]);

  return <div ref={hostRef} className="chart-renderer" style={{ height }} role="img" aria-label={`${language === "en" ? "Chart" : "Wykres"} ${definition.title}`} />;
});
