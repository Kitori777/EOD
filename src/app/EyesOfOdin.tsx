"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { HomeView } from "./views/HomeView";
import { APP_VERSION } from "./version";
import { useI18n } from "./i18n/translations";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useAppPreferences } from "./settings/preferences";
import { calculateCanvasPan, clampWorkspacePanelSize, DEFAULT_WORKSPACE_SIZES, type Point, type WorkspacePanel } from "./layout/workspace-layout";
import { LEGACY_WORKSPACE_KEY, loadWorkspace, saveWorkspace, WORKSPACE_MARKER_KEY, type WorkspaceSnapshot } from "./storage/workspace-storage";
import { ChartStudio } from "../mechanics/charts/components/ChartStudio";
import { applyTemplateToDataset, type DashboardGrid, type DashboardTemplate } from "../mechanics/charts/templates/dashboard-templates";
import type { ChartDefinition, DataRow } from "../mechanics/charts/types/chart-types";
import type { DatasetMeta, ImportProgress } from "../mechanics/data/types/data-types";
import { importDataFile, supportedDataFile } from "../mechanics/data/importers/file-import";
import { DATA_FILE_ACCEPT, SUPPORTED_DATA_FORMAT_LABELS, workbookDataFile } from "../mechanics/data/importers/format-registry";
import { inspectWorkbookSheets } from "../mechanics/data/importers/workbook-import";
import { calculateScenario } from "../mechanics/modeling/engine/scenario-engine";
import { findVacantNodePosition, getGraphBounds, hasNodeCollisions, layoutModelGraph, snapModelCoordinate } from "../mechanics/modeling/layout/model-layout";
import type { BottomTab, ModelEdge, ModelNode, NodeKind, Scenario, ViewId } from "../mechanics/modeling/types/model-types";

type ColumnProfile = {
  name: string;
  type: "number" | "date" | "text";
  filled: number;
  unique: number;
  sample: string;
};

type BottomPanelMode = "collapsed" | "normal" | "maximized";

function suggestedCharts(columns: ColumnProfile[], datasetId: string): ChartDefinition[] {
  const numeric = columns.filter((column) => column.type === "number");
  if (!numeric.length) return [];
  const category = columns.find((column) => column.type === "date")
    ?? columns.find((column) => column.type === "text")
    ?? columns[0];
  const firstFields = numeric.slice(0, 2).map((column) => column.name);
  const charts: ChartDefinition[] = [{
    id: `chart-${Date.now()}-overview`,
    title: `${firstFields.join(" i ")} według ${category.name}`,
    datasetId,
    type: category.type === "number" ? "scatter" : "line",
    xField: category.name,
    yFields: firstFields,
    aggregation: "sum",
    filters: [],
    thresholds: [],
    size: "large",
  }];
  if (numeric.length >= 3) {
    charts.push({
      id: `chart-${Date.now()}-secondary`,
      title: `${numeric[2].name} według ${category.name}`,
      datasetId,
      type: "bar",
      xField: category.name,
      yFields: [numeric[2].name],
      aggregation: "average",
      filters: [],
      thresholds: [],
      size: "small",
    });
  }
  return charts;
}

function downloadTextFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const sampleCsv = `month,revenue,cost,customers,conversion
2026-01,428000,292000,1210,3.8
2026-02,441000,298000,1248,3.9
2026-03,457000,305000,1294,4.1
2026-04,466000,311000,1318,4.0
2026-05,482000,319000,1352,4.2
2026-06,498000,327000,1398,4.3
2026-07,512000,337000,1434,4.4
2026-08,526000,345000,1471,4.5`;

const initialNodes: ModelNode[] = [
  { id: "source", kind: "source", title: "Dane sprzedażowe", subtitle: "8 wierszy · 5 kolumn", x: 42, y: 224 },
  { id: "clean", kind: "transform", title: "Oczyść i pogrupuj", subtitle: "Miesiąc · suma", x: 252, y: 224 },
  { id: "pricing", kind: "decision", title: "1 · Strategia ceny", subtitle: "Zmiana ceny produktu", x: 462, y: 98 },
  { id: "campaign", kind: "decision", title: "4 · Typ kampanii", subtitle: "Kanał pozyskania", x: 462, y: 286 },
  { id: "market", kind: "decision", title: "9 · Nowy rynek", subtitle: "Skala ekspansji", x: 672, y: 192 },
  { id: "profit", kind: "metric", title: "Prognozowany zysk", subtitle: "Przychód − koszt", x: 672, y: 370 },
  { id: "result", kind: "result", title: "Wynik scenariusza", subtitle: "4 metryki · na żywo", x: 870, y: 282 },
];

const initialEdges: ModelEdge[] = [
  { id: "e1", from: "source", to: "clean" },
  { id: "e2", from: "clean", to: "pricing" },
  { id: "e3", from: "clean", to: "campaign" },
  { id: "e4", from: "pricing", to: "market", label: "wybór 1" },
  { id: "e5", from: "campaign", to: "market", label: "wybór 4" },
  { id: "e6", from: "market", to: "result", label: "wybór 9" },
  { id: "e7", from: "campaign", to: "profit" },
  { id: "e8", from: "profit", to: "result" },
];

const initialScenarios: Scenario[] = [
  {
    id: "baseline",
    name: "Bazowy",
    priceChange: 0,
    marketingChange: 0,
    conversionChange: 0,
    choices: { pricing: "1", campaign: "4", market: "9" },
  },
  {
    id: "growth",
    name: "Wzrost 2027",
    priceChange: 8,
    marketingChange: 25,
    conversionChange: 12,
    choices: { pricing: "2", campaign: "4", market: "9" },
  },
];

const initialCharts: ChartDefinition[] = [
  {
    id: "chart-revenue-cost",
    title: "Przychód i koszt w czasie",
    datasetId: "sample-sales-2026",
    type: "line",
    xField: "month",
    yFields: ["revenue", "cost"],
    aggregation: "sum",
    comparison: { referenceField: "cost", mode: "percent" },
    filters: [],
    thresholds: [],
    size: "large",
  },
  {
    id: "chart-customers-conversion",
    title: "Klienci a konwersja",
    datasetId: "sample-sales-2026",
    type: "scatter",
    xField: "customers",
    yFields: ["conversion"],
    aggregation: "average",
    filters: [],
    thresholds: [],
    size: "small",
  },
];

function isMeaningfulLegacyWorkspace(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    const comparable = {
      nodes: saved.nodes ?? [],
      edges: saved.edges ?? [],
      scenarios: saved.scenarios ?? [],
      scenarioId: saved.scenarioId,
      charts: saved.charts ?? [],
      dashboardGrid: saved.dashboardGrid,
      templates: saved.templates ?? [],
      defaultTemplateId: saved.defaultTemplateId,
    };
    const demonstration = {
      nodes: initialNodes,
      edges: initialEdges,
      scenarios: initialScenarios,
      scenarioId: "growth",
      charts: initialCharts,
      dashboardGrid: 4,
      templates: [],
      defaultTemplateId: undefined,
    };
    return JSON.stringify(comparable) !== JSON.stringify(demonstration);
  } catch {
    return false;
  }
}

const navItems: Array<{ id: ViewId; icon: string; label: string; shortcut: string }> = [
  { id: "model", icon: "◇", label: "Model", shortcut: "1" },
  { id: "data", icon: "▦", label: "Dane", shortcut: "2" },
  { id: "charts", icon: "▥", label: "Wykresy", shortcut: "3" },
  { id: "paths", icon: "⑂", label: "Ścieżki", shortcut: "4" },
  { id: "compare", icon: "◫", label: "Porównaj", shortcut: "5" },
];

