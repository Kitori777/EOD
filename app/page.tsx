"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

type ViewId = "model" | "data" | "paths" | "compare";
type BottomTab = "results" | "data" | "issues";
type NodeKind = "source" | "transform" | "decision" | "metric" | "result";
type DataRow = Record<string, string>;

type ModelNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  x: number;
  y: number;
};

type ModelEdge = { id: string; from: string; to: string; label?: string };

type Scenario = {
  id: string;
  name: string;
  priceChange: number;
  marketingChange: number;
  conversionChange: number;
  choices: { pricing: string; campaign: string; market: string };
};

type ColumnProfile = {
  name: string;
  type: "number" | "date" | "text";
  filled: number;
  unique: number;
  sample: string;
};

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

const navItems: Array<{ id: ViewId; icon: string; label: string; shortcut: string }> = [
  { id: "model", icon: "◇", label: "Model", shortcut: "1" },
  { id: "data", icon: "▦", label: "Dane", shortcut: "2" },
  { id: "paths", icon: "⑂", label: "Ścieżki", shortcut: "3" },
  { id: "compare", icon: "◫", label: "Porównaj", shortcut: "4" },
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

function getNumericAverage(rows: DataRow[], headers: string[], aliases: string[], fallback: number) {
  const header = headers.find((candidate) => aliases.some((alias) => candidate.toLowerCase().includes(alias)));
  if (!header) return fallback;
  const values = rows
    .map((row) => Number((row[header] ?? "").replace(",", ".")))
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

export default function Home() {
  const parsedSample = useMemo(() => parseCsv(sampleCsv), []);
  const [view, setView] = useState<ViewId>("model");
  const [bottomTab, setBottomTab] = useState<BottomTab>("results");
  const [rows, setRows] = useState<DataRow[]>(parsedSample.rows);
  const [headers, setHeaders] = useState<string[]>(parsedSample.headers);
  const [datasetName, setDatasetName] = useState("sprzedaz_2026.csv");
  const [nodes, setNodes] = useState<ModelNode[]>(initialNodes);
  const [edges, setEdges] = useState<ModelEdge[]>(initialEdges);
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);
  const [scenarioId, setScenarioId] = useState("growth");
  const [selectedNodeId, setSelectedNodeId] = useState("campaign");
  const [zoom, setZoom] = useState(0.9);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [toast, setToast] = useState("Gotowy model demonstracyjny");
  const [fileError, setFileError] = useState("");
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const profiles = useMemo(() => profileColumns(rows, headers), [rows, headers]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const baselineScenario = scenarios[0];

  const calculate = (item: Scenario) => {
    const baseRevenue = getNumericAverage(rows, headers, ["revenue", "sales", "przych", "obrót"], 476250);
    const baseCost = getNumericAverage(rows, headers, ["cost", "koszt", "expense"], 316750);
    const baseCustomers = getNumericAverage(rows, headers, ["customer", "klient", "users"], 1341);
    const priceEffect = 1 + item.priceChange / 100;
    const demandEffect = 1 - Math.max(item.priceChange, 0) * 0.004 + Math.min(item.priceChange, 0) * 0.002;
    const campaignEffect = item.choices.campaign === "4" ? 1.08 : 1.035;
    const marketEffect = item.choices.market === "9" ? 1.14 : 1.04;
    const marketingEffect = 1 + item.marketingChange * 0.0032;
    const conversionEffect = 1 + item.conversionChange / 100;
    const customers = Math.round(baseCustomers * demandEffect * campaignEffect * marketEffect * marketingEffect * conversionEffect);
    const revenue = baseRevenue * priceEffect * (customers / baseCustomers);
    const variableCost = baseCost * (0.72 + 0.28 * (customers / baseCustomers));
    const campaignCost = baseCost * Math.max(item.marketingChange, 0) * 0.0035;
    const expansionCost = item.choices.market === "9" ? 54000 : 16000;
    const cost = variableCost + campaignCost + expansionCost;
    const profit = revenue - cost;
    const margin = revenue ? (profit / revenue) * 100 : 0;
    const risk = Math.min(96, Math.max(8, 28 + item.marketingChange * 0.12 + (item.choices.market === "9" ? 10 : 2) - item.conversionChange * 0.18));
    return { revenue, cost, profit, margin, customers, risk };
  };

  const metrics = useMemo(() => calculate(scenario), [scenario, rows, headers]);
  const baselineMetrics = useMemo(() => calculate(baselineScenario), [baselineScenario, rows, headers]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("eyes-of-odin-workspace-v1");
      if (!saved) return;
      const state = JSON.parse(saved) as { nodes?: ModelNode[]; edges?: ModelEdge[]; scenarios?: Scenario[]; scenarioId?: string };
      if (state.nodes?.length) setNodes(state.nodes);
      if (state.edges?.length) setEdges(state.edges);
      if (state.scenarios?.length) setScenarios(state.scenarios);
      if (state.scenarioId) setScenarioId(state.scenarioId);
      setToast("Przywrócono ostatnią sesję");
    } catch {
      setToast("Uruchomiono bez zapisanej sesji");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("eyes-of-odin-workspace-v1", JSON.stringify({ nodes, edges, scenarios, scenarioId }));
  }, [nodes, edges, scenarios, scenarioId]);

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
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const updateScenario = (patch: Partial<Scenario>) => {
    setScenarios((current) => current.map((item) => (item.id === scenario.id ? { ...item, ...patch } : item)));
  };

  const updateChoice = (group: keyof Scenario["choices"], value: string) => {
    updateScenario({ choices: { ...scenario.choices, [group]: value } });
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError("");
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed.rows);
      setHeaders(parsed.headers);
      setDatasetName(file.name);
      setNodes((current) => current.map((node) => node.id === "source"
        ? { ...node, title: file.name, subtitle: `${parsed.rows.length} wierszy · ${parsed.headers.length} kolumn` }
        : node));
      setToast(`Wczytano ${parsed.rows.length} wierszy`);
      setView("data");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Nie udało się odczytać pliku.");
    } finally {
      event.target.value = "";
    }
  };

  const addNode = (kind: NodeKind) => {
    const anchor = selectedNode ?? nodes[nodes.length - 1];
    const id = `${kind}-${Date.now()}`;
    const next: ModelNode = {
      id,
      kind,
      title: `Nowa ${kindMeta[kind].label.toLowerCase()}`,
      subtitle: "Kliknij, aby skonfigurować",
      x: Math.min(930, anchor.x + 214),
      y: Math.min(500, Math.max(36, anchor.y + (nodes.length % 2 ? 112 : -74))),
    };
    setNodes((current) => [...current, next]);
    setEdges((current) => [...current, { id: `edge-${Date.now()}`, from: anchor.id, to: id }]);
    setSelectedNodeId(id);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
    setDrag({ id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    setNodes((current) => current.map((node) => node.id === drag.id
      ? { ...node, x: Math.max(10, drag.x + dx), y: Math.max(10, drag.y + dy) }
      : node));
  };

  const createScenario = () => {
    const id = `scenario-${Date.now()}`;
    const next = { ...scenario, id, name: `Wariant ${scenarios.length}` };
    setScenarios((current) => [...current, next]);
    setScenarioId(id);
    setToast("Utworzono wariant scenariusza");
  };

  const changeSelectedTitle = (title: string) => {
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, title } : node));
  };

  const commands = [
    { label: "Otwórz Model Studio", detail: "Widok grafu", action: () => setView("model") },
    { label: "Otwórz dane", detail: datasetName, action: () => setView("data") },
    { label: "Pokaż ścieżki decyzji", detail: "Decision Map", action: () => setView("paths") },
    { label: "Porównaj scenariusze", detail: "Bazowy vs aktywny", action: () => setView("compare") },
    { label: "Utwórz nowy wariant", detail: "Kopia aktywnego", action: createScenario },
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
    <div className="canvas-shell" ref={canvasRef} onPointerMove={handlePointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      <div className="canvas-dots" />
      <div className="canvas-stage" style={{ transform: `scale(${zoom})` }}>
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
      <div className="canvas-controls">
        <button onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} aria-label="Powiększ">+</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="Pomniejsz">−</button>
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
          <h2>{datasetName}</h2>
          <p>{rows.length} wierszy · {headers.length} kolumn · dane przetwarzane lokalnie</p>
        </div>
        <label className="primary-button file-button">
          Wczytaj inny CSV
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        </label>
      </div>
      {fileError && <div className="error-banner">{fileError}</div>}
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
    </div>
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
    return (
      <div className="compare-view">
        <div className="view-heading compact-heading"><div><span className="eyebrow">COMPARE</span><h2>Bazowy vs {scenario.name}</h2><p>Jedno miejsce do oceny efektów i kosztów decyzji.</p></div><button className="secondary-button" onClick={() => setToast("Raport porównania jest gotowy")}>Eksportuj raport</button></div>
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><strong>EYES OF ODIN</strong><small>SCENARIO STUDIO</small></div>
        <div className="project-breadcrumb"><span>Projekty</span><i>/</i><strong>Model wzrostu sprzedaży</strong><span className="saved-dot">● zapisano</span></div>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}><span>⌕</span> Szukaj lub uruchom polecenie <kbd>Ctrl K</kbd></button>
        <div className="top-actions"><button aria-label="Powiadomienia">○</button><button className="run-button" onClick={() => { setBottomTab("results"); setToast("Model przeliczony"); }}>▶ Uruchom</button></div>
      </header>

      <aside className="activity-bar">
        <div className="activity-main">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-label={item.label} title={`${item.label} (${item.shortcut})`}><span>{item.icon}</span><small>{item.label}</small></button>)}
        </div>
        <div className="activity-bottom"><button aria-label="Ustawienia"><span>⚙</span></button><button className="avatar" aria-label="Profil">SO</button></div>
      </aside>

      <section className="workbench">
        <div className="tabs-row">
          <div className="document-tabs"><button className="active"><span className="tab-glyph">◇</span> model_wzrostu.odin <i>×</i></button><button onClick={() => setView("data")}><span className="csv-glyph">▦</span> {datasetName} <i>×</i></button></div>
          <div className="scenario-switcher"><span>SCENARIUSZ</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={createScenario} aria-label="Dodaj scenariusz">＋</button></div>
        </div>

        <div className="main-grid">
          <aside className="explorer-panel">
            <div className="panel-title"><span>EKSPLORATOR</span><button aria-label="Więcej opcji">•••</button></div>
            <div className="project-tree">
              <div className="tree-project"><span>⌄</span><strong>MODEL WZROSTU</strong></div>
              <button className={view === "data" ? "tree-active" : ""} onClick={() => setView("data")}><i className="tree-line" /><span className="csv-glyph">▦</span><span>{datasetName}</span><small>{rows.length}</small></button>
              <div className="tree-group"><span>⌄</span> Modele</div>
              <button className={view === "model" ? "tree-active" : ""} onClick={() => setView("model")}><i className="tree-line" /><span>◇</span><span>Model wzrostu</span></button>
              <div className="tree-group"><span>⌄</span> Scenariusze</div>
              {scenarios.map((item) => <button key={item.id} className={scenarioId === item.id ? "tree-active" : ""} onClick={() => setScenarioId(item.id)}><i className="tree-line" /><span className={item.id === "baseline" ? "base-dot" : "variant-dot"}>●</span><span>{item.name}</span></button>)}
            </div>
            <div className="library-title"><span>BLOKI MODELU</span><small>przeciągnij lub kliknij</small></div>
            <div className="block-library">
              {(Object.keys(kindMeta) as NodeKind[]).map((kind) => <button key={kind} onClick={() => addNode(kind)}><span className={`block-icon node-${kind}`}>{kindMeta[kind].icon}</span><span><strong>{kindMeta[kind].label}</strong><small>{kind === "source" ? "CSV, Excel, API" : kind === "decision" ? "Rozgałęź ścieżkę" : kind === "metric" ? "Oblicz wynik" : "Przetwórz dane"}</small></span><i>＋</i></button>)}
            </div>
            <label className="import-drop"><span>＋</span><strong>Dodaj dane</strong><small>CSV do 25 MB</small><input type="file" accept=".csv,text/csv" onChange={handleFile} /></label>
          </aside>

          <section className="center-stage">
            <div className="stage-toolbar">
              <div><button className="active" aria-label="Zaznacz">↖</button><button aria-label="Przesuń">✥</button><span /><button onClick={() => addNode("transform")}>＋ Blok</button><button onClick={() => setToast("Wybierz dwa elementy, aby utworzyć relację")}>⌁ Relacja</button></div>
              <div className="model-health"><i /> Model gotowy <span>·</span> {nodes.length} bloków <span>·</span> {edges.length} relacji</div>
            </div>
            {view === "model" && renderModel()}
            {view === "data" && renderData()}
            {view === "paths" && renderPaths()}
            {view === "compare" && renderCompare()}
          </section>

          <aside className="inspector-panel">
            <div className="panel-title"><span>INSPEKTOR</span><button aria-label="Zamknij">×</button></div>
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
          </aside>

          <section className="bottom-panel">
            <div className="bottom-tabs">
              <button className={bottomTab === "results" ? "active" : ""} onClick={() => setBottomTab("results")}>WYNIKI <span>4</span></button>
              <button className={bottomTab === "data" ? "active" : ""} onClick={() => setBottomTab("data")}>DANE</button>
              <button className={bottomTab === "issues" ? "active" : ""} onClick={() => setBottomTab("issues")}>PROBLEMY <span className="issue-zero">0</span></button>
              <div className="bottom-actions"><span>Ostatnie przeliczenie: teraz</span><button aria-label="Maksymalizuj">⌃</button><button aria-label="Zamknij">×</button></div>
            </div>
            {bottomTab === "results" && <div className="metrics-strip">
              <MetricCard label="Przychód" value={formatMoney(metrics.revenue)} delta={(metrics.revenue / baselineMetrics.revenue - 1) * 100} spark={[38, 43, 41, 48, 54, 62, 69]} />
              <MetricCard label="Koszt" value={formatMoney(metrics.cost)} delta={(metrics.cost / baselineMetrics.cost - 1) * 100} spark={[35, 36, 42, 45, 51, 49, 56]} />
              <MetricCard label="Zysk" value={formatMoney(metrics.profit)} delta={(metrics.profit / baselineMetrics.profit - 1) * 100} spark={[28, 31, 39, 42, 51, 62, 74]} featured />
              <MetricCard label="Marża" value={`${metrics.margin.toFixed(1)}%`} delta={metrics.margin - baselineMetrics.margin} spark={[42, 38, 47, 51, 56, 61, 66]} />
            </div>}
            {bottomTab === "data" && <div className="bottom-message"><strong>{datasetName}</strong><span>{rows.length} wierszy · {headers.length} kolumn · {profiles.filter((item) => item.type === "number").length} pól liczbowych</span><button onClick={() => setView("data")}>Otwórz Data Studio</button></div>}
            {bottomTab === "issues" && <div className="bottom-message success"><strong>✓ Model nie zawiera problemów blokujących</strong><span>Wszystkie użyte pola są dostępne, a ścieżka ma wynik końcowy.</span></div>}
          </section>
        </div>
      </section>

      <footer className="statusbar"><div><span>◇ main</span><span>↻</span><span className="status-ok">✓ 0</span><span>△ 0</span></div><div><span>{rows.length} rekordów</span><span>UTF-8</span><span>CSV</span><span>Eyes Engine 0.1</span><span className="status-live">● lokalnie</span></div></footer>

      {toast && <button className="toast" onClick={() => setToast("")}><span>✓</span>{toast}<i>×</i></button>}
      {commandOpen && <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}><div className="command-modal" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><span>⌕</span><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Wpisz polecenie…" /><kbd>ESC</kbd></div><div className="command-list"><small>POLECENIA</small>{commands.map((command, index) => <button key={command.label} className={index === 0 ? "active" : ""} onClick={() => { command.action(); setCommandOpen(false); setCommandQuery(""); }}><span>›</span><strong>{command.label}</strong><small>{command.detail}</small></button>)}</div></div></div>}
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
