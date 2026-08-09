"use client";

import { useEffect, useMemo, useState } from "react";

import { buildThresholdReport } from "../engine/chart-engine";
import { buildStoredRawThresholdReport } from "../reports/stored-threshold-report";
import type { ChartColumn, ChartDefinition, DataRow, ThresholdStatus } from "../types/chart-types";

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  charts: ChartDefinition[];
  sampled?: boolean;
  datasetId?: string;
};

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function ThresholdReportPanel({ rows, columns, charts, sampled = false, datasetId }: Props) {
  const [filter, setFilter] = useState<"all" | ThresholdStatus>("all");
  const [open, setOpen] = useState(true);
  const [storedReports, setStoredReports] = useState<Record<string, ReturnType<typeof buildThresholdReport>>>({});
  const [loadingExact, setLoadingExact] = useState(false);
  useEffect(() => {
    if (!sampled || !datasetId || !charts.some((chart) => (chart.thresholds ?? []).some((rule) => rule.enabled && rule.evaluation === "raw"))) {
      Promise.resolve().then(() => {
        setStoredReports({});
        setLoadingExact(false);
      });
      return;
    }
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingExact(true);
      return Promise.all(charts.map(async (chart) => [chart.id, await buildStoredRawThresholdReport(datasetId, chart)] as const));
    }).then((results) => {
      if (active) setStoredReports(Object.fromEntries(results));
    }).finally(() => {
      if (active) setLoadingExact(false);
    });
    return () => { active = false; };
  }, [sampled, datasetId, charts]);
  const reports = useMemo(() => charts.map((chart) => {
    const plottedChart = sampled ? { ...chart, thresholds: (chart.thresholds ?? []).filter((rule) => rule.evaluation === "plotted") } : chart;
    const plotted = buildThresholdReport(rows, plottedChart, columns);
    const stored = storedReports[chart.id];
    return { chart, report: stored ? { events: [...plotted.events, ...stored.events], violationCount: plotted.violationCount + stored.violationCount, evaluatedPoints: plotted.evaluatedPoints + stored.evaluatedPoints } : plotted };
  }), [rows, columns, charts, sampled, storedReports]);
  const events = reports.flatMap(({ chart, report }) => report.events.map((event) => ({ chart, event })));
  const violations = events.flatMap(({ chart, event }) => event.violations.map((violation) => ({ chart, event, violation }))).filter((item) => filter === "all" || item.violation.status === filter);

  const exportReport = () => {
    const header = ["wykres", "seria", "status", "czas", "wartość", "granica", "odchylenie", "początek_zdarzenia", "koniec_zdarzenia"];
    const rowsToExport = events.flatMap(({ chart, event }) => event.violations.map((violation) => [chart.title, event.field, violation.status === "below" ? "poniżej" : "powyżej", violation.x, violation.value, violation.boundary, violation.deviation, event.startX, event.endX]));
    const csv = [header, ...rowsToExport].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `eyes-of-odin-raport-limitow-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="threshold-report-panel">
    <header><button className="report-toggle" onClick={() => setOpen((value) => !value)}><span>{open ? "⌄" : "›"}</span><div><small>RAPORT LIMITÓW</small><strong>{events.length} zdarzeń · {events.reduce((sum, item) => sum + item.event.pointCount, 0)} przekroczeń</strong></div></button><div className="report-actions"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Wszystkie</button><button className={filter === "below" ? "active" : ""} onClick={() => setFilter("below")}>Poniżej</button><button className={filter === "above" ? "active" : ""} onClick={() => setFilter("above")}>Powyżej</button><button className="export-report" onClick={exportReport} disabled={!events.length}>Eksport CSV</button></div></header>
    {open && <>{sampled && <div className="report-warning">Widok wykresu korzysta z próbki danych. Reguły „każdy rekord” są sprawdzane na pełnym zbiorze{loadingExact ? " — trwa przeliczanie…" : ""}.</div>}{events.length === 0 ? <div className="empty-report"><span>✓</span><strong>{loadingExact ? "Sprawdzanie pełnego zbioru…" : "Brak przekroczeń ustawionych limitów"}</strong><small>Raport zaktualizuje się po zmianie danych lub progów.</small></div> : <div className="threshold-table"><div className="threshold-table-head"><span>Czas</span><span>Wykres / seria</span><span>Wartość</span><span>Granica</span><span>Odchylenie</span></div>{violations.slice(0, 200).map(({ chart, event, violation }, index) => <div className="threshold-table-row" key={`${chart.id}-${event.id}-${index}`}><strong>{violation.x}</strong><span>{chart.title}<small>{event.field} · {violation.status === "below" ? "poniżej" : "powyżej"}</small></span><em>{violation.value.toLocaleString("pl-PL")}</em><span>{violation.boundary.toLocaleString("pl-PL")}</span><strong className={violation.status === "below" ? "threshold-low" : "threshold-high"}>{violation.deviation > 0 ? "+" : ""}{violation.deviation.toLocaleString("pl-PL")}</strong></div>)}{violations.length > 200 && <div className="report-more">W interfejsie pokazano 200 z {violations.length} rekordów. Eksport CSV zawiera wszystkie.</div>}</div>}</>}
  </section>;
}