const kindMeta: Record<NodeKind, { label: string; icon: string }> = {
  source: { label: "Źródło", icon: "▦" },
  transform: { label: "Transformacja", icon: "⌁" },
  decision: { label: "Decyzja", icon: "◇" },
  metric: { label: "Metryka", icon: "∑" },
  result: { label: "Wynik", icon: "◎" },
};

function parseCsv(text: string): { rows: DataRow[]; headers: string[] } {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new Error("Plik jest pusty.");
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const candidates = [",", ";", "\t"];
  const separator = candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) matrix.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) matrix.push(row);

  if (matrix.length < 2 || matrix[0].length < 2) {
    throw new Error("CSV powinien zawierać nagłówki i co najmniej jeden wiersz danych.");
  }
  const headers = matrix[0].map((header, index) => header || `kolumna_${index + 1}`);
  const rows = matrix.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
  return { rows, headers };
}

function profileColumns(rows: DataRow[], headers: string[]): ColumnProfile[] {
  return headers.map((name) => {
    const values = rows.map((row) => row[name]).filter((value) => value !== "" && value != null);
    const numberCount = values.filter((value) => Number.isFinite(Number(value.replace(",", ".")))).length;
    const dateCount = values.filter((value) => !Number.isNaN(Date.parse(value)) && /[-/.]/.test(value)).length;
    const type = values.length > 0 && numberCount / values.length > 0.8
      ? "number"
      : values.length > 0 && dateCount / values.length > 0.8
        ? "date"
        : "text";
    return {
      name,
      type,
      filled: values.length,
      unique: new Set(values).size,
      sample: values[0] ?? "—",
    };
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EyesOfOdin() {
  const { preferences } = useAppPreferences();
  const { t, locale } = useI18n();
  const parsedSample = useMemo(() => parseCsv(sampleCsv), []);
  const [homeOpen, setHomeOpen] = useState(true);
  const [hasSavedWorkspace, setHasSavedWorkspace] = useState(false);
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const [view, setView] = useState<ViewId>("model");
  const [bottomTab, setBottomTab] = useState<BottomTab>("results");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [datasetName, setDatasetName] = useState("Brak wczytanego pliku");
  const [datasetId, setDatasetId] = useState("empty");
  const [datasetMeta, setDatasetMeta] = useState<DatasetMeta>({ id: "empty", name: "Brak wczytanego pliku", format: "csv", headers: [], totalRows: 0, fileSize: 0, importedAt: "1970-01-01T00:00:00.000Z", chunkCount: 0, sampled: false });
  const [charts, setCharts] = useState<ChartDefinition[]>([]);
  const [dashboardGrid, setDashboardGrid] = useState<DashboardGrid>(4);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>();
  const [nodes, setNodes] = useState<ModelNode[]>([]);
  const [edges, setEdges] = useState<ModelEdge[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [scenarioId, setScenarioId] = useState("baseline");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [zoom, setZoom] = useState(0.9);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [toast, setToast] = useState("");
  const [fileError, setFileError] = useState("");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [pendingWorkbook, setPendingWorkbook] = useState<{ file: File; sheets: string[] } | null>(null);
  const [activeImportFile, setActiveImportFile] = useState<File | null>(null);
  const [importCancelling, setImportCancelling] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [bottomPanelMode, setBottomPanelMode] = useState<BottomPanelMode>("collapsed");
  const [explorerWidth, setExplorerWidth] = useState<number>(DEFAULT_WORKSPACE_SIZES.explorerWidth);
  const [inspectorWidth, setInspectorWidth] = useState<number>(DEFAULT_WORKSPACE_SIZES.inspectorWidth);
  const [resultsHeight, setResultsHeight] = useState<number>(DEFAULT_WORKSPACE_SIZES.resultsHeight);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const [canvasPan, setCanvasPan] = useState<Point>({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = useState<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const panelResizeRef = useRef<{ panel: WorkspacePanel; pointerId: number; start: number; size: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const chartFileRef = useRef<HTMLInputElement>(null);
  const importControllerRef = useRef<AbortController | null>(null);
  const cancelFallbackRef = useRef<number | null>(null);

  const profiles = useMemo(() => profileColumns(rows, headers), [rows, headers]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const baselineScenario = scenarios[0];

  const metrics = useMemo(() => calculateScenario(scenario, rows, headers), [scenario, rows, headers]);
  const baselineMetrics = useMemo(() => calculateScenario(baselineScenario, rows, headers), [baselineScenario, rows, headers]);
  const hasDataset = datasetId !== "empty" && headers.length > 0;

  useEffect(() => {
    const hasModernSave = localStorage.getItem(WORKSPACE_MARKER_KEY) !== null;
    setHasSavedWorkspace(hasModernSave || isMeaningfulLegacyWorkspace(localStorage.getItem(LEGACY_WORKSPACE_KEY)));
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("eyes-of-odin-ui-v1") ?? "{}") as {
        showExplorer?: boolean;
        showInspector?: boolean;
        bottomPanelMode?: BottomPanelMode;
        explorerWidth?: number;
        inspectorWidth?: number;
        resultsHeight?: number;
      };
      if (typeof saved.showExplorer === "boolean") setShowExplorer(saved.showExplorer);
      if (typeof saved.showInspector === "boolean") setShowInspector(saved.showInspector);
      if (["collapsed", "normal", "maximized"].includes(saved.bottomPanelMode ?? "")) setBottomPanelMode(saved.bottomPanelMode ?? "collapsed");
      if (typeof saved.explorerWidth === "number" && Number.isFinite(saved.explorerWidth)) setExplorerWidth(clampWorkspacePanelSize("explorer", saved.explorerWidth));
      if (typeof saved.inspectorWidth === "number" && Number.isFinite(saved.inspectorWidth)) setInspectorWidth(clampWorkspacePanelSize("inspector", saved.inspectorWidth));
      if (typeof saved.resultsHeight === "number" && Number.isFinite(saved.resultsHeight)) setResultsHeight(clampWorkspacePanelSize("results", saved.resultsHeight, window.innerHeight));
    } catch {
      localStorage.removeItem("eyes-of-odin-ui-v1");
    }
  }, []);

  useEffect(() => {
    if (!workspaceActive) return;
    const snapshot: WorkspaceSnapshot = {
      version: 2,
      rows,
      headers,
      datasetName,
      datasetId,
      datasetMeta,
      charts,
      dashboardGrid,
      templates,
      defaultTemplateId,
      nodes,
      edges,
      scenarios,
      scenarioId,
      selectedNodeId,
      view,
      zoom,
      canvasPan,
    };
    const timer = window.setTimeout(() => {
      void saveWorkspace(snapshot).then(() => {
        localStorage.removeItem(LEGACY_WORKSPACE_KEY);
        setHasSavedWorkspace(true);
      }).catch(() => setToast("Nie udało się zapisać projektu lokalnie"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [workspaceActive, rows, headers, datasetName, datasetId, datasetMeta, charts, dashboardGrid, templates, defaultTemplateId, nodes, edges, scenarios, scenarioId, selectedNodeId, view, zoom, canvasPan]);

  useEffect(() => {
    localStorage.setItem("eyes-of-odin-ui-v1", JSON.stringify({ showExplorer, showInspector, bottomPanelMode, explorerWidth, inspectorWidth, resultsHeight }));
  }, [showExplorer, showInspector, bottomPanelMode, explorerWidth, inspectorWidth, resultsHeight]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setToast("Projekt zapisany lokalnie");
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setShowExplorer((visible) => !visible);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setBottomPanelMode((mode) => mode === "collapsed" ? "normal" : "collapsed");
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setSettingsOpen(false);
        setHelpOpen(false);
        importControllerRef.current?.abort();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const applyWorkspaceSnapshot = (snapshot: WorkspaceSnapshot) => {
    const restoredEdges = snapshot.edges ?? [];
    const restoredNodes = hasNodeCollisions(snapshot.nodes) ? layoutModelGraph(snapshot.nodes, restoredEdges) : snapshot.nodes;
    const restoredScenarios = snapshot.scenarios.length ? snapshot.scenarios : initialScenarios;
    setRows(snapshot.rows);
    setHeaders(snapshot.headers);
    setDatasetName(snapshot.datasetName);
    setDatasetId(snapshot.datasetId);
    setDatasetMeta(snapshot.datasetMeta);
    setCharts(snapshot.charts.map((chart) => ({ ...chart, thresholds: chart.thresholds ?? [] })));
    setDashboardGrid(snapshot.dashboardGrid);
    setTemplates(snapshot.templates.map((template) => ({ ...template, charts: template.charts.map((chart) => ({ ...chart, thresholds: chart.thresholds ?? [] })) })));
    setDefaultTemplateId(snapshot.defaultTemplateId);
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setScenarios(restoredScenarios);
    setScenarioId(restoredScenarios.some((item) => item.id === snapshot.scenarioId) ? snapshot.scenarioId : restoredScenarios[0].id);
    setSelectedNodeId(restoredNodes.some((node) => node.id === snapshot.selectedNodeId) ? snapshot.selectedNodeId : restoredNodes[0]?.id ?? "");
    setView(snapshot.view);
    setZoom(snapshot.zoom);
    setCanvasPan(snapshot.canvasPan);
    setWorkspaceActive(true);
    setHomeOpen(false);
    setToast(restoredNodes !== snapshot.nodes ? "Przywrócono sesję i uporządkowano model" : "Przywrócono ostatnią sesję");
  };

  const resumeWorkspace = async () => {
    try {
      const saved = await loadWorkspace();
      if (saved?.version === 2) {
        applyWorkspaceSnapshot(saved);
        return;
      }

      const legacyRaw = localStorage.getItem(LEGACY_WORKSPACE_KEY);
      if (!legacyRaw || !isMeaningfulLegacyWorkspace(legacyRaw)) {
        setHasSavedWorkspace(false);
        setToast("Nie znaleziono zapisanej sesji");
        return;
      }
      const legacy = JSON.parse(legacyRaw) as Partial<WorkspaceSnapshot>;
      const legacyRows = parsedSample.rows;
      const legacyHeaders = parsedSample.headers;
      applyWorkspaceSnapshot({
        version: 2,
        rows: legacyRows,
        headers: legacyHeaders,
        datasetName: "sprzedaz_2026.csv",
        datasetId: "sample-sales-2026",
        datasetMeta: { id: "sample-sales-2026", name: "sprzedaz_2026.csv", format: "csv", headers: legacyHeaders, totalRows: legacyRows.length, fileSize: sampleCsv.length, importedAt: "1970-01-01T00:00:00.000Z", chunkCount: 1, sampled: false },
        charts: legacy.charts ?? initialCharts,
        dashboardGrid: legacy.dashboardGrid ?? 4,
        templates: legacy.templates ?? [],
        defaultTemplateId: legacy.defaultTemplateId,
        nodes: legacy.nodes ?? initialNodes,
        edges: legacy.edges ?? initialEdges,
        scenarios: legacy.scenarios ?? initialScenarios,
        scenarioId: legacy.scenarioId ?? "growth",
        selectedNodeId: legacy.selectedNodeId ?? "campaign",
        view: legacy.view ?? "model",
        zoom: legacy.zoom ?? 0.9,
        canvasPan: legacy.canvasPan ?? { x: 0, y: 0 },
      });
    } catch {
      setToast("Nie udało się przywrócić zapisanej sesji");
    }
  };

  const startEmptyWorkspace = () => {
    setRows([]);
    setHeaders([]);
    setDatasetName("Brak wczytanego pliku");
    setDatasetId("empty");
    setDatasetMeta({ id: "empty", name: "Brak wczytanego pliku", format: "csv", headers: [], totalRows: 0, fileSize: 0, importedAt: "1970-01-01T00:00:00.000Z", chunkCount: 0, sampled: false });
    setCharts([]);
    setDashboardGrid(4);
    setNodes([]);
    setEdges([]);
    setScenarios(initialScenarios);
    setScenarioId("baseline");
    setSelectedNodeId("");
    setView("model");
    setZoom(0.9);
    setCanvasPan({ x: 0, y: 0 });
    setBottomPanelMode("collapsed");
    setWorkspaceActive(false);
    setToast("");
    setHomeOpen(false);
  };

  const cancelImport = () => {
    if (!importControllerRef.current || importCancelling) return;
    setImportCancelling(true);
    setImportProgress((progress) => progress ? { ...progress, message: "Anulowanie importu…" } : progress);
    importControllerRef.current.abort();
    if (cancelFallbackRef.current) window.clearTimeout(cancelFallbackRef.current);
    cancelFallbackRef.current = window.setTimeout(() => setImportProgress(null), 2_000);
  };

  const updateScenario = (patch: Partial<Scenario>) => {
    setScenarios((current) => current.map((item) => (item.id === scenario.id ? { ...item, ...patch } : item)));
  };

  const updateChoice = (group: keyof Scenario["choices"], value: string) => {
    updateScenario({ choices: { ...scenario.choices, [group]: value } });
  };

  const performImport = async (file: File, sheetName?: string) => {
    const importingFromHome = homeOpen;
    setFileError("");
    importControllerRef.current?.abort();
    const controller = new AbortController();
    importControllerRef.current = controller;
    setActiveImportFile(file);
    setImportCancelling(false);
    try {
      const imported = await importDataFile(file, { sheetName, signal: controller.signal, onProgress: setImportProgress });
      setRows(imported.displayRows);
      setHeaders(imported.meta.headers);
      setDatasetName(imported.meta.sheetName ? `${imported.meta.name} · ${imported.meta.sheetName}` : imported.meta.name);
      setDatasetId(imported.meta.id);
      setDatasetMeta(imported.meta);
      const importedProfiles = profileColumns(imported.displayRows, imported.meta.headers);
      const importedColumns = importedProfiles.map(({ name, type }) => ({ name, type }));
      const defaultTemplate = templates.find((template) => template.id === defaultTemplateId);
      if (defaultTemplate) {
        const applied = applyTemplateToDataset(defaultTemplate, importedColumns, imported.meta.id);
        setCharts(applied.charts);
        setDashboardGrid(defaultTemplate.grid);
        if (applied.missing.length) setToast(`Wczytano dane. Uzupełnij pola: ${applied.missing.join(", ")}`);
      } else {
        const nextCharts = suggestedCharts(importedProfiles, imported.meta.id);
        setCharts(nextCharts);
        setDashboardGrid(nextCharts.length > 1 ? 4 : 1);
      }
      setNodes((current) => {
        if (importingFromHome) return [{ id: "source", kind: "source", title: file.name, subtitle: `${imported.meta.totalRows} wierszy · ${imported.meta.headers.length} kolumn`, x: 120, y: 190 }];
        const source = current.find((node) => node.id === "source");
        if (!source) return [{ id: "source", kind: "source", title: file.name, subtitle: `${imported.meta.totalRows} wierszy · ${imported.meta.headers.length} kolumn`, x: 120, y: 190 }];
        return current.map((node) => node.id === "source"
          ? { ...node, title: file.name, subtitle: `${imported.meta.totalRows} wierszy · ${imported.meta.headers.length} kolumn` }
          : node);
      });
      if (importingFromHome) {
        setEdges([]);
        setScenarios(initialScenarios);
        setScenarioId("baseline");
      }
      setSelectedNodeId("source");
      setWorkspaceActive(true);
      setToast(`Wczytano ${imported.meta.totalRows.toLocaleString("pl-PL")} rekordów${imported.meta.sampled ? " · wykresy używają próbki" : ""}`);
      setView("charts");
      setHomeOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setToast("Import anulowany");
      else setFileError(error instanceof Error ? error.message : "Nie udało się odczytać pliku.");
    } finally {
      if (cancelFallbackRef.current) window.clearTimeout(cancelFallbackRef.current);
      setImportProgress(null);
      setActiveImportFile(null);
      setImportCancelling(false);
      importControllerRef.current = null;
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!supportedDataFile(file)) {
      setFileError(`Obsługiwane formaty: ${SUPPORTED_DATA_FORMAT_LABELS}.`);
      return;
    }
    if (workbookDataFile(file)) {
      const controller = new AbortController();
      importControllerRef.current?.abort();
      importControllerRef.current = controller;
      setActiveImportFile(file);
      setImportCancelling(false);
      try {
        setImportProgress({ stage: "preparing", processedRows: 0, percent: 0, message: "Sprawdzanie arkuszy" });
        const sheets = await inspectWorkbookSheets(file, controller.signal);
        if (controller.signal.aborted) throw new DOMException("Import anulowany.", "AbortError");
        setImportProgress(null);
        if (sheets.length > 1) {
          setPendingWorkbook({ file, sheets });
          return;
        }
        await performImport(file, sheets[0]);
      } catch (error) {
        setImportProgress(null);
        if (error instanceof DOMException && error.name === "AbortError") setToast("Import anulowany");
        else setFileError(error instanceof Error ? error.message : "Nie udało się sprawdzić skoroszytu.");
      } finally {
        if (importControllerRef.current === controller) importControllerRef.current = null;
        setActiveImportFile(null);
        setImportCancelling(false);
      }
      return;
    }
    await performImport(file);
  };

  const addNode = (kind: NodeKind) => {
    const anchor = selectedNode ?? nodes[nodes.length - 1];
    const id = `${kind}-${Date.now()}`;
    const position = anchor ? findVacantNodePosition(nodes, anchor, preferences.snapToGrid) : { x: 120, y: 190 };
    const next: ModelNode = {
      id,
      kind,
      title: `Nowa ${kindMeta[kind].label.toLowerCase()}`,
      subtitle: "Kliknij, aby skonfigurować",
      ...position,
    };
    setNodes((current) => [...current, next]);
    if (anchor) setEdges((current) => [...current, { id: `edge-${Date.now()}`, from: anchor.id, to: id }]);
    setSelectedNodeId(id);
    setWorkspaceActive(true);
    setToast(`${kindMeta[kind].label} dodana do modelu`);
  };

  const removeSelectedNode = () => {
    if (!selectedNode || selectedNode.id === "source") return;
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
    setEdges((current) => current.filter((edge) => edge.from !== selectedNode.id && edge.to !== selectedNode.id));
    setSelectedNodeId("source");
    setToast("Element usunięty z modelu");
  };

  const handlePointerDown = (event: ReactPointerEvent, node: ModelNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
    setDrag({ id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y });
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".model-node, .canvas-controls, .mini-map")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanDrag({
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: canvasPan,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) {
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      setNodes((current) => current.map((node) => node.id === drag.id
        ? { ...node, x: preferences.snapToGrid ? snapModelCoordinate(Math.max(10, drag.x + dx)) : Math.max(10, drag.x + dx), y: preferences.snapToGrid ? snapModelCoordinate(Math.max(10, drag.y + dy)) : Math.max(10, drag.y + dy) }
        : node));
      return;
    }
    if (panDrag?.pointerId === event.pointerId) {
      setCanvasPan(calculateCanvasPan(panDrag.origin, panDrag.start, { x: event.clientX, y: event.clientY }));
    }
  };

  const stopCanvasDrag = () => {
    setDrag(null);
    setPanDrag(null);
  };

  const startPanelResize = (event: ReactPointerEvent<HTMLDivElement>, panel: WorkspacePanel) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = panel === "results" ? event.clientY : event.clientX;
    const size = panel === "explorer" ? explorerWidth : panel === "inspector" ? inspectorWidth : resultsHeight;
    if (panel === "results") setBottomPanelMode("normal");
    panelResizeRef.current = { panel, pointerId: event.pointerId, start, size };
  };

  const handlePanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const current = resize.panel === "results" ? event.clientY : event.clientX;
    const direction = resize.panel === "explorer" ? 1 : -1;
    const nextSize = clampWorkspacePanelSize(resize.panel, resize.size + (current - resize.start) * direction, window.innerHeight);
    if (resize.panel === "explorer") setExplorerWidth(nextSize);
    else if (resize.panel === "inspector") setInspectorWidth(nextSize);
    else setResultsHeight(nextSize);
  };

  const stopPanelResize = () => {
    panelResizeRef.current = null;
  };

  const arrangeModel = () => {
    setNodes((current) => layoutModelGraph(current, edges));
    setToast("Model został czytelnie uporządkowany");
    window.setTimeout(() => fitModel(), 0);
  };

  const fitModel = () => {
    const shell = canvasRef.current;
    if (!shell) return;
    const bounds = getGraphBounds(nodes);
    const nextZoom = Math.min(1.08, Math.max(0.45, Math.min((shell.clientWidth - 80) / Math.max(bounds.maxX + 80, 1), (shell.clientHeight - 70) / Math.max(bounds.maxY + 80, 1))));
    setCanvasPan({ x: 0, y: 0 });
    setZoom(Number(nextZoom.toFixed(2)));
  };

  const createScenario = () => {
    const id = `scenario-${Date.now()}`;
    const next = { ...scenario, id, name: `Wariant ${scenarios.length}` };
    setScenarios((current) => [...current, next]);
    setScenarioId(id);
    setToast("Utworzono wariant scenariusza");
  };

  const changeSelectedTitle = (title: string) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, title } : node));
  };

  const commands = [
    { label: "Otwórz Model Studio", detail: "Widok grafu", action: () => setView("model") },
    { label: "Otwórz dane", detail: datasetName, action: () => setView("data") },
    { label: "Otwórz kreator wykresów", detail: `${charts.length} na pulpicie`, action: () => setView("charts") },
    { label: "Pokaż ścieżki decyzji", detail: "Decision Map", action: () => setView("paths") },
    { label: "Porównaj scenariusze", detail: "Bazowy vs aktywny", action: () => setView("compare") },
    { label: "Utwórz nowy wariant", detail: "Kopia aktywnego", action: createScenario },
    { label: showExplorer ? "Ukryj eksplorator" : "Pokaż eksplorator", detail: "Ctrl+B", action: () => setShowExplorer((visible) => !visible) },
    { label: bottomPanelMode === "collapsed" ? "Pokaż panel wyników" : "Ukryj panel wyników", detail: "Ctrl+J", action: () => setBottomPanelMode((mode) => mode === "collapsed" ? "normal" : "collapsed") },
    { label: "Otwórz ustawienia", detail: "Układ przestrzeni roboczej", action: () => setSettingsOpen(true) },
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase()));

  const renderEdge = (edge: ModelEdge) => {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    if (!from || !to) return null;
    const x1 = from.x + 92;
    const y1 = from.y + 34;
    const x2 = to.x + 92;
    const y2 = to.y + 34;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return (
      <div key={edge.id} className="edge-wrap" style={{ left: x1, top: y1, width: length, transform: `rotate(${angle}deg)` }}>
        <span className="edge-line" />
        {edge.label && <span className="edge-label" style={{ transform: `rotate(${-angle}deg)` }}>{edge.label}</span>}
      </div>
    );
  };

  const renderModel = () => (
    <div className={`canvas-shell ${panDrag ? "panning" : ""}`} ref={canvasRef} onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerUp={stopCanvasDrag} onPointerCancel={stopCanvasDrag}>
      <div className="canvas-dots" />
      <div className="canvas-stage" style={{ width: Math.max(1120, getGraphBounds(nodes).maxX + 100), height: Math.max(600, getGraphBounds(nodes).maxY + 100), transform: `translate3d(${canvasPan.x}px, ${canvasPan.y}px, 0) scale(${zoom})` }}>
        {edges.map(renderEdge)}
        {nodes.map((node) => (
          <button
            key={node.id}
            className={`model-node node-${node.kind} ${selectedNodeId === node.id ? "selected" : ""}`}
            style={{ left: node.x, top: node.y }}
            onPointerDown={(event) => handlePointerDown(event, node)}
            onClick={() => setSelectedNodeId(node.id)}
            aria-label={`${kindMeta[node.kind].label}: ${node.title}`}
          >
            <span className="node-icon">{kindMeta[node.kind].icon}</span>
            <span className="node-copy"><strong>{node.title}</strong><small>{node.subtitle}</small></span>
            <span className="node-port port-left" />
            <span className="node-port port-right" />
          </button>
        ))}
      </div>
      {!nodes.length && <div className="empty-workspace-state"><span>▦</span><strong>Pusty projekt</strong><p>Wczytaj plik danych, aby utworzyć źródło, model i pierwsze wykresy.</p><button className="primary-button" onClick={() => chartFileRef.current?.click()}>Wczytaj plik danych</button></div>}
      <div className="canvas-controls">
        <button onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} aria-label="Powiększ">+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="Pomniejsz">−</button>
        <button className="fit-button" onClick={fitModel} aria-label="Dopasuj model" title="Dopasuj model do ekranu">⌗</button>
      </div>
      <div className="mini-map" aria-hidden="true">
        {nodes.map((node) => <span key={node.id} className={`mini-node mini-${node.kind}`} style={{ left: node.x / 8, top: node.y / 7 }} />)}
      </div>
    </div>
  );

  const renderData = () => (
    <div className="data-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">DATA STUDIO</span>
          <h2>{hasDataset ? datasetName : "Brak wczytanych danych"}</h2>
          <p>{hasDataset ? `${datasetMeta.totalRows.toLocaleString("pl-PL")} wierszy · ${headers.length} kolumn · dane przetwarzane lokalnie` : "Wczytaj plik, aby zobaczyć podgląd i jakość danych."}</p>
        </div>
        <div className="view-heading-actions">
          <button className="secondary-button" disabled={!hasDataset} onClick={() => setView("charts")}>Twórz wykresy</button>
          <label className="primary-button file-button">
            Wczytaj plik danych
            <input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} />
          </label>
        </div>
      </div>
      {fileError && <div className="error-banner">{fileError}</div>}
      {!hasDataset ? <div className="empty-data-state"><span>▦</span><strong>Tu pojawią się Twoje dane</strong><p>Aplikacja nie ładuje już żadnych przykładowych rekordów. Wybierz własny plik, aby rozpocząć.</p><label className="primary-button file-button">Wczytaj plik danych<input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} /></label></div> : <>
      <div className="quality-grid">
        <article><span>Kompletność</span><strong>{Math.round((profiles.reduce((sum, item) => sum + item.filled, 0) / Math.max(1, rows.length * headers.length)) * 100)}%</strong><small>uzupełnionych pól</small></article>
        <article><span>Kolumny liczbowe</span><strong>{profiles.filter((item) => item.type === "number").length}</strong><small>gotowe do obliczeń</small></article>
        <article><span>Problemy krytyczne</span><strong className="good">0</strong><small>model można uruchomić</small></article>
      </div>
      <div className="data-table-card">
        <div className="table-title"><strong>Podgląd danych</strong><span>Pierwsze {Math.min(rows.length, 8)} wierszy</span></div>
        <div className="table-scroll">
          <table>
            <thead><tr>{headers.map((header) => <th key={header}>{header}<small>{profiles.find((item) => item.name === header)?.type}</small></th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((row, index) => <tr key={index}>{headers.map((header) => <td key={header}>{row[header] || "—"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );

  const renderDataRequired = (title: string, description: string) => (
    <div className="data-required-view"><span>▦</span><strong>{title}</strong><p>{description}</p><button className="primary-button" onClick={() => chartFileRef.current?.click()}>Wczytaj plik danych</button></div>
  );

  const renderPaths = () => (
    <div className="paths-view">
      <div className="view-heading compact-heading">
        <div><span className="eyebrow">DECISION MAP</span><h2>Ścieżka aktywnego scenariusza</h2><p>Kliknij wybór, aby natychmiast przeliczyć wynik.</p></div>
        <div className="path-code"><span>{scenario.choices.pricing}</span><i>→</i><span>{scenario.choices.campaign}</span><i>→</i><span>{scenario.choices.market}</span></div>
      </div>
      <div className="decision-flow">
        <DecisionStage number="01" title="Strategia ceny" selected={scenario.choices.pricing} options={[
          { id: "1", title: "Bez zmiany ceny", detail: "Stabilny popyt" },
          { id: "2", title: "Cena premium +8%", detail: "Wyższa marża" },
        ]} onChoose={(value) => updateChoice("pricing", value)} />
        <div className="flow-arrow">→</div>
        <DecisionStage number="04" title="Typ kampanii" selected={scenario.choices.campaign} options={[
          { id: "4", title: "Performance", detail: "Szybka konwersja" },
          { id: "5", title: "Budowa marki", detail: "Wolniejszy wzrost" },
        ]} onChoose={(value) => updateChoice("campaign", value)} />
        <div className="flow-arrow">→</div>
        <DecisionStage number="09" title="Ekspansja" selected={scenario.choices.market} options={[
          { id: "9", title: "Rynek DACH", detail: "Duży potencjał" },
          { id: "10", title: "Rynek lokalny", detail: "Niższe ryzyko" },
        ]} onChoose={(value) => updateChoice("market", value)} />
        <div className="flow-arrow">→</div>
        <div className="path-result-card">
          <span>WYNIK ŚCIEŻKI</span>
          <strong>{formatMoney(metrics.profit)}</strong>
          <small>zysku miesięcznie</small>
          <div className={metrics.profit >= baselineMetrics.profit ? "delta positive" : "delta negative"}>
            {metrics.profit >= baselineMetrics.profit ? "+" : ""}{((metrics.profit / baselineMetrics.profit - 1) * 100).toFixed(1)}% vs bazowy
          </div>
        </div>
      </div>
      <div className="path-insight">
        <div className="insight-pulse">✦</div>
        <div><strong>Dlaczego wynik się zmienił?</strong><p>Ścieżka {scenario.choices.pricing} → {scenario.choices.campaign} → {scenario.choices.market} zwiększa liczbę klientów do {metrics.customers.toLocaleString("pl-PL")}, ale dodaje koszt ekspansji. Największy wpływ ma obecnie wybór rynku.</p></div>
      </div>
    </div>
  );

  const renderCompare = () => {
    const rowsToCompare = [
      { label: "Przychód", base: baselineMetrics.revenue, current: metrics.revenue, money: true },
      { label: "Koszt", base: baselineMetrics.cost, current: metrics.cost, money: true },
      { label: "Zysk", base: baselineMetrics.profit, current: metrics.profit, money: true },
      { label: "Klienci", base: baselineMetrics.customers, current: metrics.customers, money: false },
    ];
    const exportComparison = () => {
      const csv = [
        ["metryka", "scenariusz_bazowy", scenario.name, "roznica_procent"],
        ...rowsToCompare.map((item) => [item.label, item.base, item.current, ((item.current / item.base - 1) * 100).toFixed(2)]),
      ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      downloadTextFile(`eyes-of-odin-${scenario.id}-porownanie.csv`, `\uFEFF${csv}`);
      setToast("Pobrano raport porównania");
    };
    return (
      <div className="compare-view">
        <div className="view-heading compact-heading"><div><span className="eyebrow">COMPARE</span><h2>Bazowy vs {scenario.name}</h2><p>Jedno miejsce do oceny efektów i kosztów decyzji.</p></div><button className="secondary-button" onClick={exportComparison}>Eksportuj raport</button></div>
        <div className="compare-summary">
          <div><span>Zmiana zysku</span><strong className={metrics.profit >= baselineMetrics.profit ? "good" : "bad"}>{metrics.profit >= baselineMetrics.profit ? "+" : ""}{formatMoney(metrics.profit - baselineMetrics.profit)}</strong></div>
          <div><span>Zmiana klientów</span><strong>+{(metrics.customers - baselineMetrics.customers).toLocaleString("pl-PL")}</strong></div>
          <div><span>Ryzyko scenariusza</span><strong>{metrics.risk.toFixed(0)}/100</strong></div>
        </div>
        <div className="compare-card">
          <div className="compare-header"><span>Metryka</span><span>Scenariusz bazowy</span><span>{scenario.name}</span><span>Różnica</span></div>
          {rowsToCompare.map((item) => {
            const max = Math.max(item.base, item.current);
            const diff = item.current / item.base - 1;
            return <div className="compare-row" key={item.label}>
              <strong>{item.label}</strong>
              <div className="bar-cell"><span style={{ width: `${(item.base / max) * 88}%` }} /><small>{item.money ? formatCompact(item.base) : Math.round(item.base).toLocaleString("pl-PL")}</small></div>
              <div className="bar-cell active"><span style={{ width: `${(item.current / max) * 88}%` }} /><small>{item.money ? formatCompact(item.current) : Math.round(item.current).toLocaleString("pl-PL")}</small></div>
              <em className={diff >= 0 ? "positive-text" : "negative-text"}>{diff >= 0 ? "+" : ""}{(diff * 100).toFixed(1)}%</em>
            </div>;
          })}
        </div>
      </div>
    );
  };

  const explorerVisible = view !== "charts" && showExplorer;
  const inspectorVisible = view === "model" && showInspector && Boolean(selectedNode);
  const bottomVisible = hasDataset && view !== "charts" && bottomPanelMode !== "collapsed";
  const gridClasses = [
    "main-grid",
    view === "charts" ? "charts-mode focus-mode" : "",
    !explorerVisible ? "hide-explorer" : "",
    !inspectorVisible ? "hide-inspector" : "",
    !bottomVisible ? "hide-bottom" : "",
    bottomPanelMode === "maximized" && bottomVisible ? "bottom-maximized" : "",
  ].filter(Boolean).join(" ");

  const renderImportProgress = () => importProgress ? (
    <div className="import-progress-modal" role="dialog" aria-modal="true" aria-live="polite">
      <div>
        <span className="eyebrow">IMPORT DANYCH</span>
        <strong>{importProgress.message}</strong>
        {activeImportFile && <p>{activeImportFile.name}<span>{formatBytes(activeImportFile.size)}</span></p>}
        <small>{importProgress.processedRows.toLocaleString("pl-PL")} rekordów</small>
        <div className="import-progress-track"><i style={{ width: `${importProgress.percent}%` }} /></div>
        <footer><span>{importProgress.percent}%</span><button onClick={cancelImport} disabled={importCancelling}>{importCancelling ? "Anulowanie…" : "Anuluj"}</button></footer>
      </div>
    </div>
  ) : null;

  if (homeOpen) {
    return (
      <main className="home-shell">
        <input ref={chartFileRef} className="global-file-input" type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} />
        <HomeView
          hasSavedWorkspace={hasSavedWorkspace}
          onOpenFile={() => chartFileRef.current?.click()}
          onResume={() => void resumeWorkspace()}
          onStartEmpty={startEmptyWorkspace}
        />
        {fileError && <div className="home-error"><span>!</span>{fileError}<button onClick={() => setFileError("")}>×</button></div>}
        {renderImportProgress()}
        {pendingWorkbook && <div className="sheet-picker-backdrop"><div className="sheet-picker"><span className="eyebrow">ARKUSZE PLIKU</span><h3>Wybierz arkusz do wczytania</h3><p>{pendingWorkbook.file.name}</p><div>{pendingWorkbook.sheets.map((sheet) => <button key={sheet} onClick={() => { const file = pendingWorkbook.file; setPendingWorkbook(null); void performImport(file, sheet); }}><span>▦</span><strong>{sheet}</strong><i>›</i></button>)}</div><button className="secondary-button" onClick={() => setPendingWorkbook(null)}>Anuluj</button></div></div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <input ref={chartFileRef} className="global-file-input" type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} />
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setHomeOpen(true)} title="Wróć do strony głównej"><span className="brand-mark"><i /><i /><i /></span><strong>EYES OF ODIN</strong><small>SCENARIO STUDIO</small></button>
        <div className="project-breadcrumb"><span>{preferences.language === "en" ? "Projects" : "Projekty"}</span><i>/</i><strong>{workspaceActive ? (preferences.language === "en" ? "Sales growth model" : "Model wzrostu sprzedaży") : (preferences.language === "en" ? "New project" : "Nowy projekt")}</strong><span className="saved-dot">{workspaceActive ? `● ${t("saved")}` : (preferences.language === "en" ? "empty" : "pusty")}</span></div>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span> {t("search")} <kbd>Ctrl K</kbd></button>
        <div className="top-actions"><button aria-label="Notifications" title="Notifications" onClick={() => setToast(preferences.language === "en" ? "No new notifications" : "Brak nowych powiadomień")}>○</button><button className="run-button" disabled={!hasDataset} onClick={() => { setBottomTab("results"); setBottomPanelMode("normal"); setToast(preferences.language === "en" ? "Model recalculated" : "Model przeliczony"); }}>▶ {t("run")}</button></div>
      </header>

      <aside className="activity-bar">
        <div className="activity-main">
          <button onClick={() => setHomeOpen(true)} aria-label={t("start")} title={t("start")}><span>⌂</span><small>{t("start")}</small></button>
          {navItems.map((item) => { const label = t(item.id); return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-label={label} title={`${label} (${item.shortcut})`}><span>{item.icon}</span><small>{label}</small></button>; })}
        </div>
        <div className="activity-bottom"><button aria-label={t("settings")} title={t("settings")} onClick={() => setSettingsOpen(true)}><span>⚙</span></button><button className="help-button" aria-label="Help" title="Help" onClick={() => setHelpOpen(true)}>?</button></div>
      </aside>

      <section className="workbench">
        <div className="tabs-row">
          <div className="document-tabs"><button className={view === "model" ? "active" : ""} onClick={() => setView("model")}><span className="tab-glyph">◇</span> {workspaceActive ? "model_wzrostu.odin" : "nowy_projekt.odin"}</button>{hasDataset && <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}><span className="csv-glyph">▦</span> {datasetName}</button>}{hasDataset && <button className={view === "charts" ? "active" : ""} onClick={() => setView("charts")}><span className="chart-glyph">▥</span> pulpit_wykresów</button>}</div>
          <div className="scenario-switcher"><span>SCENARIUSZ</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={createScenario} aria-label="Dodaj scenariusz">＋</button></div>
        </div>

        <div
          className={gridClasses}
          style={{
            "--explorer": `${explorerWidth}px`,
            "--inspector": `${inspectorWidth}px`,
            "--results": `${resultsHeight}px`,
          } as CSSProperties}
        >
          {explorerVisible && <aside className="explorer-panel">
            <div className="panel-title"><span>EKSPLORATOR</span><button aria-label="Ukryj eksplorator" title="Ukryj eksplorator (Ctrl+B)" onClick={() => setShowExplorer(false)}>×</button></div>
            <div className="project-tree">
              <div className="tree-project"><span>⌄</span><strong>MODEL WZROSTU</strong></div>
              {hasDataset && <button className={view === "data" ? "tree-active" : ""} onClick={() => setView("data")}><i className="tree-line" /><span className="csv-glyph">▦</span><span>{datasetName}</span><small>{datasetMeta.totalRows}</small></button>}
              <div className="tree-group"><span>⌄</span> Wizualizacje</div>
              {hasDataset ? <button onClick={() => setView("charts")}><i className="tree-line" /><span className="chart-glyph">▥</span><span>Pulpit wykresów</span><small>{charts.length}</small></button> : <div className="tree-empty">Brak danych i wykresów</div>}
              <div className="tree-group"><span>⌄</span> Modele</div>
              <button className={view === "model" ? "tree-active" : ""} onClick={() => setView("model")}><i className="tree-line" /><span>◇</span><span>Model wzrostu</span></button>
              <div className="tree-group"><span>⌄</span> Scenariusze</div>
              {scenarios.map((item) => <button key={item.id} className={scenarioId === item.id ? "tree-active" : ""} onClick={() => setScenarioId(item.id)}><i className="tree-line" /><span className={item.id === "baseline" ? "base-dot" : "variant-dot"}>●</span><span>{item.name}</span></button>)}
            </div>
            <div className="library-title"><span>BLOKI MODELU</span><small>przeciągnij lub kliknij</small></div>
            <div className="block-library">
              {(Object.keys(kindMeta) as NodeKind[]).map((kind) => <button key={kind} onClick={() => addNode(kind)}><span className={`block-icon node-${kind}`}>{kindMeta[kind].icon}</span><span><strong>{kindMeta[kind].label}</strong><small>{kind === "source" ? "Pliki, arkusze, Parquet" : kind === "decision" ? "Rozgałęź ścieżkę" : kind === "metric" ? "Oblicz wynik" : "Przetwórz dane"}</small></span><i>＋</i></button>)}
            </div>
            <label className="import-drop"><span>＋</span><strong>Dodaj dane</strong><small>13 formatów · do 2 GB</small><input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} /></label>
          </aside>}
          {explorerVisible && <div className="workspace-resizer explorer-resizer" role="separator" aria-label="Zmień szerokość eksploratora" aria-orientation="vertical" aria-valuenow={Math.round(explorerWidth)} onPointerDown={(event) => startPanelResize(event, "explorer")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}

          <section className="center-stage">
            {view !== "charts" && <div className="stage-toolbar">
              <div><button className={showExplorer ? "active" : ""} onClick={() => setShowExplorer((visible) => !visible)}>☰ {t("explorer")}</button>{view === "model" && <button className={showInspector ? "active" : ""} disabled={!selectedNode} onClick={() => setShowInspector((visible) => !visible)}>☷ {t("inspector")}</button>}<button className={bottomPanelMode !== "collapsed" ? "active" : ""} disabled={!hasDataset} onClick={() => setBottomPanelMode((mode) => mode === "collapsed" ? "normal" : "collapsed")}>▤ {t("resultsPanel")}</button><span />{view === "model" && <><button onClick={() => addNode("transform")}>＋ {t("block")}</button><button disabled={!nodes.length} onClick={arrangeModel}>⌘ {t("arrange")}</button><button disabled={nodes.length < 2} onClick={() => setToast(preferences.language === "en" ? "Select two elements to create a relation" : "Wybierz dwa elementy, aby utworzyć relację")}>⌁ {t("relation")}</button></>}</div>
              <div className="model-health"><i /> {nodes.length ? "Model gotowy" : "Pusty model"} <span>·</span> {nodes.length} bloków <span>·</span> {edges.length} relacji</div>
            </div>}
            {view === "model" && renderModel()}
            {view === "data" && renderData()}
            {view === "charts" && (hasDataset ? <ChartStudio key={datasetId} rows={rows} columns={profiles.map(({ name, type }) => ({ name, type }))} datasetId={datasetId} datasetName={datasetName} charts={charts} onChartsChange={setCharts} onImport={() => chartFileRef.current?.click()} onToast={setToast} sampled={datasetMeta.sampled} totalRows={datasetMeta.totalRows} grid={dashboardGrid} templates={templates} defaultTemplateId={defaultTemplateId} onGridChange={setDashboardGrid} onTemplatesChange={setTemplates} onDefaultTemplateChange={setDefaultTemplateId} /> : renderDataRequired("Brak wykresów", "Najpierw wczytaj plik danych."))}
            {view === "paths" && (hasDataset ? renderPaths() : renderDataRequired("Brak ścieżek", "Ścieżki pojawią się po wczytaniu danych i zbudowaniu modelu."))}
            {view === "compare" && (hasDataset ? renderCompare() : renderDataRequired("Brak porównania", "Wczytaj dane, aby porównywać scenariusze."))}
          </section>

          {inspectorVisible && selectedNode && <aside className="inspector-panel">
            <div className="panel-title"><span>INSPEKTOR</span><button aria-label="Zamknij inspektor" onClick={() => setShowInspector(false)}>×</button></div>
            <div className="selected-summary"><span className={`large-node-icon node-${selectedNode.kind}`}>{kindMeta[selectedNode.kind].icon}</span><div><small>{kindMeta[selectedNode.kind].label.toUpperCase()}</small><strong>{selectedNode.title}</strong></div></div>
            <div className="inspector-section open"><div className="section-heading"><span>⌄</span><strong>Właściwości</strong></div><label>Nazwa<input value={selectedNode.title} onChange={(event) => changeSelectedTitle(event.target.value)} /></label><label>Opis<textarea value={selectedNode.subtitle} onChange={(event) => setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, subtitle: event.target.value } : node))} /></label></div>
            <div className="inspector-section open scenario-controls"><div className="section-heading"><span>⌄</span><strong>Parametry scenariusza</strong></div>
              <RangeControl label="Zmiana ceny" value={scenario.priceChange} min={-20} max={30} suffix="%" onChange={(priceChange) => updateScenario({ priceChange })} />
              <RangeControl label="Budżet marketingu" value={scenario.marketingChange} min={-40} max={80} suffix="%" onChange={(marketingChange) => updateScenario({ marketingChange })} />
              <RangeControl label="Zmiana konwersji" value={scenario.conversionChange} min={-20} max={40} suffix="%" onChange={(conversionChange) => updateScenario({ conversionChange })} />
            </div>
            <div className="inspector-section"><div className="section-heading"><span>›</span><strong>Reguła obliczenia</strong><small>fx</small></div></div>
            <div className="inspector-section"><div className="section-heading"><span>›</span><strong>Połączenia</strong><small>{edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id).length}</small></div></div>
            {selectedNode.id !== "source" && <button className="danger-button" onClick={removeSelectedNode}>Usuń element</button>}
          </aside>}
          {inspectorVisible && <div className="workspace-resizer inspector-resizer" role="separator" aria-label="Zmień szerokość inspektora" aria-orientation="vertical" aria-valuenow={Math.round(inspectorWidth)} onPointerDown={(event) => startPanelResize(event, "inspector")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}

          {bottomVisible && <section className="bottom-panel">
            <div className="bottom-tabs">
              <button className={bottomTab === "results" ? "active" : ""} onClick={() => setBottomTab("results")}>WYNIKI <span>4</span></button>
              <button className={bottomTab === "data" ? "active" : ""} onClick={() => setBottomTab("data")}>DANE</button>
              <button className={bottomTab === "issues" ? "active" : ""} onClick={() => setBottomTab("issues")}>PROBLEMY <span className="issue-zero">0</span></button>
              <div className="bottom-actions"><span>Ostatnie przeliczenie: teraz</span><button aria-label={bottomPanelMode === "maximized" ? "Przywróć rozmiar" : "Maksymalizuj"} title={bottomPanelMode === "maximized" ? "Przywróć rozmiar" : "Maksymalizuj"} onClick={() => setBottomPanelMode((mode) => mode === "maximized" ? "normal" : "maximized")}>{bottomPanelMode === "maximized" ? "⌄" : "⌃"}</button><button aria-label="Zamknij panel wyników" title="Zamknij panel wyników (Ctrl+J)" onClick={() => setBottomPanelMode("collapsed")}>×</button></div>
            </div>
            {bottomTab === "results" && <div className="metrics-strip">
              <MetricCard label="Przychód" value={formatMoney(metrics.revenue)} delta={(metrics.revenue / baselineMetrics.revenue - 1) * 100} spark={[38, 43, 41, 48, 54, 62, 69]} />
              <MetricCard label="Koszt" value={formatMoney(metrics.cost)} delta={(metrics.cost / baselineMetrics.cost - 1) * 100} spark={[35, 36, 42, 45, 51, 49, 56]} />
              <MetricCard label="Zysk" value={formatMoney(metrics.profit)} delta={(metrics.profit / baselineMetrics.profit - 1) * 100} spark={[28, 31, 39, 42, 51, 62, 74]} featured />
              <MetricCard label="Marża" value={`${metrics.margin.toFixed(1)}%`} delta={metrics.margin - baselineMetrics.margin} spark={[42, 38, 47, 51, 56, 61, 66]} />
            </div>}
            {bottomTab === "data" && <div className="bottom-message"><strong>{datasetName}</strong><span>{datasetMeta.totalRows.toLocaleString("pl-PL")} wierszy · {headers.length} kolumn · {profiles.filter((item) => item.type === "number").length} pól liczbowych</span><button onClick={() => setView("data")}>Otwórz Data Studio</button></div>}
            {bottomTab === "issues" && <div className="bottom-message success"><strong>✓ Model nie zawiera problemów blokujących</strong><span>Wszystkie użyte pola są dostępne, a ścieżka ma wynik końcowy.</span></div>}
          </section>}
          {bottomVisible && bottomPanelMode !== "maximized" && <div className="workspace-resizer results-resizer" role="separator" aria-label="Zmień wysokość panelu wyników" aria-orientation="horizontal" aria-valuenow={Math.round(resultsHeight)} onPointerDown={(event) => startPanelResize(event, "results")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}
        </div>
      </section>

      <footer className="statusbar"><div><span>◇ main</span><span>↻</span><span className="status-ok">✓ 0</span><span>△ 0</span></div><div><span>{datasetMeta.totalRows.toLocaleString(locale)} {preferences.language === "en" ? "records" : "rekordów"}</span><span>{preferences.language === "en" ? "local" : "lokalnie"}</span><span>{hasDataset ? datasetMeta.format.toUpperCase() : (preferences.language === "en" ? "NO DATA" : "BRAK DANYCH")}</span><span>Eyes Engine {APP_VERSION}</span><span className="status-live">● {t("ready")}</span></div></footer>

      {renderImportProgress()}
      {pendingWorkbook && <div className="sheet-picker-backdrop"><div className="sheet-picker"><span className="eyebrow">ARKUSZE PLIKU</span><h3>Wybierz arkusz do wczytania</h3><p>{pendingWorkbook.file.name}</p><div>{pendingWorkbook.sheets.map((sheet) => <button key={sheet} onClick={() => { const file = pendingWorkbook.file; setPendingWorkbook(null); void performImport(file, sheet); }}><span>▦</span><strong>{sheet}</strong><i>›</i></button>)}</div><button className="secondary-button" onClick={() => setPendingWorkbook(null)}>Anuluj</button></div></div>}

      {toast && <button className="toast" onClick={() => setToast("")}><span>✓</span>{toast}<i>×</i></button>}
      {commandOpen && <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-modal" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Wpisz polecenie…" /><kbd>ESC</kbd></div><div className="command-list"><small>POLECENIA</small>{commands.map((command, index) => <button key={command.label} className={index === 0 ? "active" : ""} onClick={() => { command.action(); setCommandOpen(false); setCommandQuery(""); }}><span>›</span><strong>{command.label}</strong><small>{command.detail}</small></button>)}</div></div></div>}
      <SettingsDialog open={settingsOpen} showExplorer={showExplorer} showInspector={showInspector} showResults={bottomPanelMode !== "collapsed"} onShowExplorer={setShowExplorer} onShowInspector={setShowInspector} onShowResults={(visible) => setBottomPanelMode(visible ? "normal" : "collapsed")} onClose={() => setSettingsOpen(false)} onRestoreLayout={() => { setShowExplorer(true); setShowInspector(false); setBottomPanelMode("collapsed"); setExplorerWidth(DEFAULT_WORKSPACE_SIZES.explorerWidth); setInspectorWidth(DEFAULT_WORKSPACE_SIZES.inspectorWidth); setResultsHeight(DEFAULT_WORKSPACE_SIZES.resultsHeight); setCanvasPan({ x: 0, y: 0 }); }} />
      {helpOpen && <div className="app-dialog-backdrop" onMouseDown={() => setHelpOpen(false)}><section className="app-dialog help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">EYES OF ODIN {APP_VERSION}</span><h2 id="help-title">Pomoc i informacje</h2></div><button aria-label="Zamknij pomoc" onClick={() => setHelpOpen(false)}>×</button></header><p>Lokalne studio wizualizacji, limitów i scenariuszy. Dane nie opuszczają komputera.</p><div className="shortcut-list"><div><kbd>Ctrl K</kbd><span>Paleta poleceń</span></div><div><kbd>Ctrl B</kbd><span>Eksplorator</span></div><div><kbd>Ctrl J</kbd><span>Panel wyników</span></div><div><kbd>Esc</kbd><span>Zamknij okno lub anuluj import</span></div></div><footer><button className="primary-button" onClick={() => setHelpOpen(false)}>Rozumiem</button></footer></section></div>}
    </main>
  );
}

function RangeControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span><small>{label}</small><strong>{value > 0 ? "+" : ""}{value}{suffix}</strong></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ "--range-progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} /></label>;
}

function MetricCard({ label, value, delta, spark, featured = false }: { label: string; value: string; delta: number; spark: number[]; featured?: boolean }) {
  const points = spark.map((point, index) => `${index * 18},${48 - point * 0.45}`).join(" ");
  return <article className={`metric-card ${featured ? "featured" : ""}`}><div><span>{label}</span><strong>{value}</strong><small className={delta >= 0 ? "positive-text" : "negative-text"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}% <em>vs bazowy</em></small></div><div className="sparkline" aria-hidden="true"><svg viewBox="0 0 110 52" preserveAspectRatio="none"><polyline points={points} /></svg></div></article>;
}

function DecisionStage({ number, title, selected, options, onChoose }: { number: string; title: string; selected: string; options: Array<{ id: string; title: string; detail: string }>; onChoose: (id: string) => void }) {
  return <section className="decision-stage"><div className="decision-title"><span>{number}</span><strong>{title}</strong></div>{options.map((option) => <button key={option.id} className={selected === option.id ? "selected" : ""} onClick={() => onChoose(option.id)}><span>{selected === option.id ? "✓" : option.id}</span><div><strong>{option.title}</strong><small>{option.detail}</small></div></button>)}</section>;
}
