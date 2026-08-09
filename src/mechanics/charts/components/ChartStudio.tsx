"use client";

import { useMemo, useState } from "react";

import { buildChartDataset, createChartDraft, validateChartDefinition } from "../engine/chart-engine";
import { ChartBuilder } from "./ChartBuilder";
import { ChartRenderer } from "./ChartRenderer";
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

function formatDifference(value: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2, notation: Math.abs(value) >= 10000 ? "compact" : "standard" }).format(value);
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
  const [draft, setDraft] = useState<ChartDefinition>(() => createChartDraft(columns, datasetId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [syncedX, setSyncedX] = useState("");
  const [dashboardPage, setDashboardPage] = useState(0);
  const [pendingTemplate, setPendingTemplate] = useState<{ template: DashboardTemplate; charts: ChartDefinition[]; missing: string[] } | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const errors = useMemo(() => validateChartDefinition(draft, columns), [draft, columns]);
  const capacity = grid === "custom" ? Math.max(1, charts.length) : grid;
  const pageCount = grid === "custom" ? 1 : Math.max(1, Math.ceil(charts.length / capacity));
  const visiblePage = Math.min(dashboardPage, pageCount - 1);
  const displayedCharts = grid === "custom" ? charts : charts.slice(visiblePage * capacity, visiblePage * capacity + capacity);

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
      onToast("Zapisano zmiany wykresu");
    } else {
      const chart = { ...draft, id: `chart-${Date.now()}` };
      onChartsChange([...charts, chart]);
      onToast("Dodano wykres do pulpitu");
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
    onChartsChange([...charts, { ...chart, id: `chart-${Date.now()}`, title: `${chart.title} — kopia` }]);
    onToast("Utworzono kopię wykresu");
  };

  const removeChart = (id: string) => {
    onChartsChange(charts.filter((chart) => chart.id !== id));
    if (editingId === id) resetDraft();
    onToast("Usunięto wykres");
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
    onToast(`Zastosowano szablon „${template.name}”`);
  };

  const confirmTemplateMapping = () => {
    if (!pendingTemplate || pendingTemplate.missing.some((field) => !fieldMap[field])) return;
    onChartsChange(remapChartFields(pendingTemplate.charts, fieldMap, datasetId));
    onGridChange(pendingTemplate.template.grid);
    setDashboardPage(0);
    onToast(`Zastosowano szablon „${pendingTemplate.template.name}” z dopasowaniem kolumn`);
    setPendingTemplate(null);
  };

  return (
    <div className="chart-studio">
      <div className="chart-studio-heading">
        <div><span className="eyebrow">VISUAL LAB</span><h2>Pulpit wizualizacji</h2><p>{datasetName} · {totalRows.toLocaleString("pl-PL")} rekordów · wszystkie obliczenia lokalnie{sampled ? " · podgląd próbki" : ""}</p></div>
        <div><button className="secondary-button" onClick={startNewChart}>＋ Nowy wykres</button><button className="primary-button" onClick={onImport}>Wczytaj plik danych</button></div>
      </div>
      <TemplateManager grid={grid} charts={charts} templates={templates} defaultTemplateId={defaultTemplateId} onGridChange={(value) => { onGridChange(value); setDashboardPage(0); }} onTemplatesChange={onTemplatesChange} onDefaultTemplateChange={onDefaultTemplateChange} onApply={applyTemplate} onToast={onToast} />
      {pendingTemplate && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Dopasowanie kolumn szablonu"><div className="sheet-picker template-mapping-dialog"><span className="eyebrow">DOPASOWANIE SZABLONU</span><h3>Połącz kolumny z nowym plikiem</h3><p>Szablon „{pendingTemplate.template.name}” używa innych nazw. Wskaż ich odpowiedniki w bieżących danych.</p><div className="template-field-map">{pendingTemplate.missing.map((field) => <label key={field}><span>{field}</span><select value={fieldMap[field] ?? ""} onChange={(event) => setFieldMap((current) => ({ ...current, [field]: event.target.value }))}><option value="">Wybierz kolumnę…</option>{columns.map((column) => <option value={column.name} key={column.name}>{column.name} · {column.type === "number" ? "liczba" : column.type === "date" ? "data" : "tekst"}</option>)}</select></label>)}</div><div className="sheet-picker-actions"><button className="secondary-button" onClick={() => setPendingTemplate(null)}>Anuluj</button><button className="primary-button" disabled={pendingTemplate.missing.some((field) => !fieldMap[field])} onClick={confirmTemplateMapping}>Zastosuj szablon</button></div></div></div>}
      <section className="chart-workspace">
        <div className={`dashboard-viewport dashboard-grid-${grid} dashboard-count-${Math.min(displayedCharts.length, 9)}`}>
          <div className="dashboard-title"><div><span>PULPIT · WIDOK {grid === "custom" ? "WŁASNY" : grid}</span><strong>{charts.length} {charts.length === 1 ? "wykres" : "wykresów"}</strong></div><div className="dashboard-page-controls"><small>Najedź na punkt czasu, aby zsynchronizować wykresy.</small>{pageCount > 1 && <><button onClick={() => setDashboardPage((page) => Math.max(0, page - 1))} disabled={visiblePage === 0}>←</button><span>{visiblePage + 1}/{pageCount}</span><button onClick={() => setDashboardPage((page) => Math.min(pageCount - 1, page + 1))} disabled={visiblePage === pageCount - 1}>→</button></>}</div></div>
          {charts.length === 0 ? <button className="empty-dashboard" onClick={startNewChart}><span>＋</span><strong>Dodaj pierwszy wykres</strong><p>Wybierz dane, osie i sposób prezentacji.</p></button> : <div className={`chart-dashboard grid-${grid}`}>{displayedCharts.map((chart) => {
            const index = charts.findIndex((item) => item.id === chart.id);
            const chartErrors = validateChartDefinition(chart, columns);
            const data = chartErrors.length ? null : buildChartDataset(rows, chart, columns);
            const summary = data ? summarizeChartData(data) : null;
            return <article className={`chart-card chart-${chart.size} ${editingId === chart.id ? "editing" : ""}`} key={chart.id}>
              <header><div><span>{chart.type.toUpperCase()} · {chart.aggregation.toUpperCase()} · {data?.sourceRows ?? 0} PKT</span><strong>{chart.title}</strong></div><div className="chart-card-quick"><button onClick={() => editChart(chart)}>Edytuj</button><details className="chart-card-menu"><summary title="Więcej działań">•••</summary><div><button onClick={() => moveChart(index, -1)} disabled={index === 0}>← Przesuń wcześniej</button><button onClick={() => moveChart(index, 1)} disabled={index === charts.length - 1}>→ Przesuń później</button><button onClick={() => cycleSize(chart)}>↔ Zmień rozmiar</button><button onClick={() => duplicateChart(chart)}>⧉ Duplikuj</button><button className="danger" onClick={() => removeChart(chart.id)}>× Usuń wykres</button></div></details></div></header>
              {chartErrors.length ? <div className="invalid-chart"><strong>Ten wykres nie pasuje do aktualnego CSV</strong><span>{chartErrors[0]}</span><button onClick={() => editChart(chart)}>Popraw konfigurację</button></div> : <>
                {summary && <div className="chart-card-summary"><div><span>OSTATNIA · {summary.seriesName}</span><strong>{formatDifference(summary.latest)}</strong></div><div><span>ŚREDNIA</span><strong>{formatDifference(summary.average)}</strong></div><div><span>ZAKRES</span><strong>{formatDifference(summary.minimum)} – {formatDifference(summary.maximum)}</strong></div></div>}
                <ChartRenderer rows={rows} columns={columns} definition={chart} height={chart.size === "large" ? 330 : chart.size === "medium" ? 260 : 220} syncedX={syncedX} onSyncX={setSyncedX} />
                <footer><span>X: {chart.xField}</span><span>Y: {chart.yFields.join(", ") || "liczba rekordów"}</span>{chart.timeRange && (chart.timeRange.from || chart.timeRange.to) && <span>Czas: {chart.timeRange.from || "początek"} → {chart.timeRange.to || "koniec"}</span>}{data && data.rejectedRows > 0 && <em>Pominięto {data.rejectedRows}</em>}{data?.comparison && <strong className={data.comparison.difference >= 0 ? "good" : "bad"}>{data.comparison.difference >= 0 ? "+" : ""}{chart.comparison?.mode === "percent" && data.comparison.percent != null ? `${data.comparison.percent.toFixed(1)}%` : formatDifference(data.comparison.difference)} vs {data.comparison.referenceField}</strong>}</footer>
              </>}
            </article>;
          })}</div>}
        </div>
          <ThresholdReportPanel rows={rows} columns={columns} charts={charts} sampled={sampled} datasetId={datasetId} />
      </section>
      {builderOpen && <div className="chart-editor-backdrop" onMouseDown={() => setBuilderOpen(false)}><section className="chart-editor-drawer" role="dialog" aria-modal="true" aria-label={editingId ? "Edytuj wykres" : "Nowy wykres"} onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">KREATOR WYKRESU</span><strong>{editingId ? "Edytuj wizualizację" : "Dodaj wizualizację"}</strong></div><button onClick={() => setBuilderOpen(false)} aria-label="Zamknij kreator">×</button></header><div className="chart-editor-layout"><ChartBuilder draft={draft} columns={columns} errors={errors} editing={Boolean(editingId)} onChange={setDraft} onSubmit={saveDraft} onCancelEdit={() => { resetDraft(); setBuilderOpen(false); }} /><div className="drawer-preview"><div className="chart-section-title"><div><span>PODGLĄD NA ŻYWO</span><strong>{draft.title || "Nowy wykres"}</strong></div><small>{errors.length ? "Uzupełnij konfigurację" : `${rows.length} wierszy źródłowych`}</small></div>{errors.length ? <div className="preview-placeholder"><span>◇</span><strong>Wybierz zgodne pola X i Y</strong><small>Wykres pojawi się tutaj automatycznie.</small></div> : <ChartRenderer rows={rows} columns={columns} definition={draft} height={410} syncedX={syncedX} onSyncX={setSyncedX} />}</div></div></section></div>}
    </div>
  );
}
