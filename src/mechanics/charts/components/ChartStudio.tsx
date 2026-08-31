"use client";

import { useMemo, useRef, useState } from "react";

import { useI18n } from "../../../app/i18n/translations";
import { buildChartDataset, createChartDraft, validateChartDefinition } from "../engine/chart-engine";
import { ChartBuilder } from "./ChartBuilder";
import { ChartRenderer, type ChartRendererHandle } from "./ChartRenderer";
import { applyTemplateToDataset, remapChartFields, type DashboardGrid, type DashboardTemplate } from "../templates/dashboard-templates";
import { TemplateManager } from "./TemplateManager";
import { ThresholdReportPanel } from "./ThresholdReportPanel";
import type { ChartColumn, ChartDefinition, DataRow } from "../types/chart-types";

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  datasetId: string;
  datasetName: string;
  charts: ChartDefinition[];
  onChartsChange: (charts: ChartDefinition[]) => void;
  onImport: () => void;
  onToast: (message: string) => void;
  sampled?: boolean;
  totalRows?: number;
  grid: DashboardGrid;
  templates: DashboardTemplate[];
  defaultTemplateId?: string;
  onGridChange: (grid: DashboardGrid) => void;
  onTemplatesChange: (templates: DashboardTemplate[]) => void;
  onDefaultTemplateChange: (id?: string) => void;
};

function formatDifference(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, notation: Math.abs(value) >= 10000 ? "compact" : "standard" }).format(value);
}

