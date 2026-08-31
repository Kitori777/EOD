import { useEffect, useMemo, useState } from "react";

import { useI18n } from "../../../app/i18n/translations";
import { ChartRenderer } from "../../charts/components/ChartRenderer";
import type { ChartColumn, ChartDefinition, DataRow } from "../../charts/types/chart-types";
import { buildForecast } from "../engine/forecast-engine";
import { executeWhatIfModel } from "../engine/what-if-engine";
import type { FieldImpact, ForecastMethod, WhatIfScenario } from "../types/simulation-types";
import { describeProductionField } from "../../modeling/engine/production-field-engine";
import { describeMemoryChange, modelMemoryToScenario } from "../../modeling/engine/model-memory-engine";
import type { ModelDependencyRule, ModelEdge, ModelMemoryEntry, ModelNode, ModelParameter } from "../../modeling/types/model-types";

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  scenarios: WhatIfScenario[];
  activeScenarioId: string;
  sampled: boolean;
  nodes: ModelNode[];
  edges: ModelEdge[];
  dependencyRules: ModelDependencyRule[];
  modelParameters: ModelParameter[];
  modelMemory: ModelMemoryEntry[];
  onChange: (scenarios: WhatIfScenario[]) => void;
  onActiveChange: (id: string) => void;
  onDependencyChange: (rules: ModelDependencyRule[]) => void;
};

const operationIds: WhatIfScenario["operation"][] = ["percent", "add", "subtract", "multiply", "set"];
const MAX_PREVIEW_POINTS = 800;

let evaluationCache: {
  rows: DataRow[];
  columnsKey: string;
  scenario: WhatIfScenario;
  nodes: ModelNode[];
  edges: ModelEdge[];
  dependencyRules: ModelDependencyRule[];
  modelParameters: ModelParameter[];
  language: "pl" | "en";
  result: ReturnType<typeof executeWhatIfModel>;
} | null = null;

function cachedEvaluation(rows: DataRow[], columns: ChartColumn[], scenario: WhatIfScenario, nodes: ModelNode[], edges: ModelEdge[], dependencyRules: ModelDependencyRule[], modelParameters: ModelParameter[], language: "pl" | "en") {
  const columnsKey = columns.map((column) => `${column.name}:${column.type}`).join("\u0000");
  if (evaluationCache
    && evaluationCache.rows === rows
    && evaluationCache.columnsKey === columnsKey
    && evaluationCache.scenario === scenario
    && evaluationCache.nodes === nodes
    && evaluationCache.edges === edges
    && evaluationCache.dependencyRules === dependencyRules
    && evaluationCache.modelParameters === modelParameters
    && evaluationCache.language === language) return evaluationCache.result;
  const result = executeWhatIfModel(rows, columns, scenario, nodes, edges, dependencyRules, modelParameters, language);
  evaluationCache = { rows, columnsKey, scenario, nodes, edges, dependencyRules, modelParameters, language, result };
  return result;
}

function previewIndexes(length: number): number[] {
  if (length <= MAX_PREVIEW_POINTS) return Array.from({ length }, (_, index) => index);
  const last = length - 1;
  return Array.from({ length: MAX_PREVIEW_POINTS }, (_, index) => Math.round(index * last / (MAX_PREVIEW_POINTS - 1)));
}

function createScenario(columns: ChartColumn[], rows: DataRow[], index: number, language: "pl" | "en" = "pl"): WhatIfScenario {
  const numeric = columns.filter((column) => column.type === "number");
  const varying = numeric.filter((column) => new Set(rows.slice(0, 5000).map((row) => row[column.name]).filter((value) => value !== null && value !== undefined && value !== "")).size > 1);
  const inputField = varying[0]?.name ?? numeric[0]?.name ?? "";
  return {
    id: `what-if-${Date.now()}-${index}`,
    name: `${language === "en" ? "Scenario" : "Scenariusz"} ${index + 1}`,
    inputField,
    operation: "percent",
    value: 10,
    scope: { kind: "all" },
    outputFields: [],
    estimateOutputs: true,
    responseMode: "auto",
    econometricModel: "auto",
    econometricMaxLag: 12,
  };
}

type ImpactFilter = "changed" | "unchanged" | "all";

function hasChanged(impact: FieldImpact): boolean {
  return Math.abs(impact.difference) > 1e-9;
}

function responseLabel(impact: FieldImpact, language: "pl" | "en"): string {
  if (impact.response === "direct") return language === "en" ? "Direct change" : "Zmiana bezpośrednia";
  if (impact.response === "estimated") return language === "en" ? "Estimated from history" : "Estymacja z historii";
  if (impact.response === "propagated") return language === "en" ? "Recalculated from an earlier stage" : "Przeliczone z wcześniejszego etapu";
  if (impact.quality === "low") return language === "en" ? "No change · insufficient fit" : "Brak zmiany · niewystarczające dopasowanie";
  if (impact.quality === "unavailable") return language === "en" ? "No change · no pattern in data" : "Brak zmiany · brak wzorca w danych";
  return language === "en" ? "No detected change" : "Bez wykrytej zmiany";
}

