"use client";

import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import { init, use as registerECharts, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";

import { buildChartDataset, buildThresholdReport } from "../engine/chart-engine";
import type { ChartColumn, ChartDefinition, DataRow } from "../types/chart-types";

registerECharts([BarChart, LineChart, ScatterChart, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, CanvasRenderer]);

const colors = ["#43d9c5", "#6f93ff", "#f0b45a", "#a48aff", "#80a7c7"];
const numberFormatter = new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 });

function formatAxisValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numberFormatter.format(numeric) : String(value ?? "");
}

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  definition: ChartDefinition;
  height?: number;
  syncedX?: string;
  onSyncX?: (value: string) => void;
};

export function ChartRenderer({ rows, columns, definition, height = 270, syncedX, onSyncX }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const dataset = useMemo(() => buildChartDataset(rows, definition, columns), [rows, definition, columns]);
  const thresholdReport = useMemo(() => buildThresholdReport(rows, definition, columns), [rows, definition, columns]);

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
    const chartType = isScatter ? "scatter" : definition.type === "bar" || definition.type === "histogram" ? "bar" : "line";
    const option: EChartsCoreOption = {
      animationDuration: 320,
      animationEasing: "cubicOut",
      color: colors,
      grid: { left: 66, right: dataset.series.length === 1 && !isScatter ? 52 : 24, top: dataset.series.length > 1 ? 48 : 28, bottom: dataset.categories.length > 20 ? 58 : 46, containLabel: false },
      legend: dataset.series.length > 1 ? { top: 5, left: 60, textStyle: { color: "#9aa6b8", fontSize: 11 }, itemWidth: 18, itemHeight: 4, itemGap: 18 } : undefined,
      tooltip: {
        trigger: isScatter ? "item" : "axis",
        axisPointer: { type: isScatter ? "cross" : "line", lineStyle: { color: "#7d8ca3", type: "dashed", width: 1 } },
        backgroundColor: "rgba(10, 15, 22, .98)",
        borderColor: "#3a4657",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: "#e6ebf2", fontSize: 12, lineHeight: 20 },
        valueFormatter: formatAxisValue,
        extraCssText: "box-shadow:0 14px 36px rgba(0,0,0,.38);border-radius:7px",
      },
      xAxis: {
        type: isScatter ? "value" : "category",
        data: isScatter ? undefined : dataset.categories,
        name: definition.xField,
        nameLocation: "middle",
        nameGap: 32,
        nameTextStyle: { color: "#758298", fontSize: 10, fontWeight: 500 },
        axisLine: { lineStyle: { color: "#354152" } },
        axisTick: { show: false },
        axisLabel: { color: "#8793a6", fontSize: 10, hideOverlap: true, margin: 11, formatter: isScatter ? formatAxisValue : undefined },
        splitLine: { show: isScatter, lineStyle: { color: "#202a36", type: "dashed" } },
      },
      yAxis: {
        type: "value",
        name: definition.type === "histogram" ? "Liczba" : definition.yFields.join(" · "),
        nameTextStyle: { color: "#758298", fontSize: 10, fontWeight: 500, padding: [0, 0, 4, 0] },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#8793a6", fontSize: 10, margin: 12, formatter: formatAxisValue },
        splitLine: { lineStyle: { color: "#202a36", type: "dashed" } },
        scale: isScatter,
      },
      dataZoom: dataset.categories.length > 20 ? [{ type: "inside", xAxisIndex: 0 }, { type: "slider", height: 12, bottom: 9, borderColor: "#28303c", fillerColor: "rgba(57,216,194,.14)", backgroundColor: "#111720", showDetail: false }] : undefined,
      series: dataset.series.map((series) => {
        const rule = (definition.thresholds ?? []).find((item) => item.enabled && item.field === series.name);
        const violations = thresholdReport.events.filter((event) => event.field === series.name).flatMap((event) => event.violations).filter((item) => dataset.categories.includes(item.x)).slice(0, 250);
        return ({
        name: series.name,
        type: chartType,
        data: series.data,
        showSymbol: isScatter || dataset.categories.length <= 20,
        symbol: isScatter ? "circle" : "emptyCircle",
        symbolSize: isScatter ? 8 : 6,
        smooth: ["line", "area"].includes(definition.type) ? 0.18 : false,
        areaStyle: definition.type === "area" ? { opacity: 0.1 } : undefined,
        lineStyle: { width: 2.5 },
        itemStyle: definition.type === "bar" || definition.type === "histogram" ? { borderRadius: [4, 4, 0, 0], opacity: .92 } : { borderWidth: 2 },
        emphasis: { focus: "series", scale: true },
        endLabel: !isScatter && chartType === "line" && dataset.series.length === 1 ? { show: true, color: colors[0], fontSize: 10, fontWeight: 700, formatter: (params: { value?: unknown }) => formatAxisValue(params.value) } : undefined,
        large: isScatter && rows.length > 2000,
        largeThreshold: 2000,
        markLine: rule ? {
          silent: true,
          symbol: "none",
          label: { show: true, color: "#c0c9d5", fontSize: 10, backgroundColor: "#151c25", padding: [3, 5], borderRadius: 3, formatter: "{b}: {c}" },
          lineStyle: { color: "#8e9bad", width: 1.2, type: "dashed" },
          data: [
            ...(rule.lower != null ? [{ name: "minimum", yAxis: rule.lower }] : []),
            ...(rule.upper != null ? [{ name: "maksimum", yAxis: rule.upper }] : []),
          ],
        } : undefined,
        markArea: rule?.lower != null && rule.upper != null ? {
          silent: true,
          label: { show: false },
          itemStyle: { color: "rgba(111, 147, 255, .075)" },
          data: [[{ yAxis: rule.lower }, { yAxis: rule.upper }]],
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
            itemStyle: { color: violation.status === "below" ? "#9b7cff" : "#f5b85b", borderColor: "#0d1117", borderWidth: 1 },
          })),
        } : undefined,
      });}),
    };
    chart.setOption(option, { notMerge: true });
  }, [dataset, definition, rows.length]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !syncedX || definition.type === "scatter") return;
    const index = dataset.categories.indexOf(syncedX);
    if (index >= 0) chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
  }, [syncedX, dataset.categories, definition.type]);

  return <div ref={hostRef} className="chart-renderer" style={{ height }} role="img" aria-label={`Wykres ${definition.title}`} />;
}
