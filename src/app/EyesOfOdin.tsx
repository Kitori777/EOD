"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { HomeView } from "./views/HomeView";
import { APP_VERSION } from "./version";
import { useI18n } from "./i18n/translations";
import { SettingsDialog } from "./settings/SettingsDialog";
import { HelpCenterDialog, type HelpDestination } from "./help/HelpCenterDialog";
import { useAppPreferences } from "./settings/preferences";
import { calculateCanvasPan, clampWorkspacePanelSize, DEFAULT_WORKSPACE_SIZES, type Point, type WorkspacePanel } from "./layout/workspace-layout";
import { LEGACY_WORKSPACE_KEY, loadWorkspace, saveWorkspace, WORKSPACE_MARKER_KEY, type WorkspaceSnapshot } from "./storage/workspace-storage";
import { ChartStudio } from "../mechanics/charts/components/ChartStudio";
import { applyTemplateToDataset, type DashboardGrid, type DashboardTemplate } from "../mechanics/charts/templates/dashboard-templates";
import type { Aggregation, ChartDefinition, DataRow } from "../mechanics/charts/types/chart-types";
import { compareColumns, compareGroups, getGroupValues, type ComparisonMode } from "../mechanics/compare/comparison-engine";
import type { DatasetMeta, ImportProgress } from "../mechanics/data/types/data-types";
import { importDataFile, supportedDataFile } from "../mechanics/data/importers/file-import";
import { DATA_FILE_ACCEPT, SUPPORTED_DATA_FORMAT_LABELS, workbookDataFile } from "../mechanics/data/importers/format-registry";
import { inspectWorkbookSheets } from "../mechanics/data/importers/workbook-import";
import { OlsStudio } from "../mechanics/econometrics/components/OlsStudio";
import type { OlsChangeScenario, OlsModelSpecification } from "../mechanics/econometrics/types/ols-types";
import { calculateScenario, supportsScenarioModel } from "../mechanics/modeling/engine/scenario-engine";
import { executeDataModel, validateDataModel } from "../mechanics/modeling/engine/model-execution-engine";
import { evaluateFormulaSeries } from "../mechanics/modeling/engine/formula-engine";
import { applyModelMemory } from "../mechanics/modeling/engine/model-memory-engine";
import { resolveModelConnection, reverseModelConnection } from "../mechanics/modeling/engine/model-graph-editor";
import { ModelVerificationStudio } from "../mechanics/modeling/components/ModelVerificationStudio";
import { ModelSettingsDialog, type ModelSettingsTab } from "../mechanics/modeling/components/ModelSettingsDialog";
import { findVacantNodePosition, getGraphBounds, hasNodeCollisions, layoutModelGraph, snapModelCoordinate } from "../mechanics/modeling/layout/model-layout";
import type { BottomTab, ModelDependencyRule, ModelEdge, ModelExecutionResult, ModelMemoryEntry, ModelNode, ModelNodeConfig, ModelParameter, ModelWorkspaceMode, NodeKind, Scenario, ViewId } from "../mechanics/modeling/types/model-types";
import { DiagnosticStudio } from "../mechanics/simulation/components/DiagnosticStudio";
import { WhatIfStudio } from "../mechanics/simulation/components/WhatIfStudio";
import { DEFAULT_DIAGNOSTIC_PREFERENCES, DEFAULT_VERIFICATION_PREFERENCES, type DiagnosticPreferences, type VerificationPreferences, type WhatIfScenario } from "../mechanics/simulation/types/simulation-types";

type ColumnProfile = {
  name: string;
  type: "number" | "date" | "text";
  filled: number;
  unique: number;
  sample: string;
};

type BottomPanelMode = "collapsed" | "normal" | "maximized";
const EMPTY_OLS_SPECIFICATION: OlsModelSpecification = { targetField: "", predictorFields: [], includeIntercept: true, justification: "" };
const EMPTY_OLS_SCENARIO: OlsChangeScenario = { predictorField: "", operation: "percent", value: 10 };
type ModelUndoAction =
  | { kind: "node"; node: ModelNode; edges: ModelEdge[] }
  | { kind: "edge"; edge: ModelEdge };