export function WhatIfStudio({ rows, columns, scenarios, activeScenarioId, sampled, nodes, edges, dependencyRules, modelParameters, modelMemory, onChange, onActiveChange, onDependencyChange }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const localizeEngineText = (value: string) => language !== "en" ? value : value
    .replace("Dokładna formuła z bloku", "Exact formula from block")
    .replace("Potwierdzona tożsamość produkcyjna: korekta = nastawa − wartość procesu", "Confirmed production identity: correction = setpoint − process value")
    .replace("Zgodna rola sygnałów", "Matching signal roles")
    .replace("Wzorzec historyczny", "Historical pattern")
    .replace("Silny wzorzec historyczny", "Strong historical pattern")
    .replace("błąd walidacji", "validation error")
    .replace("R² walidacji", "validation R²")
    .replace("MAE walidacji", "validation MAE")
    .replace("p po wyborze", "p after selection")
    .replace("próba", "sample")
    .replace("Część relacji rozpoznano po nazwach, ale nie ma dość zmienności, aby bezpiecznie policzyć ich wpływ. Możesz dodać ręczny współczynnik.", "Some relationships were recognized from field names, but there is not enough variation to calculate their impact safely. You can add a manual coefficient.");
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const numeric = columns.filter((column) => column.type === "number");
  const dates = columns.filter((column) => column.type === "date");
  const scenario = scenarios.find((item) => item.id === activeScenarioId) ?? scenarios[0];
  const [forecastMethod, setForecastMethod] = useState<ForecastMethod>("linear");
  const [forecastHorizon, setForecastHorizon] = useState(6);
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>("changed");
  const [previewField, setPreviewField] = useState("");
  const update = (patch: Partial<WhatIfScenario>) => {
    if (!scenario) return;
    onChange(scenarios.map((item) => item.id === scenario.id ? { ...item, ...patch } : item));
  };
  const evaluation = useMemo(() => scenario ? cachedEvaluation(rows, columns, scenario, nodes, edges, dependencyRules, modelParameters, language) : null, [rows, columns, scenario, nodes, edges, dependencyRules, modelParameters, language]);
  const result = evaluation?.direct ?? null;
  const orderedImpacts = useMemo(() => [...(result?.impacts ?? [])].sort((left, right) => {
    const leftChanged = hasChanged(left);
    const rightChanged = hasChanged(right);
    if (leftChanged !== rightChanged) return leftChanged ? -1 : 1;
    const leftPercent = Math.abs(left.percent ?? 0);
    const rightPercent = Math.abs(right.percent ?? 0);
    return rightPercent - leftPercent || left.field.localeCompare(right.field, "pl");
  }), [result]);
  const visibleImpacts = useMemo(() => orderedImpacts.filter((impact) => impactFilter === "all" || (impactFilter === "changed" ? hasChanged(impact) : !hasChanged(impact))), [orderedImpacts, impactFilter]);
  useEffect(() => {
    if (!orderedImpacts.length) return;
    if (!orderedImpacts.some((impact) => impact.field === previewField)) {
      setPreviewField(orderedImpacts.find((impact) => impact.response === "estimated")?.field ?? orderedImpacts[0].field);
    }
  }, [orderedImpacts, previewField]);
  const previewIndex = orderedImpacts.findIndex((impact) => impact.field === previewField);
  const shownPreviewField = previewField || scenario?.inputField || numeric[0]?.name || "";
  const econometricImpact = orderedImpacts.find((impact) => impact.field === shownPreviewField && impact.modelType)
    ?? orderedImpacts.find((impact) => impact.modelType);
  const xField = dates[0]?.name ?? "__row";
  const comparisonRows = useMemo(() => {
    if (!result || !shownPreviewField) return [];
    const indexes = previewIndexes(Math.min(rows.length, result.rows.length));
    const base = indexes.map((index) => ({ ...rows[index], __row: String(index + 1), __variant: tr("Bazowe", "Baseline") }));
    const changed = indexes.map((index) => ({ ...result.rows[index], __row: String(index + 1), __variant: tr("Po zmianie", "After change") }));
    return [...base, ...changed];
  }, [rows, result, shownPreviewField, language]);
  const previewColumns = useMemo(() => [...columns, { name: "__row", type: "number" as const }, { name: "__variant", type: "text" as const }], [columns]);
  const comparisonChart: ChartDefinition = {
    id: "what-if-preview",
    title: `${shownPreviewField || tr("Wartość", "Value")}: ${tr("bazowe i po zmianie", "baseline vs after change")}`,
    datasetId: "what-if",
    type: "line",
    xField,
    yFields: shownPreviewField ? [shownPreviewField] : [],
    seriesField: "__variant",
    aggregation: "average",
    filters: [],
    thresholds: [],
    size: "large",
    presentation: { showBrush: true, showZoom: true, showSymbols: false, lineCurve: "straight" },
  };
  const forecast = useMemo(() => {
    if (!result || !dates[0] || !shownPreviewField) return null;
    return buildForecast(result.rows, { timeField: dates[0].name, valueField: shownPreviewField, method: forecastMethod, horizon: forecastHorizon });
  }, [result, dates, shownPreviewField, forecastMethod, forecastHorizon]);
  const forecastRows = useMemo(() => {
    if (!forecast) return [];
    const observed = previewIndexes(forecast.observed.length).map((index) => forecast.observed[index]).map((point) => ({ __time: point.x, __value: String(point.value), __series: tr("Dane po zmianie", "Data after change") }));
    const bridge = forecast.observed.at(-1);
    const predicted = [...(bridge ? [{ __time: bridge.x, __value: String(bridge.value), __series: tr("Prognoza", "Forecast") }] : []), ...forecast.forecast.map((point) => ({ __time: point.x, __value: String(point.value), __series: tr("Prognoza", "Forecast") }))];
    const lower = forecast.forecast.map((point) => ({ __time: point.x, __value: String(point.lower), __series: tr("Dolna granica", "Lower bound") }));
    const upper = forecast.forecast.map((point) => ({ __time: point.x, __value: String(point.upper), __series: tr("Górna granica", "Upper bound") }));
    return [...observed, ...predicted, ...lower, ...upper];
  }, [forecast, language]);
  const forecastChart: ChartDefinition = {
    id: "what-if-forecast",
    title: `${tr("Prognoza", "Forecast")}: ${shownPreviewField}`,
    datasetId: "what-if",
    type: "line",
    xField: "__time",
    yFields: ["__value"],
    seriesField: "__series",
    aggregation: "average",
    filters: [],
    thresholds: [],
    size: "large",
    presentation: { showZoom: true, showSymbols: false, lineCurve: "straight" },
  };

  if (!scenario) return <div className="what-if-empty"><span>◇</span><h2>{tr("Laboratorium „Co-jeśli”", "What-if lab")}</h2><p>{tr("Utwórz scenariusz, aby sprawdzić wpływ zmiany na pozostałe dane.", "Create a scenario to see how a change affects the remaining data.")}</p><button className="primary-button" disabled={!numeric.length} onClick={() => { const next = createScenario(columns, rows, 0, language); onChange([next]); onActiveChange(next.id); }}>{tr("Utwórz pierwszą symulację", "Create the first simulation")}</button></div>;

  const groupValues = scenario.scope.field ? [...new Set(rows.map((row) => row[scenario.scope.field!] ?? "").filter(Boolean))].slice(0, 250) : [];
  const automaticDependencies = evaluation?.direct.dependencies.filter((rule) => rule.automatic) ?? [];
  const activeAutomatic = automaticDependencies.filter((rule) => rule.enabled);
  const suggestedAutomatic = automaticDependencies.filter((rule) => !rule.enabled);
  const addDependency = () => {
    const sourceField = scenario.inputField || numeric[0]?.name;
    const targetField = numeric.find((column) => column.name !== sourceField)?.name;
    if (!sourceField || !targetField) return;
    onDependencyChange([...dependencyRules, {
      id: `manual-dependency-${Date.now()}`,
      sourceField,
      targetField,
      method: "manual",
      sensitivity: 1,
      lagSteps: 0,
      enabled: true,
      confidence: "high",
      evidence: tr("Relacja ustawiona przez użytkownika", "Relationship set by the user"),
    }]);
  };
  const updateDependency = (id: string, patch: Partial<ModelDependencyRule>) => onDependencyChange(dependencyRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  const useMemory = (entry: ModelMemoryEntry, index: number) => {
    const next = modelMemoryToScenario(entry, index);
    onChange([...scenarios, next]);
    onActiveChange(next.id);
  };
  return <div className="what-if-view">
    <div className="view-heading compact-heading"><div><span className="eyebrow">WHAT-IF LAB</span><h2>{tr("Sprawdź, co zmieni się w danych", "See what changes in the data")}</h2><p>{tr("Oryginał pozostaje bez zmian.", "The original remains unchanged.")} {tr("Scenariusz, zakres, relacje i", "The scenario, scope, relationships and")} {modelParameters.length} {modelParameters.length === 1 ? tr("parametr modelu", "model parameter") : tr("parametrów modelu", "model parameters")} {tr("zapisują się razem z projektem.", "are saved with the project.")}</p></div><div className="scenario-actions"><span className="scenario-save-state">✓ {tr("zapisany lokalnie", "saved locally")}</span><select value={scenario.id} onChange={(event) => onActiveChange(event.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => { const next = createScenario(columns, rows, scenarios.length, language); onChange([...scenarios, next]); onActiveChange(next.id); }}>＋ {tr("Scenariusz", "Scenario")}</button>{scenarios.length > 1 && <button onClick={() => { const remaining = scenarios.filter((item) => item.id !== scenario.id); onChange(remaining); onActiveChange(remaining[0].id); }}>{tr("Usuń", "Delete")}</button>}</div></div>
    {sampled && <div className="analysis-notice">{tr("Obliczenia interaktywne korzystają z zapisanej próby analitycznej do 50 000 rekordów.", "Interactive calculations use the saved analytical sample of up to 50,000 records.")}</div>}
    {modelMemory.some((entry) => entry.enabled && entry.availableInSimulation) && <section className="memory-scenario-strip"><div><span>{tr("PAMIĘĆ MODELU", "MODEL MEMORY")}</span><strong>{tr("Użyj zapisanego zachowania jako scenariusza", "Use saved behavior as a scenario")}</strong><small>{tr("Zakres czasu i wartość zostaną przepisane automatycznie. Wpisy włączone do obliczeń są już częścią wartości bazowych.", "The time range and value will be copied automatically. Entries enabled for calculations are already part of the baseline values.")}</small></div><div>{modelMemory.filter((entry) => entry.enabled && entry.availableInSimulation).map((entry, index) => <button key={entry.id} disabled={entry.useInModel} title={entry.useInModel ? tr("Ta zmiana jest już uwzględniona w danych bazowych modelu", "This change is already included in the model baseline") : tr("Utwórz nowy scenariusz z tego wpisu", "Create a new scenario from this entry")} onClick={() => useMemory(entry, index)}><b>{entry.name}</b><span>{describeMemoryChange(entry)}</span><i>{entry.useInModel ? tr("W bazie ✓", "In baseline ✓") : tr("Użyj →", "Use →")}</i></button>)}</div></section>}
    <section className="what-if-config">
      <label>{tr("Nazwa scenariusza", "Scenario name")}<input value={scenario.name} onChange={(event) => update({ name: event.target.value })} /></label>
      <label>{tr("Co zmieniasz", "What do you change?")}<select value={scenario.inputField} onChange={(event) => update({ inputField: event.target.value, outputFields: scenario.outputFields.filter((field) => field !== event.target.value) })}>{numeric.map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
      <label>{tr("Operacja", "Operation")}<select value={scenario.operation} onChange={(event) => update({ operation: event.target.value as WhatIfScenario["operation"] })}>{operationIds.map((operation) => <option key={operation} value={operation}>{operation === "percent" ? tr("Zmień o procent", "Change by percent") : operation === "add" ? tr("Dodaj wartość", "Add value") : operation === "subtract" ? tr("Odejmij wartość", "Subtract value") : operation === "multiply" ? tr("Pomnóż przez", "Multiply by") : tr("Ustaw wartość", "Set value")}</option>)}</select></label>
      <label>{tr("Wartość", "Value")}<input type="number" value={scenario.value} onChange={(event) => update({ value: Number(event.target.value) })} /></label>
      <label>{tr("Zakres", "Scope")}<select value={scenario.scope.kind} onChange={(event) => update({ scope: { kind: event.target.value as WhatIfScenario["scope"]["kind"] } })}><option value="all">{tr("Wszystkie rekordy", "All records")}</option><option value="group">{tr("Wybrana grupa", "Selected group")}</option><option value="time">{tr("Zakres czasu", "Time range")}</option></select></label>
      {scenario.scope.kind === "group" && <><label>{tr("Kolumna grupy", "Group field")}<select value={scenario.scope.field ?? ""} onChange={(event) => update({ scope: { kind: "group", field: event.target.value, value: "" } })}><option value="">{tr("Wybierz…", "Choose…")}</option>{columns.filter((column) => column.name !== scenario.inputField).map((column) => <option key={column.name}>{column.name}</option>)}</select></label><label>{tr("Grupa", "Group")}<select value={scenario.scope.value ?? ""} onChange={(event) => update({ scope: { ...scenario.scope, value: event.target.value } })}>{groupValues.map((value) => <option key={value}>{value}</option>)}</select></label></>}
      {scenario.scope.kind === "time" && <><label>{tr("Kolumna czasu", "Time field")}<select value={scenario.scope.field ?? ""} onChange={(event) => update({ scope: { kind: "time", field: event.target.value } })}><option value="">{tr("Wybierz…", "Choose…")}</option>{dates.map((column) => <option key={column.name}>{column.name}</option>)}</select></label><label>{tr("Od", "From")}<input type="datetime-local" value={scenario.scope.from ?? ""} onChange={(event) => update({ scope: { ...scenario.scope, from: event.target.value } })} /></label><label>{tr("Do", "To")}<input type="datetime-local" value={scenario.scope.to ?? ""} onChange={(event) => update({ scope: { ...scenario.scope, to: event.target.value } })} /></label></>}
    </section>
    <section className="econometric-model-choice">
      <header><div><span>{tr("ZACHOWANIE PROCESU", "PROCESS BEHAVIOR")}</span><strong>{tr("Wybierz jednym kliknięciem, jak model ma szukać reakcji", "Choose how the model should look for a response")}</strong><small>{tr("Wynik przelicza się od razu. Automat jest najlepszym punktem startowym, a ręczny wybór nie ukryje słabego dopasowania.", "The result recalculates immediately. Automatic is the best starting point, and a manual choice will not hide a weak fit.")}</small></div><label>{tr("Maksymalne opóźnienie", "Maximum delay")}<select value={scenario.econometricMaxLag ?? 12} onChange={(event) => update({ econometricMaxLag: Number(event.target.value) as WhatIfScenario["econometricMaxLag"] })}><option value="0">{tr("Bez opóźnienia", "No delay")}</option><option value="3">{tr("Do 3 rekordów", "Up to 3 records")}</option><option value="6">{tr("Do 6 rekordów", "Up to 6 records")}</option><option value="12">{tr("Do 12 rekordów (zalecane)", "Up to 12 records (recommended)")}</option><option value="24">{tr("Do 24 rekordów", "Up to 24 records")}</option></select></label></header>
      <div className="econometric-choice-grid">
        <button type="button" className={(scenario.econometricModel ?? "auto") === "auto" ? "active" : ""} onClick={() => update({ econometricModel: "auto" })}><b>{tr("Dobierz automatycznie", "Select automatically")}</b><span>{tr("Porównaj wszystkie metody", "Compare all methods")}</span><small>OLS · ARX · ARX + trend</small></button>
        <button type="button" className={scenario.econometricModel === "ols" ? "active" : ""} onClick={() => update({ econometricModel: "ols" })}><b>{tr("Reakcja natychmiastowa", "Immediate response")}</b><span>{tr("Bez pamięci poprzedniego wyniku", "Without previous-outcome memory")}</span><small>OLS</small></button>
        <button type="button" className={scenario.econometricModel === "arx" ? "active" : ""} onClick={() => update({ econometricModel: "arx" })}><b>{tr("Proces z bezwładnością", "Process with inertia")}</b><span>{tr("Poprzedni wynik wpływa na kolejny", "The previous outcome affects the next")}</span><small>ARX</small></button>
        <button type="button" className={scenario.econometricModel === "arx-trend" ? "active" : ""} onClick={() => update({ econometricModel: "arx-trend" })}><b>{tr("Bezwładność i trend", "Inertia and trend")}</b><span>{tr("Oddziel również zmianę w czasie", "Also separate change over time")}</span><small>ARX + trend</small></button>
      </div>
      {econometricImpact && <div className="econometric-choice-result"><span>✓ {tr("Aktywny wynik", "Active result")}</span><strong>{econometricImpact.modelType === "arx-trend" ? "ARX + trend" : econometricImpact.modelType?.toUpperCase()} · {tr("opóźnienie", "delay")} {econometricImpact.selectedLagSteps ?? 0}</strong><small>{tr("Sprawdzono", "Tested")} {econometricImpact.testedSpecifications ?? 1} {(econometricImpact.testedSpecifications ?? 1) === 1 ? tr("specyfikację", "specification") : tr("specyfikacji", "specifications")} · q {econometricImpact.adjustedPValue == null ? "—" : econometricImpact.adjustedPValue < .001 ? "< 0.001" : econometricImpact.adjustedPValue.toFixed(3)} · {econometricImpact.quality === "high" ? tr("stabilna relacja", "stable relationship") : econometricImpact.quality === "medium" ? tr("do obserwacji", "monitor") : tr("za słaba do automatycznego wpływu", "too weak for automatic impact")}</small></div>}
      {result && !econometricImpact && <div className="econometric-choice-result inactive"><span>○ {tr("Brak aktywnej estymacji", "No active estimate")}</span><strong>{tr("Wybrana metoda nie znalazła stabilnej reakcji", "The selected method found no stable response")}</strong><small>{tr("Pozostałe kolumny nie zostaną zmienione bez potwierdzonej relacji albo ręcznego współczynnika.", "Other fields will not change without a confirmed relationship or a manual coefficient.")}</small></div>}
      {result && !econometricImpact && <div className="econometric-choice-result inactive"><span>○ {tr("Brak aktywnej estymacji", "No active estimate")}</span><strong>{tr("Wybrana metoda nie znalazła stabilnej reakcji", "The selected method found no stable response")}</strong><small>{tr("Pozostałe kolumny nie zostaną zmienione bez potwierdzonej relacji albo ręcznego współczynnika.", "Other fields will not change without a confirmed relationship or a manual coefficient.")}</small></div>}
    </section>
    <section className="what-if-outputs"><div><strong>{tr("Które kolumny przeanalizować?", "Which fields should be analyzed?")}</strong><span>{tr("Tryb automatyczny sprawdza każdą kolumnę liczbową i pokazuje również brak wykrytej zmiany.", "Automatic mode checks every numeric field and also shows when no change is detected.")}</span></div><div className="response-mode"><button className={(scenario.responseMode ?? "auto") === "auto" ? "active" : ""} onClick={() => update({ responseMode: "auto", estimateOutputs: true })}>{tr("Wszystkie automatycznie", "All automatically")}</button><button className={scenario.responseMode === "manual" ? "active" : ""} onClick={() => update({ responseMode: "manual", estimateOutputs: true })}>{tr("Własny wybór", "Custom selection")}</button></div>{scenario.responseMode === "manual" && <div className="response-fields">{numeric.filter((column) => column.name !== scenario.inputField).map((column) => <button key={column.name} className={scenario.outputFields.includes(column.name) ? "active" : ""} onClick={() => update({ outputFields: scenario.outputFields.includes(column.name) ? scenario.outputFields.filter((field) => field !== column.name) : [...scenario.outputFields, column.name] })}>{scenario.outputFields.includes(column.name) ? "✓" : "+"} {column.name}</button>)}</div>}</section>
    <section className="dependency-map">
      <header><div><span>{tr("MAPA WPŁYWU", "IMPACT MAP")}</span><strong>{tr("Jak zmiana przechodzi do kolejnych kolumn", "How the change propagates to other fields")}</strong><small>{tr("Formuły są dokładne. Zależności historyczne i ręczne mają zawsze pokazane źródło.", "Formulas are exact. Historical and manual relationships always show their source.")}</small></div><button onClick={addDependency}>＋ {tr("Dodaj relację", "Add relationship")}</button></header>
      <div className="dependency-summary"><article><strong>{activeAutomatic.length}</strong><span>{tr("aktywnych automatycznie", "active automatically")}</span></article><article><strong>{dependencyRules.length}</strong><span>{tr("ustawionych ręcznie", "set manually")}</span></article><article><strong>{suggestedAutomatic.length}</strong><span>{tr("wymaga współczynnika", "needs a coefficient")}</span></article></div>
      {dependencyRules.length > 0 && <div className="dependency-editor">{dependencyRules.map((rule) => <div className="dependency-editor-row" key={rule.id}>
        <label>{tr("Od", "From")}<select value={rule.sourceField} onChange={(event) => updateDependency(rule.id, { sourceField: event.target.value })}>{numeric.map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
        <i>→</i>
        <label>{tr("Do", "To")}<select value={rule.targetField} onChange={(event) => updateDependency(rule.id, { targetField: event.target.value })}>{numeric.filter((column) => column.name !== rule.sourceField).map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
        <label>{tr("Wpływ", "Impact")}<input type="number" step="0.01" value={rule.sensitivity ?? 1} onChange={(event) => updateDependency(rule.id, { sensitivity: Number(event.target.value) })} /></label>
        <label>{tr("Opóźnienie", "Delay")}<input type="number" min="0" step="1" value={rule.lagSteps} onChange={(event) => updateDependency(rule.id, { lagSteps: Math.max(0, Number(event.target.value)) })} /></label>
        <label className="dependency-toggle"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateDependency(rule.id, { enabled: event.target.checked })} /> {tr("aktywna", "active")}</label>
        <button className="remove-dependency" aria-label={tr("Usuń relację", "Delete relationship")} onClick={() => onDependencyChange(dependencyRules.filter((item) => item.id !== rule.id))}>×</button>
      </div>)}</div>}
      {(activeAutomatic.length > 0 || suggestedAutomatic.length > 0) && <div className="recognized-dependencies">{[...activeAutomatic, ...suggestedAutomatic].slice(0, 12).map((rule) => <div key={rule.id} className={rule.enabled ? "active" : "suggested"}><span>{rule.enabled ? "✓" : "?"}</span><div><strong>{rule.sourceField} <i>→</i> {rule.targetField}</strong><small>{localizeEngineText(rule.evidence)}{rule.lagSteps ? ` · ${tr("opóźnienie", "delay")} ${rule.lagSteps} ${tr("rekordów", "records")}` : ""}</small></div><b>{rule.method === "formula" ? tr("FORMUŁA", "FORMULA") : rule.enabled ? tr("DANE", "DATA") : tr("DO USTAWIENIA", "SET UP")}</b></div>)}</div>}
    </section>
    {result && <>
      <section className="impact-summary"><article><span>{tr("Zmienione rekordy", "Changed records")}</span><strong>{result.affectedRows.toLocaleString(locale)}</strong><small>{tr("z", "of")} {rows.length.toLocaleString(locale)}</small></article><article><span>{tr("Przeanalizowane kolumny", "Analyzed fields")}</span><strong>{evaluation?.facts.analyzedFields ?? result.impacts.length}</strong><small>{tr("wszystkie liczbowe", "all numeric")}</small></article><article><span>{tr("Kolumny ze zmianą", "Fields with a change")}</span><strong>{evaluation?.facts.changedFields ?? result.impacts.filter(hasChanged).length}</strong><small>{tr("wartość lub estymacja", "value or estimate")}</small></article><article><span>{tr("Bez wykrytej reakcji", "No detected response")}</span><strong>{evaluation?.facts.unchangedFields ?? result.impacts.filter((impact) => !hasChanged(impact)).length}</strong><small>{tr("pozostają widoczne", "remain visible")}</small></article></section>
      {result.warnings.length > 0 && <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>! {localizeEngineText(warning)}</span>)}</div>}
      {evaluation?.facts.extrapolated && <div className="analysis-warnings"><span>! {tr("Zmieniona wartość wychodzi poza zakres występujący w danych historycznych.", "The changed value falls outside the range found in historical data.")}</span></div>}
      {result.propagation.length > 0 && <section className="propagation-trace"><header><span>{tr("PRZEBIEG ZMIANY", "CHANGE FLOW")}</span><strong>{tr("Efekt przechodzi przez", "The effect passes through")} {result.propagation.length} {result.propagation.length === 1 ? tr("etap", "stage") : result.propagation.length >= 2 && result.propagation.length <= 4 ? tr("etapy", "stages") : tr("etapów", "stages")}</strong></header><div>{result.propagation.map((step) => <article key={`${step.order}-${step.ruleId}`}><b>{String(step.order).padStart(2, "0")}</b><div><strong>{step.sourceField} <i>→</i> {step.targetField}</strong><span>{describeProductionField(step.targetField, language)}</span><small>{localizeEngineText(step.evidence)}</small></div><div className="propagation-value"><strong>{step.difference >= 0 ? "+" : ""}{formatter.format(step.difference)}</strong><span>{step.percent == null ? "—" : `${step.percent >= 0 ? "+" : ""}${formatter.format(step.percent)}%`}</span><small>{step.lagSteps ? `${tr("po", "after")} ${step.lagSteps} ${step.lagSteps === 1 ? tr("rekordzie", "record") : tr("rekordach", "records")}` : tr("bez opóźnienia", "no delay")}</small></div></article>)}</div></section>}
      {econometricImpact && <section className="econometric-panel"><header><div><span>{tr("KONTROLA EKONOMETRYCZNA", "ECONOMETRIC CHECK")}</span><strong>{scenario.inputField} <i>→</i> {econometricImpact.field}</strong><small>{tr("Model uczy się na wcześniejszych rekordach, a sprawdza na późniejszych.", "The model learns from earlier records and is checked on later records.")}</small></div><b className={`econometric-status ${econometricImpact.quality}`}>{econometricImpact.quality === "high" ? tr("stabilna relacja", "stable relationship") : econometricImpact.quality === "medium" ? tr("relacja do obserwacji", "relationship to monitor") : tr("słaba relacja", "weak relationship")}</b></header><div className="econometric-grid"><article><span>{tr("Efekt β", "Effect β")}</span><strong>{formatter.format(econometricImpact.sensitivity ?? 0)}</strong><small>β stand. {econometricImpact.standardizedCoefficient == null ? "—" : formatter.format(econometricImpact.standardizedCoefficient)} · 95% CI {formatter.format(econometricImpact.confidenceLower ?? 0)} … {formatter.format(econometricImpact.confidenceUpper ?? 0)}</small></article><article><span>{tr("Istotność po kontroli wielu kolumn", "Significance after multiple-field control")}</span><strong>q {econometricImpact.adjustedPValue == null ? "—" : econometricImpact.adjustedPValue < .001 ? "< 0.001" : econometricImpact.adjustedPValue.toFixed(3)}</strong><small>p {econometricImpact.pValue == null ? "—" : econometricImpact.pValue < .001 ? "< 0.001" : econometricImpact.pValue.toFixed(3)} · SE {econometricImpact.standardError == null ? "—" : formatter.format(econometricImpact.standardError)}</small></article><article><span>{tr("Sprawdzenie na przyszłości", "Later-period validation")}</span><strong>R² {econometricImpact.validationRSquared == null ? "—" : formatter.format(econometricImpact.validationRSquared)}</strong><small>MAE {econometricImpact.validationMae == null ? "—" : formatter.format(econometricImpact.validationMae)} · n={econometricImpact.validationRows}</small></article><article><span>{tr("Dynamika", "Dynamics")}</span><strong>{econometricImpact.modelType?.toUpperCase()}</strong><small>{econometricImpact.propagationDepth ? `${tr("etap", "stage")} ${econometricImpact.propagationDepth} · ` : ""}{econometricImpact.controls?.length ? econometricImpact.controls.join(" + ") : tr("bez dodatkowych kontroli", "no extra controls")}</small></article><article><span>{tr("Reszty modelu", "Model residuals")}</span><strong>DW {econometricImpact.durbinWatson == null ? "—" : formatter.format(econometricImpact.durbinWatson)}</strong><small>{tr("Wartość bliska 2 oznacza mniej autokorelacji reszt.", "A value near 2 indicates less residual autocorrelation.")}</small></article><article><span>{tr("Interpretacja", "Interpretation")}</span><strong>{econometricImpact.commonTrendRisk ? tr("Możliwy wspólny trend", "Possible common trend") : tr("Brak sygnału wspólnego trendu", "No common-trend signal")}</strong><small>{tr("To warunkowa reakcja historyczna, nie dowód przyczynowości.", "This is a conditional historical response, not proof of causality.")}</small></article></div></section>}
      <div className="analysis-grid"><section className="analysis-card"><header><div><span>{tr("PORÓWNANIE KOLUMNY", "FIELD COMPARISON")}</span><strong>{comparisonChart.title}</strong></div><div className="column-stepper"><button disabled={previewIndex <= 0} onClick={() => setPreviewField(orderedImpacts[previewIndex - 1]?.field ?? shownPreviewField)}>← {tr("Poprzednia", "Previous")}</button><span>{Math.max(0, previewIndex) + 1} / {orderedImpacts.length}</span><button disabled={previewIndex < 0 || previewIndex >= orderedImpacts.length - 1} onClick={() => setPreviewField(orderedImpacts[previewIndex + 1]?.field ?? shownPreviewField)}>{tr("Następna", "Next")} →</button></div></header><ChartRenderer rows={comparisonRows} columns={previewColumns} definition={comparisonChart} height={300} /></section>
      <section className="analysis-card"><header><div><span>{tr("PROGNOZA", "FORECAST")}</span><strong>{tr("Co może wydarzyć się dalej?", "What may happen next?")}</strong></div><div className="forecast-controls"><select value={forecastMethod} onChange={(event) => setForecastMethod(event.target.value as ForecastMethod)}><option value="linear">{tr("Trend liniowy", "Linear trend")}</option><option value="moving-average">{tr("Średnia krocząca", "Moving average")}</option><option value="exponential">{tr("Wygładzanie wykładnicze", "Exponential smoothing")}</option></select><select value={forecastHorizon} onChange={(event) => setForecastHorizon(Number(event.target.value))}><option value="3">3 {tr("okresy", "periods")}</option><option value="6">6 {tr("okresów", "periods")}</option><option value="12">12 {tr("okresów", "periods")}</option><option value="24">24 {tr("okresy", "periods")}</option></select></div></header>{forecast?.warning ? <div className="forecast-empty">{forecast.warning}</div> : forecast && <><ChartRenderer rows={forecastRows} columns={[{ name: "__time", type: "date" }, { name: "__value", type: "number" }, { name: "__series", type: "text" }]} definition={forecastChart} height={300} /><footer>MAE: {forecast.mae == null ? "—" : formatter.format(forecast.mae)} · {forecast.sampleSize} {tr("obserwacji", "observations")} · {tr("granice pokazują niepewność modelu", "bounds show model uncertainty")}</footer></>}</section></div>
      <section className="impact-table"><header><div><strong>{tr("Zmiany we wszystkich kolumnach", "Changes across all fields")}</strong><span>{tr("Kliknij wiersz, aby zobaczyć przebieg. Estymacja pokazuje zależność historyczną, nie przyczynę.", "Click a row to see its trend. An estimate shows a historical relationship, not causation.")}</span></div><div className="impact-filters"><button className={impactFilter === "changed" ? "active" : ""} onClick={() => setImpactFilter("changed")}>{tr("Zmienione", "Changed")} ({orderedImpacts.filter(hasChanged).length})</button><button className={impactFilter === "unchanged" ? "active" : ""} onClick={() => setImpactFilter("unchanged")}>{tr("Bez zmiany", "Unchanged")} ({orderedImpacts.filter((impact) => !hasChanged(impact)).length})</button><button className={impactFilter === "all" ? "active" : ""} onClick={() => setImpactFilter("all")}>{tr("Wszystkie", "All")} ({orderedImpacts.length})</button></div></header><div className="impact-table-head"><span>{tr("Kolumna", "Field")}</span><span>{tr("Przed", "Before")}</span><span>{tr("Po zmianie", "After")}</span><span>{tr("Różnica", "Difference")}</span><span>{tr("Różnica %", "Difference %")}</span><span>{tr("Sposób obliczenia", "Calculation method")}</span></div>{visibleImpacts.map((impact) => <button type="button" className={`impact-table-row ${impact.field === shownPreviewField ? "selected" : ""}`} key={impact.field} onClick={() => setPreviewField(impact.field)}><strong>{impact.field}</strong><span>{formatter.format(impact.baseline)}</span><span>{formatter.format(impact.scenario)}</span><span>{impact.difference >= 0 ? "+" : ""}{formatter.format(impact.difference)}</span><span>{impact.percent == null ? "—" : `${impact.percent >= 0 ? "+" : ""}${formatter.format(impact.percent)}%`}</span><span><b>{responseLabel(impact, language)}</b>{impact.modelType ? <small>β {formatter.format(impact.sensitivity ?? 0)} · p {impact.pValue == null ? "—" : impact.pValue < .001 ? "<0.001" : impact.pValue.toFixed(3)} · R² {impact.validationRSquared == null ? "—" : formatter.format(impact.validationRSquared)}</small> : impact.rSquared != null && <small>R² {formatter.format(impact.rSquared)} · MAE {formatter.format(impact.validationMae ?? impact.mae ?? 0)}</small>}</span></button>)}</section>
      {evaluation && <section className="model-scenario-results"><header><div><span>{tr("WYNIK CAŁEGO MODELU", "WHOLE MODEL RESULT")}</span><strong>{tr("Co zmieni się po przejściu przez graf?", "What changes after passing through the graph?")}</strong></div><small>{evaluation.modelReady ? tr("Wynik bazowy i wariant policzone tym samym modelem", "The baseline and variant were calculated with the same model") : tr("Porównanie pojawi się po poprawieniu modelu", "The comparison will appear after the model is fixed")}</small></header>{evaluation.modelReady ? <div className="model-scenario-grid">{evaluation.outputChanges.map((change) => <article key={change.nodeId}><span>{change.label}</span><div><small>{tr("Bazowo", "Baseline")}</small><strong>{formatter.format(change.baseline)}</strong></div><div><small>{tr("Wariant", "Variant")}</small><strong>{formatter.format(change.variant)}</strong></div><b className="change-value">{change.difference >= 0 ? "+" : ""}{formatter.format(change.difference)}{change.percent == null ? "" : ` · ${change.percent >= 0 ? "+" : ""}${formatter.format(change.percent)}%`}</b></article>)}{evaluation.ruleChanges.map((change) => <article key={change.nodeId} className="rule-change"><span>{change.label}</span><div><small>{tr("Alerty bazowe", "Baseline alerts")}</small><strong>{change.baselineEvents}</strong></div><div><small>{tr("Alerty po zmianie", "Alerts after change")}</small><strong>{change.variantEvents}</strong></div><b className="change-value">{change.difference >= 0 ? "+" : ""}{change.difference} {tr("zdarzeń", "events")}</b></article>)}{!evaluation.outputChanges.length && !evaluation.ruleChanges.length && <div className="forecast-empty">{tr("Model nie zwraca jeszcze metryki ani reguły do porównania.", "The model does not yet return a metric or rule to compare.")}</div>}</div> : <div className="forecast-empty">{evaluation.variant.issues[0] ?? tr("Model wymaga konfiguracji.", "The model needs configuration.")}</div>}</section>}
    </>}
  </div>;
}