function summarizeChartData(data: ReturnType<typeof buildChartDataset>) {
  const primarySeries = data.series[0];
  const values = (primarySeries?.data ?? []).map((value) => Array.isArray(value) ? value[1] : value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return {
    seriesName: primarySeries.name,
    latest: values.at(-1) ?? 0,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

export function ChartStudio({ rows, columns, datasetId, datasetName, charts, onChartsChange, onImport, onToast, sampled = false, totalRows = rows.length, grid, templates, defaultTemplateId, onGridChange, onTemplatesChange, onDefaultTemplateChange }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const [draft, setDraft] = useState<ChartDefinition>(() => createChartDraft(columns, datasetId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [syncedX, setSyncedX] = useState("");
  const [dashboardPage, setDashboardPage] = useState(0);
  const [pendingTemplate, setPendingTemplate] = useState<{ template: DashboardTemplate; charts: ChartDefinition[]; missing: string[] } | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const rendererRefs = useRef(new Map<string, ChartRendererHandle>());
  const errors = useMemo(() => validateChartDefinition(draft, columns), [draft, columns]);
  const capacity = grid === "custom" ? Math.max(1, charts.length) : grid;
  const pageCount = grid === "custom" ? 1 : Math.max(1, Math.ceil(charts.length / capacity));
  const visiblePage = Math.min(dashboardPage, pageCount - 1);
  const displayedCharts = grid === "custom" ? charts : charts.slice(visiblePage * capacity, visiblePage * capacity + capacity);
  const pageRanges = Array.from({ length: pageCount }, (_, page) => ({
    page,
    from: page * capacity + 1,
    to: Math.min((page + 1) * capacity, Math.max(charts.length, capacity)),
  }));

  const resetDraft = () => {
    setEditingId(null);
    setDraft(createChartDraft(columns, datasetId));
  };

  const startNewChart = () => {
    resetDraft();
    setBuilderOpen(true);
  };

  const saveDraft = () => {
    if (errors.length) return;
    if (editingId) {
      onChartsChange(charts.map((chart) => chart.id === editingId ? { ...draft, id: editingId } : chart));
      onToast(tr("Zapisano zmiany wykresu", "Chart changes saved"));
    } else {
      const chart = { ...draft, id: `chart-${Date.now()}` };
      onChartsChange([...charts, chart]);
      if (grid !== "custom") setDashboardPage(Math.floor(charts.length / capacity));
      onToast(tr("Dodano wykres do pulpitu", "Chart added to dashboard"));
    }
    resetDraft();
    setBuilderOpen(false);
  };

  const editChart = (chart: ChartDefinition) => {
    setEditingId(chart.id);
    setDraft({ ...chart, filters: chart.filters.map((filter) => ({ ...filter })) });
    setBuilderOpen(true);
  };

  const duplicateChart = (chart: ChartDefinition) => {
    onChartsChange([...charts, { ...chart, id: `chart-${Date.now()}`, title: `${chart.title} — ${tr("kopia", "copy")}` }]);
    onToast(tr("Utworzono kopię wykresu", "Chart copy created"));
  };

  const removeChart = (id: string) => {
    onChartsChange(charts.filter((chart) => chart.id !== id));
    if (editingId === id) resetDraft();
    onToast(tr("Usunięto wykres", "Chart deleted"));
  };

  const moveChart = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= charts.length) return;
    const next = [...charts];
    [next[index], next[target]] = [next[target], next[index]];
    onChartsChange(next);
  };

  const cycleSize = (chart: ChartDefinition) => {
    const sizes: ChartDefinition["size"][] = ["small", "medium", "large"];
    const nextSize = sizes[(sizes.indexOf(chart.size) + 1) % sizes.length];
    onChartsChange(charts.map((item) => item.id === chart.id ? { ...item, size: nextSize } : item));
  };

  const exportChart = (chart: ChartDefinition, format: "png" | "jpg") => {
    const exported = rendererRefs.current.get(chart.id)?.exportImage(format) ?? false;
    onToast(exported ? `${tr("Zapisano wykres jako", "Chart saved as")} ${format.toUpperCase()}` : tr("Wykres nie jest jeszcze gotowy do zapisania", "The chart is not ready to save yet"));
  };

  const applyTemplate = (template: DashboardTemplate) => {
    const result = applyTemplateToDataset(template, columns, datasetId);
    if (result.missing.length) {
      setFieldMap(Object.fromEntries(result.missing.map((field) => [field, ""])));
      setPendingTemplate({ template, charts: result.charts, missing: result.missing });
      return;
    }
    onChartsChange(result.charts);
    onGridChange(template.grid);
    setDashboardPage(0);
    onToast(`${tr("Zastosowano szablon", "Applied template")} „${template.name}”`);
  };

  const confirmTemplateMapping = () => {
    if (!pendingTemplate || pendingTemplate.missing.some((field) => !fieldMap[field])) return;
    onChartsChange(remapChartFields(pendingTemplate.charts, fieldMap, datasetId));
    onGridChange(pendingTemplate.template.grid);
    setDashboardPage(0);
    onToast(`${tr("Zastosowano szablon", "Applied template")} „${pendingTemplate.template.name}” ${tr("z dopasowaniem kolumn", "with field mapping")}`);
    setPendingTemplate(null);
  };

  return (
    <div className="chart-studio">
      <div className="chart-studio-heading">
        <div><span className="eyebrow">VISUAL LAB</span><h2>{tr("Pulpit wizualizacji", "Visualization dashboard")}</h2><p>{datasetName} · {totalRows.toLocaleString(locale)} {tr("rekordów", "records")} · {tr("wszystkie obliczenia lokalnie", "all calculations are local")}{sampled ? ` · ${tr("podgląd próbki", "sample preview")}` : ""}</p></div>
        <div><button className="secondary-button" onClick={startNewChart}>＋ {tr("Nowy wykres", "New chart")}</button><button className="primary-button" onClick={onImport}>{tr("Wczytaj plik danych", "Load data file")}</button></div>
      </div>
      <TemplateManager grid={grid} charts={charts} templates={templates} defaultTemplateId={defaultTemplateId} onGridChange={(value) => { onGridChange(value); setDashboardPage(0); }} onTemplatesChange={onTemplatesChange} onDefaultTemplateChange={onDefaultTemplateChange} onApply={applyTemplate} onToast={onToast} />
      {pendingTemplate && <div className="import-overlay" role="dialog" aria-modal="true" aria-label={tr("Dopasowanie kolumn szablonu", "Template field mapping")}><div className="sheet-picker template-mapping-dialog"><span className="eyebrow">{tr("DOPASOWANIE SZABLONU", "TEMPLATE MAPPING")}</span><h3>{tr("Połącz kolumny z nowym plikiem", "Match fields to the new file")}</h3><p>{tr("Szablon", "Template")} „{pendingTemplate.template.name}” {tr("używa innych nazw. Wskaż ich odpowiedniki w bieżących danych.", "uses different names. Select their equivalents in the current data.")}</p><div className="template-field-map">{pendingTemplate.missing.map((field) => <label key={field}><span>{field}</span><select value={fieldMap[field] ?? ""} onChange={(event) => setFieldMap((current) => ({ ...current, [field]: event.target.value }))}><option value="">{tr("Wybierz kolumnę…", "Choose a field…")}</option>{columns.map((column) => <option value={column.name} key={column.name}>{column.name} · {column.type === "number" ? tr("liczba", "number") : column.type === "date" ? tr("data", "date") : tr("tekst", "text")}</option>)}</select></label>)}</div><div className="sheet-picker-actions"><button className="secondary-button" onClick={() => setPendingTemplate(null)}>{tr("Anuluj", "Cancel")}</button><button className="primary-button" disabled={pendingTemplate.missing.some((field) => !fieldMap[field])} onClick={confirmTemplateMapping}>{tr("Zastosuj szablon", "Apply template")}</button></div></div></div>}
      <section className="chart-workspace">
        <div className={`dashboard-viewport dashboard-grid-${grid} dashboard-count-${Math.min(displayedCharts.length, 9)}`}>
          <div className="dashboard-title"><div><span>{tr("PULPIT · WIDOK", "DASHBOARD · VIEW")} {grid === "custom" ? tr("WŁASNY", "CUSTOM") : grid}</span><strong>{charts.length} {charts.length === 1 ? tr("wykres", "chart") : tr("wykresów", "charts")}</strong></div><div className="dashboard-page-controls"><small>{tr("ZESTAWY WYKRESÓW", "CHART SETS")}</small>{grid === "custom" ? <span>{tr("Własny układ", "Custom layout")}</span> : pageRanges.map((range) => <button key={range.page} className={visiblePage === range.page ? "active" : ""} onClick={() => setDashboardPage(range.page)} aria-label={`${tr("Pokaż wykresy", "Show charts")} ${range.from}–${range.to}`}>{range.from}–{range.to}</button>)}</div></div>
          {charts.length === 0 ? <button className="empty-dashboard" onClick={startNewChart}><span>＋</span><strong>{tr("Dodaj pierwszy wykres", "Add the first chart")}</strong><p>{tr("Wybierz dane, osie i sposób prezentacji.", "Choose data, axes and presentation style.")}</p></button> : <div className={`chart-dashboard grid-${grid}`}>{displayedCharts.map((chart) => {
            const index = charts.findIndex((item) => item.id === chart.id);
            const chartErrors = validateChartDefinition(chart, columns);
            const data = chartErrors.length ? null : buildChartDataset(rows, chart, columns);
            const summary = data ? summarizeChartData(data) : null;
            return <article className={`chart-card chart-${chart.size} ${editingId === chart.id ? "editing" : ""}`} key={chart.id}>
              <header><div><span>{chart.type === "bar" && (data?.categories.length ?? 0) > 120 ? tr("GĘSTY TREND", "DENSE TREND") : chart.type.toUpperCase()} · {chart.formula ? tr("FORMUŁA", "FORMULA") : chart.aggregation.toUpperCase()} · {data?.sourceRows ?? 0} {tr("PKT", "PTS")}</span><strong>{chart.title}</strong></div><div className="chart-card-quick"><button onClick={() => editChart(chart)}>{tr("Edytuj", "Edit")}</button><details className="chart-card-menu"><summary title={tr("Więcej działań", "More actions")}>•••</summary><div><button onClick={() => editChart(chart)}>✎ {tr("Edytuj wykres", "Edit chart")}</button><button onClick={() => moveChart(index, -1)} disabled={index === 0}>← {tr("Przesuń wcześniej", "Move earlier")}</button><button onClick={() => moveChart(index, 1)} disabled={index === charts.length - 1}>→ {tr("Przesuń później", "Move later")}</button><button onClick={() => cycleSize(chart)}>↔ {tr("Zmień rozmiar", "Change size")}</button><button onClick={() => duplicateChart(chart)}>⧉ {tr("Duplikuj", "Duplicate")}</button><button onClick={() => exportChart(chart, "png")}>⇩ {tr("Zapisz jako PNG", "Save as PNG")}</button><button onClick={() => exportChart(chart, "jpg")}>⇩ {tr("Zapisz jako JPG", "Save as JPG")}</button><button className="danger" onClick={() => removeChart(chart.id)}>× {tr("Usuń wykres", "Delete chart")}</button></div></details></div></header>
              {chartErrors.length ? <div className="invalid-chart"><strong>{tr("Ten wykres nie pasuje do aktualnego CSV", "This chart does not match the current file")}</strong><span>{chartErrors[0]}</span><button onClick={() => editChart(chart)}>{tr("Popraw konfigurację", "Fix configuration")}</button></div> : <>
                {summary && <div className="chart-card-summary"><div><span>{tr("OSTATNIA", "LATEST")} · {summary.seriesName}</span><strong>{formatDifference(summary.latest, locale)}</strong></div><div><span>{tr("ŚREDNIA", "AVERAGE")}</span><strong>{formatDifference(summary.average, locale)}</strong></div><div><span>{tr("ZAKRES", "RANGE")}</span><strong>{formatDifference(summary.minimum, locale)} – {formatDifference(summary.maximum, locale)}</strong></div></div>}
                <ChartRenderer ref={(renderer) => { if (renderer) rendererRefs.current.set(chart.id, renderer); else rendererRefs.current.delete(chart.id); }} rows={rows} columns={columns} definition={chart} height={chart.size === "large" ? 330 : chart.size === "medium" ? 260 : 220} syncedX={syncedX} onSyncX={setSyncedX} />
                <footer><span>X: {chart.xField}</span><span>Y: {chart.formula?.label || chart.yFields.join(", ") || tr("liczba rekordów", "record count")}</span>{chart.timeRange && (chart.timeRange.from || chart.timeRange.to) && <span>{tr("Czas", "Time")}: {chart.timeRange.from || tr("początek", "start")} → {chart.timeRange.to || tr("koniec", "end")}</span>}{data && data.rejectedRows > 0 && <em>{tr("Pominięto", "Skipped")} {data.rejectedRows}</em>}{data?.comparison && <strong className={data.comparison.difference >= 0 ? "good" : "bad"}>{data.comparison.difference >= 0 ? "+" : ""}{chart.comparison?.mode === "percent" && data.comparison.percent != null ? `${data.comparison.percent.toFixed(1)}%` : formatDifference(data.comparison.difference, locale)} vs {data.comparison.referenceField}</strong>}</footer>
              </>}
            </article>;
          })}</div>}
        </div>
          <ThresholdReportPanel rows={rows} columns={columns} charts={charts} sampled={sampled} datasetId={datasetId} />
      </section>
      {builderOpen && <div className="chart-editor-backdrop" onMouseDown={() => setBuilderOpen(false)}><section className="chart-editor-drawer" role="dialog" aria-modal="true" aria-label={editingId ? tr("Edytuj wykres", "Edit chart") : tr("Nowy wykres", "New chart")} onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{tr("KREATOR WYKRESU", "CHART BUILDER")}</span><strong>{editingId ? tr("Edytuj wizualizację", "Edit visualization") : tr("Dodaj wizualizację", "Add visualization")}</strong></div><button onClick={() => setBuilderOpen(false)} aria-label={tr("Zamknij kreator", "Close builder")}>×</button></header><div className="chart-editor-layout"><ChartBuilder draft={draft} columns={columns} errors={errors} editing={Boolean(editingId)} onChange={setDraft} onSubmit={saveDraft} onCancelEdit={() => { resetDraft(); setBuilderOpen(false); }} /><div className="drawer-preview"><div className="chart-section-title"><div><span>{tr("PODGLĄD NA ŻYWO", "LIVE PREVIEW")}</span><strong>{draft.title || tr("Nowy wykres", "New chart")}</strong></div><small>{errors.length ? tr("Uzupełnij konfigurację", "Complete the configuration") : `${rows.length} ${tr("wierszy źródłowych", "source rows")}`}</small></div>{errors.length ? <div className="preview-placeholder"><span>◇</span><strong>{tr("Wybierz zgodne pola X i Y", "Choose compatible X and Y fields")}</strong><small>{tr("Wykres pojawi się tutaj automatycznie.", "The chart will appear here automatically.")}</small></div> : <ChartRenderer rows={rows} columns={columns} definition={draft} height={410} syncedX={syncedX} onSyncX={setSyncedX} />}</div></div></section></div>}
    </div>
  );
}
