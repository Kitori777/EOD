"use client";

import { useEffect, useMemo, useState } from "react";

import { useI18n } from "../../../app/i18n/translations";
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

function eventDuration(start: string, end: string, language: "pl" | "en") {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) return language === "en" ? "single sample" : "pojedyncza próbka";
  const minutes = Math.round((endTime - startTime) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ${language === "en" ? "hr" : "godz."} ${rest} min` : `${hours} ${language === "en" ? "hr" : "godz."}`;
}

export function ThresholdReportPanel({ rows, columns, charts, sampled = false, datasetId }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const severityLabels = { info: tr("Informacja", "Information"), warning: tr("Ostrzeżenie", "Warning"), critical: tr("Krytyczne", "Critical") } as const;
  const boundaryLabel = (status: ThresholdStatus) => status === "below" ? tr("dolna granica", "lower boundary") : tr("górna granica", "upper boundary");
  const [filter, setFilter] = useState<"all" | ThresholdStatus>("all");
  const [open, setOpen] = useState(false);
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
    const plottedChart = sampled ? { ...chart, thresholds: (chart.thresholds ?? []).filter((rule) => rule.evaluation === "plotted" || (rule.evaluation === "raw" && (rule.mode ?? "manual") === "percentile")) } : chart;
    const plotted = buildThresholdReport(rows, plottedChart, columns);
    const stored = storedReports[chart.id];
    return { chart, report: stored ? { events: [...plotted.events, ...stored.events], violationCount: plotted.violationCount + stored.violationCount, evaluatedPoints: plotted.evaluatedPoints + stored.evaluatedPoints } : plotted };
  }), [rows, columns, charts, sampled, storedReports]);
  const events = reports.flatMap(({ chart, report }) => report.events.map((event) => ({ chart, event })));
  const filteredEvents = events.filter((item) => filter === "all" || item.event.status === filter);

  const exportReport = () => {
    const header = language === "en" ? ["chart", "rule", "series", "alert_level", "status", "start", "end", "duration", "sample_count", "minimum", "maximum", "largest_deviation", "boundary", "description"] : ["wykres", "reguła", "seria", "poziom_alertu", "status", "początek", "koniec", "czas_trwania", "liczba_próbek", "minimum", "maksimum", "największe_przekroczenie", "granica", "opis"];
    const rowsToExport = events.map(({ chart, event }) => [chart.title, event.label ?? "Limit", event.field, severityLabels[event.severity ?? "warning"], event.status === "below" ? tr("poniżej", "below") : tr("powyżej", "above"), event.startX, event.endX, eventDuration(event.startX, event.endX, language), event.pointCount, event.minimum, event.maximum, event.largestDeviation, event.violations[0]?.boundary ?? "", event.description ?? ""]);
    const csv = [header, ...rowsToExport].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `eyes-of-odin-${language === "en" ? "threshold-report" : "raport-limitow"}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <section className="threshold-report-panel">
    <header><button className="report-toggle" onClick={() => setOpen((value) => !value)}><span>{open ? "⌄" : "›"}</span><div><small>{tr("RAPORT LIMITÓW", "THRESHOLD REPORT")}</small><strong>{events.length} {tr("zdarzeń", "events")} · {events.reduce((sum, item) => sum + item.event.pointCount, 0)} {tr("przekroczeń", "violations")}</strong></div></button><div className="report-actions"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{tr("Wszystkie", "All")}</button><button className={filter === "below" ? "active" : ""} onClick={() => setFilter("below")}>{tr("Poniżej", "Below")}</button><button className={filter === "above" ? "active" : ""} onClick={() => setFilter("above")}>{tr("Powyżej", "Above")}</button><button className="export-report" onClick={exportReport} disabled={!events.length}>{tr("Eksport CSV", "Export CSV")}</button></div></header>
    {open && <>{sampled && <div className="report-warning">{tr("Widok wykresu korzysta z próbki danych. Percentyl na próbce jest oznaczeniem orientacyjnym, a ręczne reguły „każdy rekord” są sprawdzane na pełnym zbiorze", "The chart uses a data sample. Sample percentiles are indicative, while manual ‘every record’ rules are checked against the full dataset")}{loadingExact ? tr(" — trwa przeliczanie…", " — calculating…") : ""}.</div>}{events.length === 0 ? <div className="empty-report"><span>✓</span><strong>{loadingExact ? tr("Sprawdzanie pełnego zbioru…", "Checking the full dataset…") : tr("Brak kontaktów z ustawionymi granicami", "No contacts with configured boundaries")}</strong><small>{tr("Raport zaktualizuje się po zmianie danych lub progów.", "The report updates when data or thresholds change.")}</small></div> : <div className="threshold-table event-table"><div className="threshold-table-head"><span>{tr("Dokładny czas", "Exact time")}</span><span>{tr("Reguła / seria", "Rule / series")}</span><span>{tr("Wartości i granica", "Values and boundary")}</span><span>{tr("Poziom", "Level")}</span><span>{tr("Odchylenie", "Deviation")}</span></div>{filteredEvents.slice(0, 200).map(({ chart, event }) => <div className="threshold-table-row" key={`${chart.id}-${event.id}`}><strong>{event.startX}<small>{event.endX !== event.startX ? ` → ${event.endX}` : ""}<br />{eventDuration(event.startX, event.endX, language)} · {event.pointCount} {event.pointCount === 1 ? tr("próbka", "sample") : tr("próbek", "samples")}</small></strong><span>{event.label ?? "Limit"}<small>{chart.title} · {event.field}</small></span><em>{event.minimum.toLocaleString(locale)} – {event.maximum.toLocaleString(locale)}<small>{boundaryLabel(event.status)}: {(event.violations[0]?.boundary ?? 0).toLocaleString(locale)}</small></em><span className={`severity-badge severity-${event.severity ?? "warning"}`}>{severityLabels[event.severity ?? "warning"]}</span><strong className={event.status === "below" ? "threshold-low" : "threshold-high"}>{event.largestDeviation > 0 ? "+" : ""}{event.largestDeviation.toLocaleString(locale)}<small>{event.largestDeviation === 0 ? tr(" dotknięcie granicy", " boundary contact") : event.status === "below" ? tr(" poniżej dolnej", " below lower") : tr(" powyżej górnej", " above upper")}</small></strong>{event.description && <p>{event.description}</p>}</div>)}{filteredEvents.length > 200 && <div className="report-more">{tr(`W interfejsie pokazano 200 z ${filteredEvents.length} zdarzeń. Eksport CSV zawiera wszystkie.`, `The interface shows 200 of ${filteredEvents.length} events. The CSV export contains all of them.`)}</div>}</div>}</>}
  </section>;
}