function suggestedCharts(columns: ColumnProfile[], datasetId: string): ChartDefinition[] {
  const names = new Set(columns.map((column) => column.name));
  if (["Timestamp", "Dancer_Setpoint", "Dancer_Process_Value", "Dancer_Output", "Nip_Setpoint", "Nip_Process_Value", "Line_Speed"].every((name) => names.has(name))) {
    const p90 = (id: string, field: string, direction: "above" | "below", label: string, description: string): ChartDefinition["thresholds"] => [{ id, field, mode: "percentile", percentile: 90, direction, label, severity: "warning", description, evaluation: "raw", enabled: true }];
    return [
      { id: `chart-${Date.now()}-dancer-track`, title: "Dancer · spadki poniżej dolnej granicy 90%", datasetId, type: "line", xField: "Timestamp", yFields: ["Dancer_Setpoint", "Dancer_Process_Value"], aggregation: "average", filters: [], thresholds: p90("dancer-process-lower-90", "Dancer_Process_Value", "below", "Niski poziom Dancer", "Wartość procesu znalazła się w dolnych 10% obserwacji."), size: "large" },
      { id: `chart-${Date.now()}-dancer-output`, title: "Dancer Output · zdarzenia powyżej górnej granicy 90%", datasetId, type: "area", xField: "Timestamp", yFields: ["Dancer_Output"], aggregation: "average", filters: [], thresholds: p90("dancer-output-p90", "Dancer_Output", "above", "Wysoki Dancer Output", "Podwyższony poziom względem 90% obserwacji w wybranym okresie."), size: "large" },
      { id: `chart-${Date.now()}-nip-track`, title: "Nip · spadki poniżej dolnej granicy 90%", datasetId, type: "line", xField: "Timestamp", yFields: ["Nip_Setpoint", "Nip_Process_Value"], aggregation: "average", filters: [], thresholds: p90("nip-process-lower-90", "Nip_Process_Value", "below", "Niski poziom Nip", "Wartość procesu znalazła się w dolnych 10% obserwacji."), size: "large" },
      { id: `chart-${Date.now()}-production`, title: "Prędkość linii · zdarzenia powyżej górnej granicy 90%", datasetId, type: "line", xField: "Timestamp", yFields: ["Line_Speed"], aggregation: "average", filters: [], thresholds: p90("line-speed-p90", "Line_Speed", "above", "Wysoka prędkość linii", "Nietypowo wysoka prędkość w porównaniu z analizowanym okresem."), size: "large" },
    ];
  }
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

function createImportedModel(fileName: string, totalRows: number, columns: ColumnProfile[]) {
  const source: ModelNode = { id: "source", kind: "source", title: fileName, subtitle: `${totalRows} wierszy · ${columns.length} kolumn`, x: 120, y: 190 };
  return { nodes: [source], edges: [] as ModelEdge[] };
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
  { id: "paths", icon: "⌁", label: "Diagnostyka", shortcut: "4" },
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function modelFileName(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "model"}.odin`;
}

export default function EyesOfOdin() {
  const { preferences } = useAppPreferences();
  const { t, locale } = useI18n();
  const label = (pl: string, en: string) => preferences.language === "en" ? en : pl;
  const kindLabel = (kind: NodeKind) => label(kindMeta[kind].label, kind === "source" ? "Source" : kind === "transform" ? "Transformation" : kind === "decision" ? "Decision" : kind === "metric" ? "Metric" : "Result");
  const parsedSample = useMemo(() => parseCsv(sampleCsv), []);
  const [homeOpen, setHomeOpen] = useState(true);
  const [hasSavedWorkspace, setHasSavedWorkspace] = useState(false);
  const [workspaceActive, setWorkspaceActive] = useState(false);
  const [projectName, setProjectName] = useState("Nowy projekt");
  const [modelName, setModelName] = useState("Model analizy danych");
  const [view, setView] = useState<ViewId>("model");
  const [modelMode, setModelMode] = useState<ModelWorkspaceMode>("build");
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
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("columns");
  const [comparisonAggregation, setComparisonAggregation] = useState<Aggregation>("average");
  const [comparisonLeftField, setComparisonLeftField] = useState("");
  const [comparisonRightField, setComparisonRightField] = useState("");
  const [comparisonMetricField, setComparisonMetricField] = useState("");
  const [comparisonGroupField, setComparisonGroupField] = useState("");
  const [comparisonLeftGroup, setComparisonLeftGroup] = useState("");
  const [comparisonRightGroup, setComparisonRightGroup] = useState("");
  const [whatIfScenarios, setWhatIfScenarios] = useState<WhatIfScenario[]>([]);
  const [activeWhatIfId, setActiveWhatIfId] = useState("");
  const [dependencyRules, setDependencyRules] = useState<ModelDependencyRule[]>([]);
  const [modelParameters, setModelParameters] = useState<ModelParameter[]>([]);
  const [modelMemory, setModelMemory] = useState<ModelMemoryEntry[]>([]);
  const [olsSpecification, setOlsSpecification] = useState<OlsModelSpecification>(EMPTY_OLS_SPECIFICATION);
  const [olsScenario, setOlsScenario] = useState<OlsChangeScenario>(EMPTY_OLS_SCENARIO);
  const [verificationPreferences, setVerificationPreferences] = useState<VerificationPreferences>(() => ({ ...DEFAULT_VERIFICATION_PREFERENCES, visibleAreas: [...DEFAULT_VERIFICATION_PREFERENCES.visibleAreas], visibleSeverities: [...DEFAULT_VERIFICATION_PREFERENCES.visibleSeverities], customItems: [] }));
  const [diagnosticPreferences, setDiagnosticPreferences] = useState<DiagnosticPreferences>(() => ({ ...DEFAULT_DIAGNOSTIC_PREFERENCES, visibleSections: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSections], summaryMetrics: [...DEFAULT_DIAGNOSTIC_PREFERENCES.summaryMetrics], visibleSeverities: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSeverities], monitoredFields: [] }));
  const [modelExecution, setModelExecution] = useState<ModelExecutionResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [connectionTargetId, setConnectionTargetId] = useState("");
  const [connectionFromId, setConnectionFromId] = useState("");
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [lastModelAction, setLastModelAction] = useState<ModelUndoAction | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [toast, setToastValue] = useState("");
  const toastLanguage = useRef(preferences.language);
  const setToast = (message: string) => {
    toastLanguage.current = preferences.language;
    setToastValue(message);
  };
  const visibleToast = toastLanguage.current === preferences.language ? toast : "";
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
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelSettingsTab, setModelSettingsTab] = useState<ModelSettingsTab>("parameters");
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
  const modelRows = useMemo(() => applyModelMemory(rows, modelMemory), [rows, modelMemory]);
  const modelNumericFields = useMemo(() => [...new Set([
    ...profiles.filter((profile) => profile.type === "number").map((profile) => profile.name),
    ...nodes.filter((node) => node.kind === "transform").map((node) => node.config?.outputField?.trim()).filter((field): field is string => Boolean(field)),
  ])], [profiles, nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const selectedTransformInputFields = selectedNode?.kind === "transform" ? modelNumericFields.filter((field) => field !== selectedNode.config?.outputField?.trim()) : modelNumericFields;
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const baselineScenario = scenarios[0];

  const metrics = useMemo(() => calculateScenario(scenario, rows, headers), [scenario, rows, headers]);
  const baselineMetrics = useMemo(() => calculateScenario(baselineScenario, rows, headers), [baselineScenario, rows, headers]);
  const hasDataset = datasetId !== "empty" && headers.length > 0;
  const scenarioModelAvailable = supportsScenarioModel(headers);
  const modelValidation = useMemo(() => validateDataModel(nodes, edges, [...new Set([...headers, ...modelNumericFields])], modelParameters, preferences.language), [nodes, edges, headers, modelNumericFields, modelParameters, preferences.language]);
  const selectedFormulaPreview = useMemo(() => {
    const formula = selectedNode?.config?.formula?.trim();
    if (!formula) return null;
    const preview = evaluateFormulaSeries(formula, modelRows.slice(0, 250), modelParameters);
    return { ...preview, average: preview.values.length ? preview.values.reduce((sum, value) => sum + value, 0) / preview.values.length : undefined };
  }, [selectedNode, modelRows, modelParameters]);

  useEffect(() => {
    setModelExecution(null);
  }, [rows, nodes, edges, modelParameters, modelMemory]);

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
      version: 9,
      projectName,
      modelName,
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
      modelMode,
      zoom,
      canvasPan,
      whatIfScenarios,
      activeWhatIfId,
      dependencyRules,
      modelParameters,
      modelMemory,
      olsSpecification,
      olsScenario,
      verificationPreferences,
      diagnosticPreferences,
    };
    const timer = window.setTimeout(() => {
      void saveWorkspace(snapshot).then(() => {
        localStorage.removeItem(LEGACY_WORKSPACE_KEY);
        setHasSavedWorkspace(true);
      }).catch(() => setToast(label("Nie udało się zapisać projektu lokalnie", "The project could not be saved locally")));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [workspaceActive, projectName, modelName, rows, headers, datasetName, datasetId, datasetMeta, charts, dashboardGrid, templates, defaultTemplateId, nodes, edges, scenarios, scenarioId, selectedNodeId, view, modelMode, zoom, canvasPan, whatIfScenarios, activeWhatIfId, dependencyRules, modelParameters, modelMemory, olsSpecification, olsScenario, verificationPreferences, diagnosticPreferences]);

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
        setToast(label("Projekt zapisany lokalnie", "Project saved locally"));
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
        setModelSettingsOpen(false);
        setHelpOpen(false);
        setConnectionFromId("");
        setBlockMenuOpen(false);
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
    const restoredNumericFields = profileColumns(snapshot.rows, snapshot.headers).filter((profile) => profile.type === "number" && profile.unique > 1).map((profile) => profile.name);
    const defaultOlsTarget = restoredNumericFields.at(-1) ?? "";
    const defaultOlsPredictors = restoredNumericFields.filter((field) => field !== defaultOlsTarget).slice(0, 2);
    setProjectName(snapshot.projectName?.trim() || "Model wzrostu sprzedaży");
    setModelName(snapshot.modelName?.trim() || "Model wzrostu");
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
    setSelectedEdgeId("");
    setConnectionFromId("");
    setBlockMenuOpen(false);
    setLastModelAction(null);
    setView(snapshot.view === "compare" ? "model" : snapshot.view);
    setModelMode(snapshot.view === "compare" ? "simulate" : snapshot.modelMode ?? "build");
    setZoom(snapshot.zoom);
    setCanvasPan(snapshot.canvasPan);
    const restoredWhatIf = (snapshot.whatIfScenarios ?? []).map((item) => ({
      ...item,
      responseMode: item.responseMode ?? "auto",
      estimateOutputs: item.estimateOutputs ?? true,
      econometricModel: item.econometricModel ?? "auto",
      econometricMaxLag: item.econometricMaxLag ?? 12,
    }));
    setWhatIfScenarios(restoredWhatIf);
    setActiveWhatIfId(snapshot.activeWhatIfId ?? restoredWhatIf[0]?.id ?? "");
    setDependencyRules(snapshot.dependencyRules ?? []);
    setModelParameters(snapshot.modelParameters ?? []);
    setModelMemory(snapshot.modelMemory ?? []);
    setOlsSpecification(snapshot.olsSpecification ?? { targetField: defaultOlsTarget, predictorFields: defaultOlsPredictors, includeIntercept: true, justification: "" });
    setOlsScenario(snapshot.olsScenario ?? { predictorField: defaultOlsPredictors[0] ?? "", operation: "percent", value: 10 });
    setVerificationPreferences({
      ...DEFAULT_VERIFICATION_PREFERENCES,
      ...snapshot.verificationPreferences,
      visibleAreas: snapshot.verificationPreferences?.visibleAreas ?? [...DEFAULT_VERIFICATION_PREFERENCES.visibleAreas],
      visibleSeverities: snapshot.verificationPreferences?.visibleSeverities ?? [...DEFAULT_VERIFICATION_PREFERENCES.visibleSeverities],
      customItems: snapshot.verificationPreferences?.customItems ?? [],
    });
    setDiagnosticPreferences({
      ...DEFAULT_DIAGNOSTIC_PREFERENCES,
      ...snapshot.diagnosticPreferences,
      visibleSections: snapshot.diagnosticPreferences?.visibleSections ?? [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSections],
      summaryMetrics: snapshot.diagnosticPreferences?.summaryMetrics ?? [...DEFAULT_DIAGNOSTIC_PREFERENCES.summaryMetrics],
      visibleSeverities: snapshot.diagnosticPreferences?.visibleSeverities ?? [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSeverities],
      monitoredFields: snapshot.diagnosticPreferences?.monitoredFields ?? [],
    });
    setWorkspaceActive(true);
    setHomeOpen(false);
    setToast(restoredNodes !== snapshot.nodes
      ? label("Przywrócono sesję i uporządkowano model", "Session restored and model arranged")
      : label("Przywrócono ostatnią sesję", "Last session restored"));
  };

  const resumeWorkspace = async () => {
    try {
      const saved = await loadWorkspace();
      if (saved?.version === 2 || saved?.version === 3 || saved?.version === 4 || saved?.version === 5 || saved?.version === 6 || saved?.version === 7 || saved?.version === 8 || saved?.version === 9) {
        applyWorkspaceSnapshot(saved);
        return;
      }

      const legacyRaw = localStorage.getItem(LEGACY_WORKSPACE_KEY);
      if (!legacyRaw || !isMeaningfulLegacyWorkspace(legacyRaw)) {
        setHasSavedWorkspace(false);
        setToast(label("Nie znaleziono zapisanej sesji", "No saved session found"));
        return;
      }
      const legacy = JSON.parse(legacyRaw) as Partial<WorkspaceSnapshot>;
      const legacyRows = parsedSample.rows;
      const legacyHeaders = parsedSample.headers;
      applyWorkspaceSnapshot({
        version: 9,
        projectName: legacy.projectName ?? "Model wzrostu sprzedaży",
        modelName: legacy.modelName ?? "Model wzrostu",
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
        whatIfScenarios: [],
        activeWhatIfId: "",
        dependencyRules: [],
        modelParameters: [],
        modelMemory: [],
        olsSpecification: EMPTY_OLS_SPECIFICATION,
        olsScenario: EMPTY_OLS_SCENARIO,
        verificationPreferences: { ...DEFAULT_VERIFICATION_PREFERENCES, visibleAreas: [...DEFAULT_VERIFICATION_PREFERENCES.visibleAreas], visibleSeverities: [...DEFAULT_VERIFICATION_PREFERENCES.visibleSeverities], customItems: [] },
        diagnosticPreferences: { ...DEFAULT_DIAGNOSTIC_PREFERENCES, visibleSections: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSections], summaryMetrics: [...DEFAULT_DIAGNOSTIC_PREFERENCES.summaryMetrics], visibleSeverities: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSeverities], monitoredFields: [] },
      });
    } catch {
      setToast(label("Nie udało się przywrócić zapisanej sesji", "The saved session could not be restored"));
    }
  };

  const startEmptyWorkspace = () => {
    setProjectName("Nowy projekt");
    setModelName("Model analizy danych");
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
    setWhatIfScenarios([]);
    setActiveWhatIfId("");
    setDependencyRules([]);
    setModelParameters([]);
    setModelMemory([]);
    setOlsSpecification(EMPTY_OLS_SPECIFICATION);
    setOlsScenario(EMPTY_OLS_SCENARIO);
    setVerificationPreferences({ ...DEFAULT_VERIFICATION_PREFERENCES, visibleAreas: [...DEFAULT_VERIFICATION_PREFERENCES.visibleAreas], visibleSeverities: [...DEFAULT_VERIFICATION_PREFERENCES.visibleSeverities], customItems: [] });
    setDiagnosticPreferences({ ...DEFAULT_DIAGNOSTIC_PREFERENCES, visibleSections: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSections], summaryMetrics: [...DEFAULT_DIAGNOSTIC_PREFERENCES.summaryMetrics], visibleSeverities: [...DEFAULT_DIAGNOSTIC_PREFERENCES.visibleSeverities], monitoredFields: [] });
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setConnectionFromId("");
    setBlockMenuOpen(false);
    setLastModelAction(null);
    setView("model");
    setModelMode("build");
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
      const numericFields = importedProfiles.filter((profile) => profile.type === "number").map((profile) => profile.name);
      const varyingNumericFields = importedProfiles.filter((profile) => profile.type === "number" && profile.unique > 1).map((profile) => profile.name);
      const whatIfInput = varyingNumericFields[0] ?? numericFields[0] ?? "";
      const olsTarget = varyingNumericFields.at(-1) ?? numericFields.at(-1) ?? "";
      const olsPredictors = varyingNumericFields.filter((field) => field !== olsTarget).slice(0, 2);
      const nextWhatIf: WhatIfScenario = {
        id: `what-if-${Date.now()}`,
        name: "Scenariusz 1",
        inputField: whatIfInput,
        operation: "percent",
        value: 10,
        scope: { kind: "all" },
        outputFields: [],
        estimateOutputs: true,
        responseMode: "auto",
        econometricModel: "auto",
        econometricMaxLag: 12,
      };
      setWhatIfScenarios(numericFields.length ? [nextWhatIf] : []);
      setActiveWhatIfId(numericFields.length ? nextWhatIf.id : "");
      setDependencyRules([]);
      setOlsSpecification({ targetField: olsTarget, predictorFields: olsPredictors, includeIntercept: true, justification: "" });
      setOlsScenario({ predictorField: olsPredictors[0] ?? "", operation: "percent", value: 10 });
      const defaultTemplate = templates.find((template) => template.id === defaultTemplateId);
      if (defaultTemplate) {
        const applied = applyTemplateToDataset(defaultTemplate, importedColumns, imported.meta.id);
        setCharts(applied.charts);
        setDashboardGrid(defaultTemplate.grid);
        if (applied.missing.length) setToast(`${label("Wczytano dane. Uzupełnij pola:", "Data loaded. Complete these fields:")} ${applied.missing.join(", ")}`);
      } else {
        const nextCharts = suggestedCharts(importedProfiles, imported.meta.id);
        setCharts(nextCharts);
        setDashboardGrid(nextCharts.length > 1 ? 4 : 1);
      }
      if (importingFromHome) {
        const importedModel = createImportedModel(file.name, imported.meta.totalRows, importedProfiles);
        setNodes(importedModel.nodes);
        setEdges(importedModel.edges);
        const baseName = file.name.replace(/\.[^.]+$/, "");
        setProjectName(`Analiza ${baseName}`);
        setModelName("Model danych");
        setScenarios(initialScenarios);
        setScenarioId("baseline");
      } else {
        setNodes((current) => {
          const source = current.find((node) => node.id === "source");
          if (!source) return [{ id: "source", kind: "source", title: file.name, subtitle: `${imported.meta.totalRows} wierszy · ${imported.meta.headers.length} kolumn`, x: 120, y: 190 }];
          return current.map((node) => node.id === "source"
            ? { ...node, title: file.name, subtitle: `${imported.meta.totalRows} wierszy · ${imported.meta.headers.length} kolumn` }
            : node);
        });
      }
      setSelectedNodeId("source");
      setSelectedEdgeId("");
      setConnectionFromId("");
      setWorkspaceActive(true);
      setToast(imported.warnings.at(-1) ?? `${label("Wczytano", "Loaded")} ${imported.meta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} ${label("rekordów", "records")}${imported.meta.sampled ? label(" · wykresy używają próbki", " · charts use a sample") : ""}`);
      setView("charts");
      setHomeOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setToast(label("Import anulowany", "Import cancelled"));
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
        if (error instanceof DOMException && error.name === "AbortError") setToast(label("Import anulowany", "Import cancelled"));
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
      config: kind === "decision" ? {
        field: profiles.find((profile) => profile.type === "number" && profile.unique > 1)?.name,
        timeField: profiles.find((profile) => profile.type === "date")?.name,
        thresholdMode: "percentile",
        percentile: 90,
        direction: "above",
        severity: "warning",
      } : kind === "transform" ? {
        field: modelNumericFields[0], transformOperation: "formula", formula: modelNumericFields[0] ? `[${modelNumericFields[0]}]` : "", outputField: modelNumericFields[0] ? `${modelNumericFields[0]}_model` : "Wynik_formuly",
      } : kind === "metric" ? {
        field: modelNumericFields[0], calculation: "average",
      } : kind === "result" && anchor?.kind !== "metric" && anchor?.kind !== "decision" ? {
        field: modelNumericFields[0], calculation: "average",
      } : undefined,
      ...position,
    };
    setNodes((current) => [...current, next]);
    if (anchor) {
      const plan = resolveModelConnection(anchor.id, id, [...nodes, next], edges);
      if (plan.ok) setEdges((current) => [...current, { id: `edge-${Date.now()}`, from: plan.from, to: plan.to }]);
    }
    setSelectedNodeId(id);
    setSelectedEdgeId("");
    setConnectionFromId("");
    setBlockMenuOpen(false);
    setShowInspector(true);
    setWorkspaceActive(true);
    setToast(`${kindLabel(kind)} ${label("dodana do modelu", "added to the model")}`);
  };

  const buildFormulaExample = () => {
    const numeric = profiles.filter((profile) => profile.type === "number" && profile.unique > 1);
    if (!numeric.length) { setToast(label("Plik nie zawiera zmiennej kolumny liczbowej", "The file does not contain a variable numeric field")); return; }
    const first = numeric[0].name;
    const second = numeric[1]?.name;
    const source = nodes.find((node) => node.kind === "source") ?? { id: "source", kind: "source" as const, title: datasetName, subtitle: `${datasetMeta.totalRows} wierszy · ${headers.length} kolumn`, x: 80, y: 210 };
    const suffix = Date.now();
    const transform: ModelNode = { id: `transform-${suffix}`, kind: "transform", title: second ? `Różnica ${first} − ${second}` : `Zmiana ${first}`, subtitle: second ? `[${first}] - [${second}]` : `[${first}] * 1.1`, x: 330, y: 210, config: { transformOperation: "formula", formula: second ? `[${first}] - [${second}]` : `[${first}] * 1.1`, outputField: "Wynik_formuly" } };
    const metric: ModelNode = { id: `metric-${suffix}`, kind: "metric", title: "Średni wynik formuły", subtitle: "Średnia · Wynik_formuly", x: 580, y: 210, config: { field: "Wynik_formuly", calculation: "average" } };
    const result: ModelNode = { id: `result-${suffix}`, kind: "result", title: "Podsumowanie modelu", subtitle: "Wynik końcowy", x: 830, y: 210 };
    setNodes([source, transform, metric, result]);
    setEdges([
      { id: `edge-source-${suffix}`, from: source.id, to: transform.id },
      { id: `edge-transform-${suffix}`, from: transform.id, to: metric.id },
      { id: `edge-metric-${suffix}`, from: metric.id, to: result.id },
    ]);
    setSelectedNodeId(transform.id);
    setShowInspector(true);
    setBottomPanelMode("normal");
    setToast(label("Zbudowano przykładowy model z danych", "A sample model was built from the data"));
  };

  const connectModelNodes = (fromId: string, toId: string) => {
    const plan = resolveModelConnection(fromId, toId, nodes, edges);
    if (!plan.ok) {
      setToast(plan.reason);
      return false;
    }
    const edge: ModelEdge = { id: `edge-${Date.now()}`, from: plan.from, to: plan.to };
    setEdges((current) => [...current, edge]);
    setSelectedNodeId(plan.to);
    setSelectedEdgeId("");
    setConnectionFromId("");
    setConnectionTargetId("");
    setWorkspaceActive(true);
    setToast(label("Relacja dodana · zmiana może płynąć do kolejnego bloku", "Relationship added · the change can flow to the next block"));
    return true;
  };

  const startConnection = (nodeId = selectedNode?.id ?? "") => {
    if (!nodeId) {
      setToast(label("Najpierw wybierz blok początkowy relacji", "Select the relationship's starting block first"));
      return;
    }
    setConnectionFromId(nodeId);
    setSelectedEdgeId("");
    setBlockMenuOpen(false);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    setToast(`${label("Łączenie od", "Connecting from")} „${node?.title ?? label("wybranego bloku", "selected block")}” · ${label("kliknij blok docelowy", "click the target block")}`);
  };

  const removeEdgeById = (edgeId: string) => {
    const edge = edges.find((candidate) => candidate.id === edgeId);
    if (!edge) return;
    setLastModelAction({ kind: "edge", edge });
    setEdges((current) => current.filter((candidate) => candidate.id !== edgeId));
    setSelectedEdgeId("");
    setToast(label("Relacja usunięta · Ctrl+Z przywraca", "Relationship removed · Ctrl+Z restores it"));
  };

  const removeNodeById = (nodeId: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const connectedEdges = edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    const neighbourId = connectedEdges.map((edge) => edge.from === nodeId ? edge.to : edge.from).find((id) => id !== nodeId);
    setLastModelAction({ kind: "node", node, edges: connectedEdges });
    setNodes((current) => current.filter((candidate) => candidate.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.from !== nodeId && edge.to !== nodeId));
    setSelectedNodeId(neighbourId ?? nodes.find((candidate) => candidate.id !== nodeId)?.id ?? "");
    setSelectedEdgeId("");
    setConnectionFromId((current) => current === nodeId ? "" : current);
    setToast(`${node.kind === "source" ? label("Źródło", "Source") : label("Blok", "Block")} ${label("usunięte · Ctrl+Z przywraca", "removed · Ctrl+Z restores it")}`);
  };

  const removeSelectedNode = () => {
    if (selectedNode) removeNodeById(selectedNode.id);
  };

  const restoreLastModelAction = () => {
    if (!lastModelAction) return;
    if (lastModelAction.kind === "edge") {
      setEdges((current) => current.some((edge) => edge.id === lastModelAction.edge.id) ? current : [...current, lastModelAction.edge]);
      setSelectedNodeId("");
      setSelectedEdgeId(lastModelAction.edge.id);
      setToast(label("Przywrócono relację", "Relationship restored"));
    } else {
      setNodes((current) => current.some((node) => node.id === lastModelAction.node.id) ? current : [...current, lastModelAction.node]);
      setEdges((current) => [...current, ...lastModelAction.edges.filter((edge) => !current.some((candidate) => candidate.id === edge.id))]);
      setSelectedNodeId(lastModelAction.node.id);
      setSelectedEdgeId("");
      setToast(label("Przywrócono blok i jego relacje", "Block and its relationships restored"));
    }
    setLastModelAction(null);
  };

  const duplicateSelectedNode = () => {
    if (!selectedNode) return;
    const id = `${selectedNode.kind}-${Date.now()}`;
    const position = findVacantNodePosition(nodes, selectedNode, preferences.snapToGrid);
    const copy: ModelNode = {
      ...selectedNode,
      id,
      title: `${selectedNode.title} — kopia`,
      config: selectedNode.config ? { ...selectedNode.config } : undefined,
      ...position,
    };
    setNodes((current) => [...current, copy]);
    setSelectedNodeId(id);
    setSelectedEdgeId("");
    setShowInspector(true);
    setWorkspaceActive(true);
    setToast(label("Utworzono niezależną kopię bloku", "An independent copy of the block was created"));
  };

  const reverseSelectedEdge = () => {
    if (!selectedEdge) return;
    const plan = reverseModelConnection(selectedEdge, nodes, edges);
    if (!plan.ok) {
      setToast(plan.reason);
      return;
    }
    setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, from: plan.from, to: plan.to } : edge));
    setToast(label("Odwrócono kierunek relacji", "Relationship direction reversed"));
  };

  useEffect(() => {
    const handleModelShortcut = (event: KeyboardEvent) => {
      if (view !== "model" || modelMode !== "build") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (!lastModelAction) return;
        event.preventDefault();
        restoreLastModelAction();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedEdge && !selectedNode) return;
        event.preventDefault();
        if (selectedEdge) removeEdgeById(selectedEdge.id);
        else if (selectedNode) removeNodeById(selectedNode.id);
      }
    };
    window.addEventListener("keydown", handleModelShortcut);
    return () => window.removeEventListener("keydown", handleModelShortcut);
  }, [view, modelMode, lastModelAction, selectedEdge, selectedNode, nodes, edges]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: ModelNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (connectionFromId) {
      connectModelNodes(connectionFromId, node.id);
      return;
    }
    if (event.shiftKey && selectedNodeId && selectedNodeId !== node.id) {
      connectModelNodes(selectedNodeId, node.id);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedEdgeId("");
    setSelectedNodeId(node.id);
    setDrag({ id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y });
  };

  const handleNodePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    setNodes((current) => current.map((node) => node.id === drag.id
      ? { ...node, x: preferences.snapToGrid ? snapModelCoordinate(Math.max(10, drag.x + dx)) : Math.max(10, drag.x + dx), y: preferences.snapToGrid ? snapModelCoordinate(Math.max(10, drag.y + dy)) : Math.max(10, drag.y + dy) }
      : node));
  };

  const stopNodeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".model-node, .edge-wrap, .canvas-controls, .mini-map, .model-builder-guide, .model-selection-toolbar, .model-connection-banner, .model-block-menu")) return;
    setSelectedNodeId("");
    setSelectedEdgeId("");
    setShowInspector(false);
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
    setToast(label("Model został czytelnie uporządkowany", "Model arranged for readability"));
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
    setToast(label("Utworzono wariant scenariusza", "Scenario variant created"));
  };

  const changeSelectedTitle = (title: string) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, title } : node));
  };

  const updateSelectedConfig = (patch: Partial<ModelNodeConfig>) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNode.id) return node;
      const config = { ...node.config, ...patch };
      const calculationLabels: Record<NonNullable<ModelNodeConfig["calculation"]>, string> = { average: "Średnia", sum: "Suma", minimum: "Minimum", maximum: "Maksimum", last: "Ostatnia wartość", count: "Liczba wartości", violations: "Przekroczone próbki", events: "Zdarzenia" };
      const transformLabels = { none: "Bez zmiany", add: "Dodaj", multiply: "Pomnóż", percent: "Zmień procentowo", formula: "Formuła" } as const;
      const subtitle = node.kind === "decision" && config.field ? `${config.field} · ${config.thresholdMode === "manual" ? "próg ręczny" : `P${config.percentile ?? 90}`}`
        : (node.kind === "metric" || node.kind === "result") && (config.field || config.sourceRuleId) ? `${calculationLabels[config.calculation ?? "average"]} · ${config.field ?? "wybrana reguła"}`
          : node.kind === "transform" && config.field ? `${transformLabels[config.transformOperation ?? "none"]} · ${config.field}`
            : node.subtitle;
      return { ...node, subtitle, config };
    }));
  };

  const addSelectedConnection = () => {
    if (!selectedNode || !connectionTargetId || connectionTargetId === selectedNode.id) return;
    connectModelNodes(selectedNode.id, connectionTargetId);
  };

  const runModel = () => {
    setBottomTab("results");
    setBottomPanelMode("normal");
    if (scenarioModelAvailable) {
      setToast(preferences.language === "en" ? "Model recalculated" : "Model przeliczony");
      return;
    }
    const result = executeDataModel(nodes, edges, modelRows, profiles.map(({ name, type }) => ({ name, type })), modelParameters, preferences.language);
    setModelExecution(result);
    setToast(result.ready
      ? `${label("Model przeliczony", "Model recalculated")} · ${result.outputs.length} ${label("wyników", "results")} · ${result.rules.reduce((sum, rule) => sum + rule.eventCount, 0)} ${label("alertów", "alerts")}`
      : result.issues[0] ?? label("Model wymaga konfiguracji", "The model requires configuration"));
  };

  const focusModelIssue = (issue: string) => {
    const node = nodes.find((candidate) => issue.includes(`„${candidate.title}”`));
    if (node) {
      setSelectedNodeId(node.id);
      setShowInspector(true);
    }
  };

  const commands = [
    { label: label("Otwórz budowę modelu", "Open model builder"), detail: label("Widok grafu", "Graph view"), action: () => { setView("model"); setModelMode("build"); } },
    { label: label("Otwórz pracownię regresji OLS", "Open OLS regression studio"), detail: label("Równanie, współczynniki i uzasadnienie", "Equation, coefficients and rationale"), action: () => { setView("model"); setModelMode("ols"); setShowInspector(false); } },
    { label: label("Otwórz dane", "Open data"), detail: datasetName, action: () => setView("data") },
    { label: label("Otwórz kreator wykresów", "Open chart builder"), detail: label(`${charts.length} na pulpicie`, `${charts.length} on dashboard`), action: () => setView("charts") },
    { label: label("Otwórz diagnostykę", "Open diagnostics"), detail: datasetName, action: () => setView("paths") },
    { label: label("Otwórz symulację Co-jeśli", "Open What-if simulation"), detail: label("Wariant przez cały model", "Variant through the whole model"), action: () => { setView("model"); setModelMode("simulate"); } },
    { label: label("Utwórz nowy wariant", "Create new variant"), detail: label("Kopia aktywnego", "Copy of active variant"), action: createScenario },
    { label: showExplorer ? label("Ukryj eksplorator", "Hide explorer") : label("Pokaż eksplorator", "Show explorer"), detail: "Ctrl+B", action: () => setShowExplorer((visible) => !visible) },
    { label: bottomPanelMode === "collapsed" ? label("Pokaż panel wyników", "Show results panel") : label("Ukryj panel wyników", "Hide results panel"), detail: "Ctrl+J", action: () => setBottomPanelMode((mode) => mode === "collapsed" ? "normal" : "collapsed") },
    { label: label("Otwórz ustawienia", "Open settings"), detail: label("Układ przestrzeni roboczej", "Workspace layout"), action: () => setSettingsOpen(true) },
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
    const fromTitle = from.title;
    const toTitle = to.title;
    return (
      <button
        key={edge.id}
        type="button"
        className={`edge-wrap ${selectedEdgeId === edge.id ? "selected" : ""}`}
        style={{ left: x1, top: y1 - 9, width: length, transform: `rotate(${angle}deg)` }}
        aria-label={`Relacja: ${fromTitle} do ${toTitle}`}
        title={`${fromTitle} → ${toTitle} · kliknij, aby zaznaczyć`}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onClick={(event) => { event.stopPropagation(); setSelectedNodeId(""); setSelectedEdgeId(edge.id); setConnectionFromId(""); setShowInspector(false); }}
      >
        <span className="edge-line" />
        {edge.label && <span className="edge-label" style={{ transform: `rotate(${-angle}deg)` }}>{edge.label}</span>}
      </button>
    );
  };

  const renderModel = () => (
    <div className={`canvas-shell ${panDrag ? "panning" : ""} ${connectionFromId ? "connecting" : ""}`} ref={canvasRef} onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerUp={stopCanvasDrag} onPointerCancel={stopCanvasDrag}>
      <div className="canvas-dots" />
      {connectionFromId && <div className="model-connection-banner"><span>⌁</span><div><strong>{label("Wybierz blok docelowy", "Choose a target block")}</strong><small>{label("Łączenie od", "Connecting from")} „{nodes.find((node) => node.id === connectionFromId)?.title}”</small></div><button onClick={() => setConnectionFromId("")}>{label("Anuluj", "Cancel")}</button></div>}
      {selectedNode && !connectionFromId && <div className="model-selection-toolbar"><div><span className={`node-${selectedNode.kind}`}>{kindMeta[selectedNode.kind].icon}</span><strong>{selectedNode.title}</strong></div><button onClick={() => setShowInspector(true)}>{label("Edytuj", "Edit")}</button><button onClick={() => startConnection()}>⌁ {label("Połącz", "Connect")}</button><button onClick={duplicateSelectedNode}>{label("Duplikuj", "Duplicate")}</button><button className="danger" onClick={removeSelectedNode}>{label("Usuń", "Delete")}</button></div>}
      {selectedEdge && <div className="model-selection-toolbar edge-selection"><div><span>⌁</span><strong>{nodes.find((node) => node.id === selectedEdge.from)?.title} → {nodes.find((node) => node.id === selectedEdge.to)?.title}</strong></div><button onClick={reverseSelectedEdge}>{label("Odwróć", "Reverse")}</button><button className="danger" onClick={() => removeEdgeById(selectedEdge.id)}>{label("Usuń relację", "Delete relation")}</button></div>}
      <div className="canvas-stage" style={{ width: Math.max(1120, getGraphBounds(nodes).maxX + 100), height: Math.max(600, getGraphBounds(nodes).maxY + 100), transform: `translate3d(${canvasPan.x}px, ${canvasPan.y}px, 0) scale(${zoom})` }}>
        {edges.map(renderEdge)}
        {nodes.map((node) => (
          <button
            key={node.id}
            className={`model-node node-${node.kind} ${selectedNodeId === node.id ? "selected" : ""} ${drag?.id === node.id ? "dragging" : ""}`}
            style={{ left: node.x, top: node.y }}
            onPointerDown={(event) => handlePointerDown(event, node)}
            onPointerMove={handleNodePointerMove}
            onPointerUp={stopNodeDrag}
            onPointerCancel={stopNodeDrag}
            onClick={() => { if (!connectionFromId) { setSelectedNodeId(node.id); setSelectedEdgeId(""); setShowInspector(true); } }}
            onDoubleClick={() => { setSelectedNodeId(node.id); setShowInspector(true); }}
            title={label("Przeciągnij, aby przenieść · kliknij, aby edytować", "Drag to move · click to edit")}
            aria-label={`${kindLabel(node.kind)}: ${node.title}`}
          >
            <span className="node-icon">{kindMeta[node.kind].icon}</span>
            <span className="node-copy"><strong>{node.title}</strong><small>{node.subtitle}</small></span>
            <span className="node-port port-left" />
            <span className="node-port port-right" />
          </button>
        ))}
      </div>
      {!nodes.length && <div className="empty-workspace-state"><span>▦</span><strong>{label("Pusty projekt", "Empty project")}</strong><p>{label("Wczytaj plik danych, aby utworzyć źródło, model i pierwsze wykresy.", "Load a data file to create a source, model and first charts.")}</p><button className="primary-button" onClick={() => chartFileRef.current?.click()}>{label("Wczytaj plik danych", "Load data file")}</button></div>}
      {hasDataset && nodes.length > 0 && nodes.length <= 2 && <div className="model-builder-guide"><div><span>{label("START MODELU", "MODEL START")}</span><strong>{label("Zbuduj pierwszy model na aktualnych danych", "Build your first model from the current data")}</strong><small>{label("Utworzymy formułę z dwóch zmiennych, policzymy jej średnią i pokażemy wynik. Każdy krok możesz później zmienić.", "We will create a formula from two variables, calculate its average and show the result. You can edit every step later.")}</small></div><button onClick={buildFormulaExample}>⚡ {label("Zbuduj przykład z danych", "Build an example from data")}</button><i>{label("albo dodawaj bloki po lewej: Transformacja → Metryka → Wynik", "or add blocks on the left: Transformation → Metric → Result")}</i></div>}
      <div className="canvas-controls">
        <button onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} aria-label={label("Powiększ", "Zoom in")}>+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label={label("Pomniejsz", "Zoom out")}>−</button>
        <button className="fit-button" onClick={fitModel} aria-label={label("Dopasuj model", "Fit model")} title={label("Dopasuj model do ekranu", "Fit model to screen")}>⌗</button>
        <button className="undo-button" disabled={!lastModelAction} onClick={restoreLastModelAction} aria-label={label("Cofnij usunięcie", "Undo deletion")} title={label("Cofnij usunięcie (Ctrl+Z)", "Undo deletion (Ctrl+Z)")}>↶</button>
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
          <p>{hasDataset
            ? `${datasetMeta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} ${label("wierszy", "rows")} · ${headers.length} ${label("kolumn", "fields")}${datasetMeta.layout === "long-pivoted" ? ` · ${label("automatycznie ułożono", "automatically arranged")} ${datasetMeta.sourceRows?.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL") ?? ""} ${label("rekordów Tag/Value", "Tag/Value records")}` : datasetMeta.layout === "transposed" ? label(" · automatycznie odwrócono tabelę tagów", " · tag table transposed automatically") : ""} · ${label("dane przetwarzane lokalnie", "data processed locally")}`
            : label("Wczytaj plik, aby zobaczyć podgląd i jakość danych.", "Load a file to preview the data and its quality.")}</p>
        </div>
        <div className="view-heading-actions">
          <button className="secondary-button" disabled={!hasDataset} onClick={() => setView("charts")}>{label("Twórz wykresy", "Create charts")}</button>
          <label className="primary-button file-button">
            {label("Wczytaj plik danych", "Load data file")}
            <input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} />
          </label>
        </div>
      </div>
      {fileError && <div className="error-banner">{fileError}</div>}
      {!hasDataset ? <div className="empty-data-state"><span>▦</span><strong>{label("Tu pojawią się Twoje dane", "Your data will appear here")}</strong><p>{label("Aplikacja nie ładuje już żadnych przykładowych rekordów. Wybierz własny plik, aby rozpocząć.", "The app does not load sample records. Choose your own file to begin.")}</p><label className="primary-button file-button">{label("Wczytaj plik danych", "Load data file")}<input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} /></label></div> : <>
      <div className="quality-grid">
        <article><span>{label("Kompletność", "Completeness")}</span><strong>{Math.round((profiles.reduce((sum, item) => sum + item.filled, 0) / Math.max(1, rows.length * headers.length)) * 100)}%</strong><small>{label("uzupełnionych pól", "fields completed")}</small></article>
        <article><span>{label("Kolumny liczbowe", "Numeric fields")}</span><strong>{profiles.filter((item) => item.type === "number").length}</strong><small>{label("gotowe do obliczeń", "ready for calculations")}</small></article>
        <article><span>{label("Problemy krytyczne", "Critical issues")}</span><strong className="good">0</strong><small>{label("model można uruchomić", "model can run")}</small></article>
      </div>
      <div className="data-table-card">
        <div className="table-title"><strong>{label("Podgląd danych", "Data preview")}</strong><span>{label("Pierwsze", "First")} {Math.min(rows.length, 8)} {label("wierszy", "rows")}</span></div>
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
    <div className="data-required-view"><span>▦</span><strong>{title}</strong><p>{description}</p><button className="primary-button" onClick={() => chartFileRef.current?.click()}>{label("Wczytaj plik danych", "Load data file")}</button></div>
  );

  const renderPaths = () => {
    const fields = [...new Set(charts.flatMap((chart) => [chart.xField, ...chart.yFields, chart.seriesField].filter((field): field is string => Boolean(field))))];
    const filterCount = charts.reduce((sum, chart) => sum + chart.filters.length, 0);
    const modelSteps = nodes.filter((node) => node.kind !== "source");
    return (
      <div className="paths-view lineage-view">
        <div className="view-heading compact-heading">
          <div><span className="eyebrow">DATA FLOW</span><h2>{label("Przepływ aktualnych danych", "Current data flow")}</h2><p>{label("Każdy element poniżej pochodzi z wczytanego pliku i bieżącej konfiguracji.", "Every item below comes from the loaded file and current configuration.")}</p></div>
          <div className="lineage-health"><i /> {datasetMeta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} {label("rekordów", "records")} · {headers.length} {label("kolumn", "fields")}</div>
        </div>
        <div className="lineage-flow">
          <article className="lineage-card source"><span>01 · {label("ŹRÓDŁO", "SOURCE")}</span><strong>{datasetName}</strong><p>{datasetMeta.format.toUpperCase()} · {formatBytes(datasetMeta.fileSize)} · {label("dane lokalne", "local data")}</p><div>{headers.slice(0, 5).map((header) => <small key={header}>{header}</small>)}{headers.length > 5 && <small>+{headers.length - 5}</small>}</div></article>
          <div className="lineage-arrow">→</div>
          <article className="lineage-card process"><span>02 · {label("OPERACJE", "OPERATIONS")}</span><strong>{modelSteps.length + filterCount + charts.length} {label("aktywnych kroków", "active steps")}</strong><p>{filterCount ? `${filterCount} ${label("filtrów", "filters")}` : label("Bez filtrów", "No filters")} · {modelSteps.length ? `${modelSteps.length} ${label("bloków modelu", "model blocks")}` : label("bez dodatkowego modelu", "no additional model")}</p><div>{[...new Set(charts.map((chart) => chart.aggregation))].map((aggregation) => <small key={aggregation}>{aggregation}</small>)}{fields.slice(0, 3).map((field) => <small key={field}>{field}</small>)}</div></article>
          <div className="lineage-arrow">→</div>
          <article className="lineage-card output"><span>03 · {label("WYNIKI", "RESULTS")}</span><strong>{charts.length} {label(charts.length === 1 ? "wykres" : "wykresy", charts.length === 1 ? "chart" : "charts")}</strong><p>{fields.length} {label("używanych pól", "fields used")} · {label("pulpit", "dashboard")} {dashboardGrid}</p><div>{charts.slice(0, 4).map((chart) => <button key={chart.id} onClick={() => setView("charts")}>{chart.title}</button>)}{charts.length === 0 && <small>{label("Dodaj wykres, aby utworzyć wynik", "Add a chart to create a result")}</small>}</div></article>
        </div>
        <div className="lineage-details">
          <div><span>{label("Używane kolumny", "Fields used")}</span><strong>{fields.length}</strong><p>{fields.length ? fields.join(" · ") : label("Żaden wykres nie korzysta jeszcze z kolumn pliku.", "No chart uses file fields yet.")}</p></div>
          <div><span>{label("Relacje modelu", "Model relationships")}</span><strong>{edges.length}</strong><p>{edges.length ? label("Połączenia pochodzą z aktualnego grafu modelu.", "Connections come from the current model graph.") : label("Brak zdefiniowanych relacji — dane płyną bezpośrednio do wykresów.", "No relationships are defined — data flows directly to charts.")}</p></div>
          <div><span>{label("Przechowywanie", "Storage")}</span><strong>{label("Lokalne", "Local")}</strong><p>{label("Plik oraz obliczenia pozostają na tym komputerze.", "The file and calculations stay on this computer.")}</p></div>
        </div>
      </div>
    );
  };

  const renderCompare = () => {
    const numeric = profiles.filter((profile) => profile.type === "number");
    const groupable = profiles.filter((profile) => profile.unique > 1);
    const leftField = numeric.some((profile) => profile.name === comparisonLeftField) ? comparisonLeftField : numeric[0]?.name ?? "";
    const rightField = numeric.some((profile) => profile.name === comparisonRightField && profile.name !== leftField) ? comparisonRightField : numeric.find((profile) => profile.name !== leftField)?.name ?? "";
    const metricField = numeric.some((profile) => profile.name === comparisonMetricField) ? comparisonMetricField : numeric[0]?.name ?? "";
    const groupingProfiles = groupable.filter((profile) => profile.name !== metricField);
    const groupField = groupingProfiles.some((profile) => profile.name === comparisonGroupField) ? comparisonGroupField : groupingProfiles[0]?.name ?? "";
    const groupValues = groupField ? getGroupValues(rows, groupField) : [];
    const leftGroup = groupValues.includes(comparisonLeftGroup) ? comparisonLeftGroup : groupValues[0] ?? "";
    const rightGroup = groupValues.includes(comparisonRightGroup) && comparisonRightGroup !== leftGroup ? comparisonRightGroup : groupValues.find((value) => value !== leftGroup) ?? "";
    const canCompare = comparisonMode === "columns" ? Boolean(leftField && rightField) : Boolean(metricField && groupField && leftGroup && rightGroup);
    const result = canCompare
      ? comparisonMode === "columns"
        ? compareColumns(rows, leftField, rightField, comparisonAggregation)
        : compareGroups(rows, metricField, groupField, leftGroup, rightGroup, comparisonAggregation)
      : null;
    const max = result ? Math.max(Math.abs(result.leftValue), Math.abs(result.rightValue), 1) : 1;
    const locale = preferences.language === "en" ? "en-US" : "pl-PL";
    const formatValue = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    const aggregationLabels: Record<Aggregation, string> = { sum: label("Suma", "Sum"), average: label("Średnia", "Average"), min: "Minimum", max: "Maximum", count: label("Liczba rekordów", "Record count") };
    const exportComparison = () => {
      if (!result) return;
      const csv = [
        ["źródło", datasetName],
        ["obliczenie", aggregationLabels[comparisonAggregation]],
        ["wariant", result.leftLabel, result.rightLabel, "różnica", "różnica_procent"],
        ["wartość", result.leftValue, result.rightValue, result.difference, result.percent?.toFixed(2) ?? ""],
      ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      downloadTextFile(`eyes-of-odin-${datasetId}-porownanie.csv`, `\uFEFF${csv}`);
      setToast(label("Pobrano porównanie aktualnych danych", "Current-data comparison downloaded"));
    };
    return (
      <div className="compare-view data-compare-view">
        <div className="view-heading compact-heading"><div><span className="eyebrow">COMPARE</span><h2>{label("Porównaj wartości z pliku", "Compare values from the file")}</h2><p>{label("Wybierz kolumny albo grupy — wynik przelicza się natychmiast.", "Choose fields or groups — the result recalculates immediately.")}</p></div><button className="secondary-button" disabled={!result} onClick={exportComparison}>{label("Eksportuj raport", "Export report")}</button></div>
        <section className="compare-config">
          <div className="compare-mode-tabs"><button className={comparisonMode === "columns" ? "active" : ""} disabled={numeric.length < 2} onClick={() => setComparisonMode("columns")}>{label("Dwie kolumny", "Two fields")}</button><button className={comparisonMode === "groups" ? "active" : ""} disabled={!numeric.length || !groupingProfiles.length} onClick={() => setComparisonMode("groups")}>{label("Dwie grupy lub okresy", "Two groups or periods")}</button></div>
          <div className="compare-fields">
            {comparisonMode === "columns" ? <>
              <label>{label("Wartość bazowa", "Baseline value")}<select value={leftField} onChange={(event) => setComparisonLeftField(event.target.value)}>{numeric.map((profile) => <option key={profile.name}>{profile.name}</option>)}</select></label>
              <label>{label("Wartość porównywana", "Compared value")}<select value={rightField} onChange={(event) => setComparisonRightField(event.target.value)}>{numeric.filter((profile) => profile.name !== leftField).map((profile) => <option key={profile.name}>{profile.name}</option>)}</select></label>
            </> : <>
              <label>{label("Metryka", "Metric")}<select value={metricField} onChange={(event) => setComparisonMetricField(event.target.value)}>{numeric.map((profile) => <option key={profile.name}>{profile.name}</option>)}</select></label>
              <label>{label("Podział według", "Group by")}<select value={groupField} onChange={(event) => { setComparisonGroupField(event.target.value); setComparisonLeftGroup(""); setComparisonRightGroup(""); }}>{groupingProfiles.map((profile) => <option key={profile.name}>{profile.name}</option>)}</select></label>
              <label>{label("Grupa bazowa", "Baseline group")}<select value={leftGroup} onChange={(event) => setComparisonLeftGroup(event.target.value)}>{groupValues.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>{label("Grupa porównywana", "Compared group")}<select value={rightGroup} onChange={(event) => setComparisonRightGroup(event.target.value)}>{groupValues.filter((value) => value !== leftGroup).map((value) => <option key={value}>{value}</option>)}</select></label>
            </>}
            <label>{label("Obliczenie", "Calculation")}<select value={comparisonAggregation} onChange={(event) => setComparisonAggregation(event.target.value as Aggregation)}>{Object.entries(aggregationLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          </div>
        </section>
        {!result ? <div className="comparison-empty"><strong>{label("Potrzebne są co najmniej dwie wartości do porównania", "At least two values are needed for comparison")}</strong><p>{label("Wybierz inny tryb albo wczytaj plik zawierający kolumny liczbowe i grupujące.", "Choose a different mode or load a file with numeric and grouping fields.")}</p></div> : <>
          <div className="compare-summary">
            <div><span>{label("Różnica wartości", "Value difference")}</span><strong className={result.difference >= 0 ? "good" : "bad"}>{result.difference >= 0 ? "+" : ""}{formatValue(result.difference)}</strong></div>
            <div><span>{label("Zmiana procentowa", "Percentage change")}</span><strong className={(result.percent ?? 0) >= 0 ? "good" : "bad"}>{result.percent == null ? "—" : `${result.percent >= 0 ? "+" : ""}${result.percent.toFixed(1)}%`}</strong></div>
            <div><span>{label("Uwzględnione rekordy", "Included records")}</span><strong>{result.leftRecords.toLocaleString(locale)} / {result.rightRecords.toLocaleString(locale)}</strong></div>
          </div>
          <div className="compare-card">
            <div className="compare-header"><span>{label("Obliczenie", "Calculation")}</span><span>{result.leftLabel}</span><span>{result.rightLabel}</span><span>{label("Różnica", "Difference")}</span></div>
            <div className="compare-row"><strong>{aggregationLabels[comparisonAggregation]}</strong><div className="bar-cell"><span style={{ width: `${(Math.abs(result.leftValue) / max) * 88}%` }} /><small>{formatValue(result.leftValue)}</small></div><div className="bar-cell active"><span style={{ width: `${(Math.abs(result.rightValue) / max) * 88}%` }} /><small>{formatValue(result.rightValue)}</small></div><em className={result.difference >= 0 ? "positive-text" : "negative-text"}>{result.difference >= 0 ? "+" : ""}{formatValue(result.difference)}</em></div>
          </div>
          <div className="comparison-source-note"><span>▦</span><div><strong>{label("Źródło obliczenia", "Calculation source")}: {datasetName}</strong><p>{label("Zmiana wyboru, agregacji albo ponowne wczytanie pliku automatycznie aktualizuje wartości.", "Changing the selection, aggregation, or reloading the file updates values automatically.")}</p></div></div>
        </>}
      </div>
    );
  };

  const openModelBuild = (nodeId?: string) => {
    setView("model");
    setModelMode("build");
    if (nodeId) { setSelectedNodeId(nodeId); setShowInspector(true); }
  };
  const openModelSimulation = () => { setView("model"); setModelMode("simulate"); setShowInspector(false); };
  const openOlsStudio = () => { setView("model"); setModelMode("ols"); setShowInspector(false); };
  const openHelpDestination = (destination: HelpDestination) => {
    setHelpOpen(false);
    if (destination === "settings") { setSettingsOpen(true); return; }
    if (destination === "simulation") { openModelSimulation(); return; }
    if (destination === "model") { openModelBuild(); return; }
    if (destination === "diagnostics") { setView("paths"); return; }
    setView(destination);
  };
  const renderDiagnostics = () => <DiagnosticStudio rows={rows} columns={profiles.map(({ name, type }) => ({ name, type }))} datasetName={datasetName} sampled={datasetMeta.sampled} nodes={nodes} edges={edges} dependencyRules={dependencyRules} modelParameters={modelParameters} scenario={whatIfScenarios.find((item) => item.id === activeWhatIfId) ?? whatIfScenarios[0]} preferences={diagnosticPreferences} onPreferencesChange={setDiagnosticPreferences} onCustomize={() => { setModelSettingsTab("diagnostics"); setModelSettingsOpen(true); }} onOpenModel={openModelBuild} onOpenSimulation={openModelSimulation} />;
  const renderOls = () => <OlsStudio rows={modelRows} columns={profiles.map(({ name, type }) => ({ name, type }))} sampled={datasetMeta.sampled} specification={olsSpecification} scenario={olsScenario} onSpecificationChange={setOlsSpecification} onScenarioChange={setOlsScenario} />;
  const renderWhatIf = () => <WhatIfStudio rows={modelRows} columns={profiles.map(({ name, type }) => ({ name, type }))} scenarios={whatIfScenarios} activeScenarioId={activeWhatIfId} sampled={datasetMeta.sampled} nodes={nodes} edges={edges} dependencyRules={dependencyRules} modelParameters={modelParameters} modelMemory={modelMemory} onChange={setWhatIfScenarios} onActiveChange={setActiveWhatIfId} onDependencyChange={setDependencyRules} />;
  const renderVerification = () => <ModelVerificationStudio rows={modelRows} columns={profiles.map(({ name, type }) => ({ name, type }))} nodes={nodes} edges={edges} dependencyRules={dependencyRules} modelParameters={modelParameters} scenario={whatIfScenarios.find((item) => item.id === activeWhatIfId) ?? whatIfScenarios[0]} sampled={datasetMeta.sampled} preferences={verificationPreferences} onPreferencesChange={setVerificationPreferences} onCustomize={() => { setModelSettingsTab("checklist"); setModelSettingsOpen(true); }} onOpenBuild={openModelBuild} onOpenSimulation={openModelSimulation} onOpenDiagnostics={() => setView("paths")} />;
  void renderPaths;
  void renderCompare;

  const explorerVisible = view === "model" && modelMode === "build" && showExplorer;
  const inspectorVisible = view === "model" && modelMode === "build" && showInspector && Boolean(selectedNode);
  const bottomVisible = hasDataset && view === "model" && modelMode === "build" && bottomPanelMode !== "collapsed";
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
        {pendingWorkbook && <div className="sheet-picker-backdrop"><div className="sheet-picker"><span className="eyebrow">{label("ARKUSZE PLIKU", "FILE SHEETS")}</span><h3>{label("Wybierz arkusz do wczytania", "Choose a sheet to load")}</h3><p>{pendingWorkbook.file.name}</p><div>{pendingWorkbook.sheets.map((sheet) => <button key={sheet} onClick={() => { const file = pendingWorkbook.file; setPendingWorkbook(null); void performImport(file, sheet); }}><span>▦</span><strong>{sheet}</strong><i>›</i></button>)}</div><button className="secondary-button" onClick={() => setPendingWorkbook(null)}>{label("Anuluj", "Cancel")}</button></div></div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <input ref={chartFileRef} className="global-file-input" type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} />
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setHomeOpen(true)} title={label("Wróć do strony głównej", "Back to home")}><span className="brand-mark"><i /><i /><i /></span><strong>EYES OF ODIN</strong><small>SCENARIO STUDIO</small></button>
        <div className="project-breadcrumb"><span>{preferences.language === "en" ? "Projects" : "Projekty"}</span><i>/</i><input className="project-name-input" aria-label={label("Nazwa projektu", "Project name")} title={label("Kliknij, aby zmienić nazwę projektu", "Click to rename the project")} value={projectName} onChange={(event) => setProjectName(event.target.value)} /><span className="saved-dot">{workspaceActive ? `● ${t("saved")}` : (preferences.language === "en" ? "empty" : "pusty")}</span></div>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span> {t("search")} <kbd>Ctrl K</kbd></button>
        <div className="top-actions"><button aria-label="Notifications" title="Notifications" onClick={() => setToast(preferences.language === "en" ? "No new notifications" : "Brak nowych powiadomień")}>○</button><button className="run-button" disabled={!hasDataset} onClick={runModel}>▶ {t("run")}</button></div>
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
          <div className="document-tabs"><button className={view === "model" ? "active" : ""} onClick={() => setView("model")}><span className="tab-glyph">◇</span> {modelFileName(modelName)}</button>{hasDataset && <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}><span className="csv-glyph">▦</span> {datasetName}</button>}{hasDataset && <button className={view === "charts" ? "active" : ""} onClick={() => setView("charts")}><span className="chart-glyph">▥</span> pulpit_wykresów</button>}</div>
          {scenarioModelAvailable ? <div className="scenario-switcher"><span>{label("SCENARIUSZ", "SCENARIO")}</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={createScenario} aria-label={label("Dodaj scenariusz", "Add scenario")}>＋</button></div> : <div className="dataset-context"><span>{label("AKTYWNE DANE", "ACTIVE DATA")}</span><strong>{hasDataset ? datasetName : label("Brak pliku", "No file")}</strong></div>}
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
            <div className="panel-title"><span>{label("EKSPLORATOR", "EXPLORER")}</span><button aria-label={label("Ukryj eksplorator", "Hide explorer")} title={label("Ukryj eksplorator (Ctrl+B)", "Hide explorer (Ctrl+B)")} onClick={() => setShowExplorer(false)}>×</button></div>
            <div className="project-tree">
              <div className="tree-project"><span>⌄</span><input aria-label={label("Nazwa projektu w eksploratorze", "Project name in explorer")} value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
              {hasDataset && <button onClick={() => setView("data")}><i className="tree-line" /><span className="csv-glyph">▦</span><span>{datasetName}</span><small>{datasetMeta.totalRows}</small></button>}
              <div className="tree-group"><span>⌄</span> {label("Wizualizacje", "Visualizations")}</div>
              {hasDataset ? <button onClick={() => setView("charts")}><i className="tree-line" /><span className="chart-glyph">▥</span><span>{label("Pulpit wykresów", "Chart dashboard")}</span><small>{charts.length}</small></button> : <div className="tree-empty">{label("Brak danych i wykresów", "No data or charts")}</div>}
              <div className="tree-group"><span>⌄</span> {label("Modele", "Models")}</div>
              <div className={`tree-model-name ${view === "model" ? "tree-active" : ""}`}><i className="tree-line" /><button aria-label={label("Otwórz model", "Open model")} onClick={() => setView("model")}>◇</button><input aria-label={label("Nazwa modelu", "Model name")} value={modelName} onChange={(event) => setModelName(event.target.value)} /></div>
              {scenarioModelAvailable && <><div className="tree-group"><span>⌄</span> {label("Scenariusze", "Scenarios")}</div>{scenarios.map((item) => <button key={item.id} className={scenarioId === item.id ? "tree-active" : ""} onClick={() => setScenarioId(item.id)}><i className="tree-line" /><span className={item.id === "baseline" ? "base-dot" : "variant-dot"}>●</span><span>{item.name}</span></button>)}</>}
            </div>
            <div className="library-title"><span>{label("BLOKI MODELU", "MODEL BLOCKS")}</span><small>{label("przeciągnij lub kliknij", "drag or click")}</small></div>
            <div className="block-library">
              {(Object.keys(kindMeta) as NodeKind[]).map((kind) => <button key={kind} onClick={() => addNode(kind)}><span className={`block-icon node-${kind}`}>{kindMeta[kind].icon}</span><span><strong>{kindLabel(kind)}</strong><small>{kind === "source" ? label("Pliki, arkusze, Parquet", "Files, sheets, Parquet") : kind === "decision" ? label("Rozgałęź ścieżkę", "Branch the path") : kind === "metric" ? label("Oblicz wynik", "Calculate a result") : label("Przetwórz dane", "Process data")}</small></span><i>＋</i></button>)}
            </div>
            <label className="import-drop"><span>＋</span><strong>{label("Dodaj dane", "Add data")}</strong><small>{label("13 formatów · do 2 GB", "13 formats · up to 2 GB")}</small><input type="file" accept={DATA_FILE_ACCEPT} onChange={handleFile} /></label>
          </aside>}
          {explorerVisible && <div className="workspace-resizer explorer-resizer" role="separator" aria-label={label("Zmień szerokość eksploratora", "Resize explorer")} aria-orientation="vertical" aria-valuenow={Math.round(explorerWidth)} onPointerDown={(event) => startPanelResize(event, "explorer")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}

          <section className="center-stage">
            {view === "model" && <div className="stage-toolbar">
              <div className="model-mode-tabs" role="tablist" aria-label={preferences.language === "en" ? "Model workspace mode" : "Tryb pracy modelu"}><button role="tab" aria-selected={modelMode === "build"} className={modelMode === "build" ? "active" : ""} onClick={() => setModelMode("build")}><span>01</span> {preferences.language === "en" ? "Build" : "Budowa"}</button><button role="tab" aria-selected={modelMode === "ols"} className={modelMode === "ols" ? "active" : ""} disabled={!hasDataset} onClick={openOlsStudio}><span>02</span> {preferences.language === "en" ? "OLS regression" : "Regresja OLS"}</button><button role="tab" aria-selected={modelMode === "simulate"} className={modelMode === "simulate" ? "active" : ""} disabled={!hasDataset} onClick={() => setModelMode("simulate")}><span>03</span> {preferences.language === "en" ? "Simulation" : "Symulacja"}</button><button role="tab" aria-selected={modelMode === "verify"} className={modelMode === "verify" ? "active" : ""} disabled={!hasDataset} onClick={() => setModelMode("verify")}><span>04</span> {preferences.language === "en" ? "Verification" : "Weryfikacja"}</button></div>
              {modelMode === "build" && <div className="stage-toolbar-actions"><button className={showExplorer ? "active" : ""} onClick={() => setShowExplorer((visible) => !visible)}>☰ {t("explorer")}</button><button className={showInspector ? "active" : ""} disabled={!selectedNode} onClick={() => setShowInspector((visible) => !visible)}>☷ {t("inspector")}</button><button className={bottomPanelMode !== "collapsed" ? "active" : ""} disabled={!hasDataset} onClick={() => setBottomPanelMode((mode) => mode === "collapsed" ? "normal" : "collapsed")}>▤ {t("resultsPanel")}</button><span /><button className={modelMemory.some((entry) => entry.enabled && entry.useInModel) ? "active" : ""} title={preferences.language === "en" ? `${modelMemory.length} saved memory entries` : `${modelMemory.length} zapisanych wpisów pamięci`} onClick={() => { setModelSettingsTab("parameters"); setModelSettingsOpen(true); }}>⚙ {preferences.language === "en" ? "Parameters & memory" : "Parametry i pamięć"}{modelMemory.length ? ` · ${modelMemory.length}` : ""}</button><div className="model-block-picker"><button className={blockMenuOpen ? "active" : ""} onClick={() => setBlockMenuOpen((open) => !open)}>＋ {t("block")}</button>{blockMenuOpen && <div className="model-block-menu">{(Object.keys(kindMeta) as NodeKind[]).map((kind) => <button key={kind} onClick={() => { addNode(kind); setBlockMenuOpen(false); }}><span className={`node-${kind}`}>{kindMeta[kind].icon}</span><div><strong>{kindLabel(kind)}</strong><small>{kind === "source" ? label("Nowe źródło danych", "New data source") : kind === "transform" ? label("Formuła lub zmiana", "Formula or change") : kind === "decision" ? label("Próg i alert", "Threshold and alert") : kind === "metric" ? label("Obliczenie", "Calculation") : label("Końcowy rezultat", "Final result")}</small></div></button>)}</div>}</div><button disabled={!nodes.length} onClick={arrangeModel}>⌘ {t("arrange")}</button><button className={connectionFromId ? "active" : ""} disabled={nodes.length < 2} onClick={() => connectionFromId ? setConnectionFromId("") : startConnection()}>⌁ {connectionFromId ? (preferences.language === "en" ? "Cancel relation" : "Anuluj relację") : t("relation")}</button><button disabled={!lastModelAction} onClick={restoreLastModelAction} title={preferences.language === "en" ? "Undo deletion (Ctrl+Z)" : "Cofnij usunięcie (Ctrl+Z)"}>↶ {preferences.language === "en" ? "Undo" : "Cofnij"}</button></div>}
              {modelMode === "ols"
                ? <div className={`model-health ${olsSpecification.targetField && olsSpecification.predictorFields.length ? "ready" : "not-ready"}`}><i /> {label("Model OLS", "OLS model")} <span>·</span> Y: {olsSpecification.targetField || "—"} <span>·</span> {olsSpecification.predictorFields.length} {label("zmiennych X", "X variables")}</div>
                : <div className={`model-health ${scenarioModelAvailable || modelValidation.ready ? "ready" : "not-ready"}`}><i /> {scenarioModelAvailable || modelValidation.ready ? label("Model gotowy", "Model ready") : nodes.length ? label("Model wymaga konfiguracji", "Model needs configuration") : label("Pusty model", "Empty model")} <span>·</span> {nodes.length} {label("bloków", "blocks")} <span>·</span> {edges.length} {label("relacji", "relations")}</div>}
            </div>}
            {view === "model" && modelMode === "build" && renderModel()}
            {view === "model" && modelMode === "ols" && (hasDataset ? renderOls() : renderDataRequired(label("Brak modelu OLS", "No OLS model"), label("Wczytaj dane, aby zbudować równanie regresji.", "Load data to build a regression equation.")))}
            {view === "model" && modelMode === "simulate" && (hasDataset ? renderWhatIf() : renderDataRequired(label("Brak symulacji", "No simulation"), label("Wczytaj dane, aby utworzyć wariant modelu.", "Load data to create a model variant.")))}
            {view === "model" && modelMode === "verify" && (hasDataset ? renderVerification() : renderDataRequired(label("Brak weryfikacji", "No verification"), label("Wczytaj dane, aby sprawdzić gotowość modelu.", "Load data to verify model readiness.")))}
            {view === "data" && renderData()}
            {view === "charts" && (hasDataset ? <ChartStudio key={datasetId} rows={rows} columns={profiles.map(({ name, type }) => ({ name, type }))} datasetId={datasetId} datasetName={datasetName} charts={charts} onChartsChange={setCharts} onImport={() => chartFileRef.current?.click()} onToast={setToast} sampled={datasetMeta.sampled} totalRows={datasetMeta.totalRows} grid={dashboardGrid} templates={templates} defaultTemplateId={defaultTemplateId} onGridChange={setDashboardGrid} onTemplatesChange={setTemplates} onDefaultTemplateChange={setDefaultTemplateId} /> : renderDataRequired(label("Brak wykresów", "No charts"), label("Najpierw wczytaj plik danych.", "Load a data file first.")))}
            {view === "paths" && (hasDataset ? renderDiagnostics() : renderDataRequired(label("Brak diagnostyki", "No diagnostics"), label("Wczytaj plik, aby sprawdzić jakość, zależności i wartości odstające.", "Load a file to inspect quality, relationships and outliers.")))}
          </section>

          {inspectorVisible && selectedNode && <aside className="inspector-panel">
            <div className="panel-title"><span>{label("INSPEKTOR", "INSPECTOR")}</span><button aria-label={label("Zamknij inspektor", "Close inspector")} onClick={() => setShowInspector(false)}>×</button></div>
            <div className="selected-summary"><span className={`large-node-icon node-${selectedNode.kind}`}>{kindMeta[selectedNode.kind].icon}</span><div><small>{kindLabel(selectedNode.kind).toUpperCase()}</small><strong>{selectedNode.title}</strong></div></div>
            <div className="inspector-section open"><div className="section-heading"><span>⌄</span><strong>{label("Właściwości", "Properties")}</strong></div><label>{label("Nazwa", "Name")}<input value={selectedNode.title} onChange={(event) => changeSelectedTitle(event.target.value)} /></label><label>{label("Opis", "Description")}<textarea value={selectedNode.subtitle} onChange={(event) => setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, subtitle: event.target.value } : node))} /></label></div>
            {scenarioModelAvailable && <div className="inspector-section open scenario-controls"><div className="section-heading"><span>⌄</span><strong>{label("Parametry scenariusza", "Scenario parameters")}</strong></div>
              <RangeControl label={label("Zmiana ceny", "Price change")} value={scenario.priceChange} min={-20} max={30} suffix="%" onChange={(priceChange) => updateScenario({ priceChange })} />
              <RangeControl label={label("Budżet marketingu", "Marketing budget")} value={scenario.marketingChange} min={-40} max={80} suffix="%" onChange={(marketingChange) => updateScenario({ marketingChange })} />
              <RangeControl label={label("Zmiana konwersji", "Conversion change")} value={scenario.conversionChange} min={-20} max={40} suffix="%" onChange={(conversionChange) => updateScenario({ conversionChange })} />
            </div>}
            {!scenarioModelAvailable && selectedNode.kind === "decision" && <div className="inspector-section open model-rule-controls"><div className="section-heading"><span>⌄</span><strong>{label("Reguła monitorowania", "Monitoring rule")}</strong></div>
              <label>{label("Kolumna wartości", "Value field")}<select value={selectedNode.config?.field ?? ""} onChange={(event) => updateSelectedConfig({ field: event.target.value })}><option value="">{label("Wybierz pole…", "Choose a field…")}</option>{modelNumericFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label>
              <label>{label("Kolumna czasu", "Time field")}<select value={selectedNode.config?.timeField ?? ""} onChange={(event) => updateSelectedConfig({ timeField: event.target.value })}><option value="">{label("Wybierz pole…", "Choose a field…")}</option>{profiles.filter((profile) => profile.type === "date").map((profile) => <option key={profile.name} value={profile.name}>{profile.name}</option>)}</select></label>
              <label>{label("Rodzaj progu", "Threshold type")}<select value={selectedNode.config?.thresholdMode ?? "percentile"} onChange={(event) => updateSelectedConfig({ thresholdMode: event.target.value as ModelNodeConfig["thresholdMode"] })}><option value="percentile">{label("Percentyl", "Percentile")}</option><option value="manual">{label("Wartość ręczna", "Manual value")}</option></select></label>
              {(selectedNode.config?.thresholdMode ?? "percentile") === "percentile" ? <label>{label("Percentyl", "Percentile")}<select value={selectedNode.config?.percentile ?? 90} onChange={(event) => updateSelectedConfig({ percentile: Number(event.target.value) })}><option value="75">P75</option><option value="90">P90</option><option value="95">P95</option><option value="99">P99</option></select></label> : <label>{label("Wartość graniczna", "Boundary value")}<input type="number" value={selectedNode.config?.thresholdValue ?? ""} onChange={(event) => updateSelectedConfig({ thresholdValue: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>}
              <label>{label("Przekroczenie", "Violation")}<select value={selectedNode.config?.direction ?? "above"} onChange={(event) => updateSelectedConfig({ direction: event.target.value as ModelNodeConfig["direction"] })}><option value="above">{label("Powyżej progu", "Above threshold")}</option><option value="below">{label("Poniżej progu", "Below threshold")}</option></select></label>
              <label>{label("Poziom alertu", "Alert level")}<select value={selectedNode.config?.severity ?? "warning"} onChange={(event) => updateSelectedConfig({ severity: event.target.value as ModelNodeConfig["severity"] })}><option value="info">{label("Informacja", "Information")}</option><option value="warning">{label("Ostrzeżenie", "Warning")}</option><option value="critical">{label("Krytyczne", "Critical")}</option></select></label>
            </div>}
            {!scenarioModelAvailable && (selectedNode.kind === "metric" || selectedNode.kind === "result") && <div className="inspector-section open model-rule-controls"><div className="section-heading"><span>⌄</span><strong>{label("Reguła obliczenia", "Calculation rule")}</strong><small>fx</small></div>
              {selectedNode.kind === "result" && nodes.some((node) => node.kind === "decision") && <label>{label("Reguła źródłowa", "Source rule")}<select value={selectedNode.config?.sourceRuleId ?? ""} onChange={(event) => updateSelectedConfig({ sourceRuleId: event.target.value || undefined })}><option value="">{label("Pierwsza pasująca reguła", "First matching rule")}</option>{nodes.filter((node) => node.kind === "decision").map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>}
              <label>{label("Źródło wartości", "Value source")}<select value={selectedNode.config?.formula !== undefined ? "formula" : "column"} onChange={(event) => updateSelectedConfig(event.target.value === "formula" ? { formula: modelNumericFields[0] ? `[${modelNumericFields[0]}]` : "", field: undefined } : { formula: undefined, field: modelNumericFields[0] })}><option value="column">{label("Jedna kolumna", "One field")}</option><option value="formula">{label("Własna formuła", "Custom formula")}</option></select></label>
              {selectedNode.config?.formula === undefined ? <label>{label("Kolumna z danych", "Data field")}<select value={selectedNode.config?.field ?? ""} onChange={(event) => updateSelectedConfig({ field: event.target.value || undefined })}><option value="">{label("Wybierz kolumnę…", "Choose a field…")}</option>{modelNumericFields.map((field) => <option key={field} value={field}>{field}{profiles.find((profile) => profile.name === field)?.unique === 1 ? label(" (wartość stała)", " (constant value)") : ""}</option>)}</select></label> : <>
                <label>{label("Formuła", "Formula")}<textarea className="formula-editor" value={selectedNode.config.formula} onChange={(event) => updateSelectedConfig({ formula: event.target.value })} placeholder={label("np. [Przychód] - [Koszt]", "e.g. [Revenue] - [Cost]")} /></label>
                <div className="formula-field-chips"><span>{label("Wstaw kolumnę:", "Insert field:")}</span>{modelNumericFields.slice(0, 8).map((field) => <button key={field} onClick={() => updateSelectedConfig({ formula: `${selectedNode.config?.formula ?? ""}${selectedNode.config?.formula ? " " : ""}[${field}]` })}>{field}</button>)}</div>
                {modelParameters.length > 0 && <div className="formula-field-chips parameter-chips"><span>{label("Wstaw parametr:", "Insert parameter:")}</span>{modelParameters.map((parameter) => <button key={parameter.id} title={parameter.description} onClick={() => updateSelectedConfig({ formula: `${selectedNode.config?.formula ?? ""}${selectedNode.config?.formula ? " " : ""}{{${parameter.name}}}` })}>{parameter.name} = {parameter.value}{parameter.unit}</button>)}</div>}
                <div className={`formula-preview ${selectedFormulaPreview?.error && !selectedFormulaPreview.validCount ? "error" : ""}`}><span>{label("Podgląd na pierwszych rekordach", "Preview on the first records")}</span><strong>{selectedFormulaPreview?.average == null ? "—" : selectedFormulaPreview.average.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 3 })}</strong><small>{selectedFormulaPreview?.validCount ?? 0} {label("poprawnych wartości", "valid values")}{selectedFormulaPreview?.error ? ` · ${selectedFormulaPreview.error}` : ""}</small></div>
              </>}
              <label>{label("Sposób obliczenia", "Calculation method")}<select value={selectedNode.config?.calculation ?? "average"} onChange={(event) => updateSelectedConfig({ calculation: event.target.value as ModelNodeConfig["calculation"] })}><option value="average">{label("Średnia", "Average")}</option><option value="sum">{label("Suma", "Sum")}</option><option value="minimum">Minimum</option><option value="maximum">Maximum</option><option value="last">{label("Ostatnia wartość", "Last value")}</option><option value="count">{label("Liczba rekordów", "Record count")}</option>{selectedNode.kind === "result" && nodes.some((node) => node.kind === "decision") && <><option value="violations">{label("Liczba przekroczonych próbek", "Violated sample count")}</option><option value="events">{label("Liczba zdarzeń alarmowych", "Alert event count")}</option></>}</select></label>
              <p className="inspector-hint">{label("Możesz używać działań +, −, *, /, ^ oraz funkcji abs(), min(), max(), round(), sqrt() i pow().", "You can use +, −, *, /, ^ and abs(), min(), max(), round(), sqrt(), pow().")}</p>
            </div>}
            {!scenarioModelAvailable && selectedNode.kind === "transform" && <div className="inspector-section open model-rule-controls"><div className="section-heading"><span>⌄</span><strong>{label("Transformacja danych", "Data transformation")}</strong><small>fx</small></div>
              <label>{label("Operacja", "Operation")}<select value={selectedNode.config?.transformOperation ?? "none"} onChange={(event) => updateSelectedConfig({ transformOperation: event.target.value as ModelNodeConfig["transformOperation"] })}><option value="formula">{label("Własna formuła", "Custom formula")}</option><option value="add">{label("Dodaj wartość", "Add value")}</option><option value="multiply">{label("Pomnóż przez", "Multiply by")}</option><option value="percent">{label("Zmień procentowo", "Change by percent")}</option></select></label>
              {(selectedNode.config?.transformOperation ?? "none") !== "formula" && <label>{label("Kolumna wejściowa", "Input field")}<select value={selectedNode.config?.field ?? ""} onChange={(event) => updateSelectedConfig({ field: event.target.value || undefined })}><option value="">{label("Wybierz kolumnę…", "Choose a field…")}</option>{selectedTransformInputFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label>}
              {(selectedNode.config?.transformOperation === "add" || selectedNode.config?.transformOperation === "multiply" || selectedNode.config?.transformOperation === "percent") && <label>{label("Wartość zmiany", "Change value")}<input type="number" value={selectedNode.config?.transformValue ?? 0} onChange={(event) => updateSelectedConfig({ transformValue: Number(event.target.value) })} /></label>}
              {selectedNode.config?.transformOperation === "formula" && <><label>{label("Formuła", "Formula")}<textarea className="formula-editor" value={selectedNode.config?.formula ?? ""} onChange={(event) => updateSelectedConfig({ formula: event.target.value })} placeholder="e.g. [Dancer_Output] - [Dancer_Setpoint]" /></label><div className="formula-field-chips"><span>{label("Wstaw kolumnę:", "Insert field:")}</span>{selectedTransformInputFields.slice(0, 8).map((field) => <button key={field} onClick={() => updateSelectedConfig({ formula: `${selectedNode.config?.formula ?? ""}${selectedNode.config?.formula ? " " : ""}[${field}]` })}>{field}</button>)}</div>{modelParameters.length > 0 && <div className="formula-field-chips parameter-chips"><span>{label("Wstaw parametr:", "Insert parameter:")}</span>{modelParameters.map((parameter) => <button key={parameter.id} title={parameter.description} onClick={() => updateSelectedConfig({ formula: `${selectedNode.config?.formula ?? ""}${selectedNode.config?.formula ? " " : ""}{{${parameter.name}}}` })}>{parameter.name} = {parameter.value}{parameter.unit}</button>)}</div>}<div className={`formula-preview ${selectedFormulaPreview?.error && !selectedFormulaPreview.validCount ? "error" : ""}`}><span>{label("Średni wynik próbki", "Sample average result")}</span><strong>{selectedFormulaPreview?.average == null ? "—" : selectedFormulaPreview.average.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 3 })}</strong><small>{selectedFormulaPreview?.validCount ?? 0} {label("poprawnych wartości", "valid values")}{selectedFormulaPreview?.error ? ` · ${selectedFormulaPreview.error}` : ""}</small></div></>}
              <label>{label("Nazwa nowej kolumny", "New field name")}<input value={selectedNode.config?.outputField ?? ""} onChange={(event) => updateSelectedConfig({ outputField: event.target.value })} placeholder={label("np. Marża_modelu", "e.g. Model_margin")} /></label>
              <p className="inspector-hint">{label("Ta kolumna będzie dostępna w kolejnych regułach, metrykach i wynikach.", "This field will be available to subsequent rules, metrics and results.")}</p>
            </div>}
            {!scenarioModelAvailable && selectedNode.kind === "source" && <div className="inspector-section open"><div className="section-heading"><span>⌄</span><strong>{label("Źródło danych", "Data source")}</strong></div><div className="inspector-source-summary"><span>{label("Plik", "File")}</span><strong>{datasetName}</strong><span>{label("Zakres", "Range")}</span><strong>{datasetMeta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} {label("rekordów", "records")} · {profiles.length} {label("kolumn", "fields")}</strong></div></div>}
            <div className="inspector-section open connection-controls"><div className="section-heading"><span>⌄</span><strong>{label("Połączenia", "Connections")}</strong><small>{edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id).length}</small></div>
              <div className="connection-list">{edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id).map((edge) => { const fromNode = nodes.find((node) => node.id === edge.from); const toNode = nodes.find((node) => node.id === edge.to); return <div className="connection-row" key={edge.id}><button className="connection-focus" onClick={() => { setSelectedNodeId(""); setSelectedEdgeId(edge.id); setShowInspector(false); }}>{fromNode?.title ?? edge.from} <i>→</i> {toNode?.title ?? edge.to}</button><button aria-label={`${label("Usuń relację", "Delete relationship")} ${fromNode?.title ?? edge.from} → ${toNode?.title ?? edge.to}`} title={label("Usuń relację", "Delete relationship")} onClick={() => removeEdgeById(edge.id)}>×</button></div>; })}</div>
              <label>{label("Połącz z blokiem", "Connect to block")}<select value={connectionTargetId} onChange={(event) => setConnectionTargetId(event.target.value)}><option value="">{label("Wybierz blok…", "Choose a block…")}</option>{nodes.filter((node) => node.id !== selectedNode.id).map((node) => <option key={node.id} value={node.id}>{kindLabel(node.kind)}: {node.title}</option>)}</select></label>
              <button className="inspector-action" disabled={!connectionTargetId} onClick={addSelectedConnection}>＋ {label("Dodaj połączenie", "Add connection")}</button>
              <p className="inspector-hint">{label("Dla bloku „Wynik” wybrany element zostanie podłączony jako wejście.", "For a Result block, the selected item will be connected as its input.")}</p>
            </div>
            <div className="inspector-node-actions"><button className="secondary-button" onClick={duplicateSelectedNode}>{label("Duplikuj blok", "Duplicate block")}</button><button className="danger-button" onClick={removeSelectedNode}>{label("Usuń", "Delete")} {selectedNode.kind === "source" ? label("źródło", "source") : label("element", "item")}</button></div>
          </aside>}
          {inspectorVisible && <div className="workspace-resizer inspector-resizer" role="separator" aria-label={label("Zmień szerokość inspektora", "Resize inspector")} aria-orientation="vertical" aria-valuenow={Math.round(inspectorWidth)} onPointerDown={(event) => startPanelResize(event, "inspector")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}

          {bottomVisible && <section className="bottom-panel">
            <div className="bottom-tabs">
              <button className={bottomTab === "results" ? "active" : ""} onClick={() => setBottomTab("results")}>{label("WYNIKI", "RESULTS")} <span>{modelExecution?.ready ? modelExecution.outputs.length + modelExecution.rules.length : 0}</span></button>
              <button className={bottomTab === "data" ? "active" : ""} onClick={() => setBottomTab("data")}>{label("PRZEBIEG", "FLOW")} <span>{nodes.length}</span></button>
              <button className={bottomTab === "issues" ? "active" : ""} onClick={() => setBottomTab("issues")}>{label("PROBLEMY", "ISSUES")} <span className={modelValidation.issues.length ? "bad" : "issue-zero"}>{scenarioModelAvailable ? 0 : modelValidation.issues.length}</span></button>
              <div className="bottom-actions"><span>{modelExecution?.executedAt ? `${label("Ostatnie przeliczenie", "Last run")}: ${new Date(modelExecution.executedAt).toLocaleTimeString(preferences.language === "en" ? "en-US" : "pl-PL")}` : label("Model nieuruchomiony", "Model not run")}</span><button aria-label={bottomPanelMode === "maximized" ? label("Przywróć rozmiar", "Restore size") : label("Maksymalizuj", "Maximize")} title={bottomPanelMode === "maximized" ? label("Przywróć rozmiar", "Restore size") : label("Maksymalizuj", "Maximize")} onClick={() => setBottomPanelMode((mode) => mode === "maximized" ? "normal" : "maximized")}>{bottomPanelMode === "maximized" ? "⌄" : "⌃"}</button><button aria-label={label("Zamknij panel wyników", "Close results panel")} title={label("Zamknij panel wyników (Ctrl+J)", "Close results panel (Ctrl+J)")} onClick={() => setBottomPanelMode("collapsed")}>×</button></div>
            </div>
            {bottomTab === "results" && scenarioModelAvailable && <div className="metrics-strip">
              <MetricCard label={label("Przychód", "Revenue")} value={formatMoney(metrics.revenue)} delta={(metrics.revenue / baselineMetrics.revenue - 1) * 100} spark={[38, 43, 41, 48, 54, 62, 69]} />
              <MetricCard label={label("Koszt", "Cost")} value={formatMoney(metrics.cost)} delta={(metrics.cost / baselineMetrics.cost - 1) * 100} spark={[35, 36, 42, 45, 51, 49, 56]} />
              <MetricCard label={label("Zysk", "Profit")} value={formatMoney(metrics.profit)} delta={(metrics.profit / baselineMetrics.profit - 1) * 100} spark={[28, 31, 39, 42, 51, 62, 74]} featured />
              <MetricCard label={label("Marża", "Margin")} value={`${metrics.margin.toFixed(1)}%`} delta={metrics.margin - baselineMetrics.margin} spark={[42, 38, 47, 51, 56, 61, 66]} />
            </div>}
            {bottomTab === "results" && !scenarioModelAvailable && modelExecution?.ready && <div className="model-execution-results">
              <div className="execution-overview"><article><span>{label("Przeliczono", "Processed")}</span><strong>{modelExecution.processedRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")}</strong><small>{label("rekordów", "records")}</small></article><article><span>{label("Wyniki", "Results")}</span><strong>{modelExecution.outputs.length}</strong><small>{label("metryk i rezultatów", "metrics and outputs")}</small></article><article><span>{label("Alerty", "Alerts")}</span><strong className={modelExecution.rules.some((rule) => rule.eventCount) ? "bad" : "good"}>{modelExecution.rules.reduce((sum, rule) => sum + rule.eventCount, 0)}</strong><small>{label("wykrytych zdarzeń", "events detected")}</small></article><article><span>{label("Czas", "Time")}</span><strong>{(modelExecution.durationMs ?? 0).toFixed(0)} ms</strong><small>{label("lokalnie", "locally")}</small></article></div>
              <div className="execution-cards">
                {modelExecution.outputs.map((output) => <article className="execution-card output" key={output.nodeId}><span>{label("WYNIK", "RESULT")}</span><strong>{output.value.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 3 })}</strong><b>{output.nodeTitle}</b><small>{output.detail}</small></article>)}
                {modelExecution.transforms.map((transform) => <article className="execution-card transform" key={transform.nodeId}><span>{label("TRANSFORMACJA", "TRANSFORMATION")}</span><strong>{transform.afterAverage?.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 3 }) ?? "—"}</strong><b>{transform.outputField}</b><small>{transform.validCount.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} {label("wartości", "values")}{transform.deltaPercent == null ? "" : ` · ${transform.deltaPercent >= 0 ? "+" : ""}${transform.deltaPercent.toFixed(1)}% ${label("vs wejście", "vs input")}`}</small></article>)}
                {modelExecution.rules.map((rule) => <article className={`execution-card alert ${rule.eventCount ? "has-alert" : ""}`} key={rule.nodeId}><span>{label("REGUŁA", "RULE")} · {rule.thresholdLabel}</span><strong>{rule.eventCount}</strong><b>{rule.nodeTitle}</b><small>{rule.violationCount} {label("próbek", "samples")} · {label("granica", "boundary")} {rule.boundary.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL", { maximumFractionDigits: 3 })}{rule.firstEvent ? ` · ${label("od", "from")} ${rule.firstEvent.start}` : ""}</small></article>)}
                {!modelExecution.outputs.length && !modelExecution.rules.length && <article className="execution-empty"><strong>{label("Model wykonał się, ale nie zwraca wyniku", "The model ran but returns no result")}</strong><span>{label("Dodaj metrykę albo skonfiguruj blok Wynik.", "Add a metric or configure a Result block.")}</span></article>}
              </div>
            </div>}
            {bottomTab === "results" && !scenarioModelAvailable && !modelExecution?.ready && <div className={`model-run-readiness ${modelValidation.ready ? "ready" : "blocked"}`}><div><span>{modelValidation.ready ? label("GOTOWY DO PRZELICZENIA", "READY TO RUN") : label("MODEL WYMAGA UWAGI", "MODEL NEEDS ATTENTION")}</span><strong>{modelValidation.ready ? label("Sprawdź, co wynika z danych i formuł", "See what follows from the data and formulas") : label(`${modelValidation.issues.length} ${modelValidation.issues.length === 1 ? "rzecz blokuje" : "rzeczy blokują"} uruchomienie`, `${modelValidation.issues.length} ${modelValidation.issues.length === 1 ? "issue blocks" : "issues block"} execution`)}</strong><small>{modelValidation.ready ? `${datasetMeta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} ${label("rekordów", "records")} · ${nodes.length} ${label("bloków", "blocks")} · ${label("obliczenia wykonają się lokalnie", "calculations run locally")}` : modelValidation.issues[0]}</small></div><button disabled={!modelValidation.ready} onClick={runModel}>▶ {label("Uruchom model", "Run model")}</button></div>}
            {bottomTab === "data" && <div className="model-flow-summary"><div className="flow-source"><span>▦</span><strong>{datasetName}</strong><small>{datasetMeta.totalRows.toLocaleString(preferences.language === "en" ? "en-US" : "pl-PL")} {label("rekordów", "records")}</small></div>{nodes.filter((node) => node.kind !== "source").map((node) => <div className={`flow-step node-${node.kind}`} key={node.id}><i>→</i><span>{kindMeta[node.kind].icon}</span><strong>{node.title}</strong><small>{node.subtitle}</small></div>)}<div className="flow-tail"><strong>{modelValidation.ready ? label("Gotowy", "Ready") : label("Niekompletny", "Incomplete")}</strong><small>{modelValidation.ready ? label("Uruchom, aby zobaczyć wyniki", "Run to see results") : label("Otwórz Problemy", "Open Issues")}</small></div></div>}
            {bottomTab === "issues" && (scenarioModelAvailable || modelValidation.ready ? <div className="bottom-message success"><strong>✓ {label("Model nie zawiera problemów blokujących", "The model has no blocking issues")}</strong><span>{label("Wszystkie użyte kolumny, formuły i połączenia są gotowe do przeliczenia.", "All fields, formulas and connections are ready for calculation.")}</span><button onClick={runModel}>{label("Uruchom ponownie", "Run again")}</button></div> : <div className="model-issues">{modelValidation.issues.map((issue) => <button key={issue} onClick={() => focusModelIssue(issue)}><span>!</span><strong>{issue}</strong><small>{nodes.some((node) => issue.includes(`„${node.title}”`)) ? label("Kliknij, aby otworzyć właściwy blok", "Click to open the relevant block") : label("Sprawdź strukturę modelu", "Review model structure")}</small></button>)}</div>)}
          </section>}
          {bottomVisible && bottomPanelMode !== "maximized" && <div className="workspace-resizer results-resizer" role="separator" aria-label={label("Zmień wysokość panelu wyników", "Resize results panel")} aria-orientation="horizontal" aria-valuenow={Math.round(resultsHeight)} onPointerDown={(event) => startPanelResize(event, "results")} onPointerMove={handlePanelResize} onPointerUp={stopPanelResize} onPointerCancel={stopPanelResize} />}
        </div>
      </section>

      <footer className="statusbar"><div><span>◇ main</span><span>↻</span><span className="status-ok">✓ 0</span><span>△ 0</span></div><div><span>{datasetMeta.totalRows.toLocaleString(locale)} {preferences.language === "en" ? "records" : "rekordów"}</span><span>{preferences.language === "en" ? "local" : "lokalnie"}</span><span>{hasDataset ? datasetMeta.format.toUpperCase() : (preferences.language === "en" ? "NO DATA" : "BRAK DANYCH")}</span><span>Eyes Engine {APP_VERSION}</span><span className="status-live">● {t("ready")}</span></div></footer>

      {renderImportProgress()}
      {pendingWorkbook && <div className="sheet-picker-backdrop"><div className="sheet-picker"><span className="eyebrow">{label("ARKUSZE PLIKU", "FILE SHEETS")}</span><h3>{label("Wybierz arkusz do wczytania", "Choose a sheet to load")}</h3><p>{pendingWorkbook.file.name}</p><div>{pendingWorkbook.sheets.map((sheet) => <button key={sheet} onClick={() => { const file = pendingWorkbook.file; setPendingWorkbook(null); void performImport(file, sheet); }}><span>▦</span><strong>{sheet}</strong><i>›</i></button>)}</div><button className="secondary-button" onClick={() => setPendingWorkbook(null)}>{label("Anuluj", "Cancel")}</button></div></div>}

      {visibleToast && <button className="toast" onClick={() => setToast("")}><span>✓</span>{visibleToast}<i>×</i></button>}
      {commandOpen && <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-modal" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder={label("Wpisz polecenie…", "Type a command…")} /><kbd>ESC</kbd></div><div className="command-list"><small>{label("POLECENIA", "COMMANDS")}</small>{commands.map((command, index) => <button key={command.label} className={index === 0 ? "active" : ""} onClick={() => { command.action(); setCommandOpen(false); setCommandQuery(""); }}><span>›</span><strong>{command.label}</strong><small>{command.detail}</small></button>)}</div></div></div>}
      <SettingsDialog open={settingsOpen} showExplorer={showExplorer} showInspector={showInspector} showResults={bottomPanelMode !== "collapsed"} onShowExplorer={setShowExplorer} onShowInspector={setShowInspector} onShowResults={(visible) => setBottomPanelMode(visible ? "normal" : "collapsed")} onClose={() => setSettingsOpen(false)} onRestoreLayout={() => { setShowExplorer(true); setShowInspector(false); setBottomPanelMode("collapsed"); setExplorerWidth(DEFAULT_WORKSPACE_SIZES.explorerWidth); setInspectorWidth(DEFAULT_WORKSPACE_SIZES.inspectorWidth); setResultsHeight(DEFAULT_WORKSPACE_SIZES.resultsHeight); setCanvasPan({ x: 0, y: 0 }); }} />
      <ModelSettingsDialog open={modelSettingsOpen} tab={modelSettingsTab} columns={profiles.map(({ name, type }) => ({ name, type }))} parameters={modelParameters} memory={modelMemory} datasetName={datasetName} verification={verificationPreferences} diagnostics={diagnosticPreferences} onParametersChange={setModelParameters} onMemoryChange={setModelMemory} onVerificationChange={setVerificationPreferences} onDiagnosticsChange={setDiagnosticPreferences} onTabChange={setModelSettingsTab} onClose={() => setModelSettingsOpen(false)} />
      <HelpCenterDialog open={helpOpen} onClose={() => setHelpOpen(false)} onNavigate={openHelpDestination} />
    </main>
  );
}

function RangeControl({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="range-control"><span><small>{label}</small><strong>{value > 0 ? "+" : ""}{value}{suffix}</strong></span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ "--range-progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} /></label>;
}

function MetricCard({ label, value, delta, detail, spark, featured = false }: { label: string; value: string; delta?: number; detail?: string; spark: number[]; featured?: boolean }) {
  const points = spark.map((point, index) => `${index * 18},${48 - point * 0.45}`).join(" ");
  return <article className={`metric-card ${featured ? "featured" : ""}`}><div><span>{label}</span><strong>{value}</strong>{delta != null ? <small className={delta >= 0 ? "positive-text" : "negative-text"}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}% <em>vs bazowy</em></small> : <small><em>{detail}</em></small>}</div><div className="sparkline" aria-hidden="true"><svg viewBox="0 0 110 52" preserveAspectRatio="none"><polyline points={points} /></svg></div></article>;
}
