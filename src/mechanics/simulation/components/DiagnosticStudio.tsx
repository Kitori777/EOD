import { useMemo, useState } from "react";

import { useI18n } from "../../../app/i18n/translations";
import { ChartRenderer } from "../../charts/components/ChartRenderer";
import type { ChartColumn, ChartDefinition, DataRow } from "../../charts/types/chart-types";
import { analyzeDataset, analyzeModelReadiness } from "../engine/diagnostic-engine";
import type { ColumnDiagnostic, DiagnosticFinding, DiagnosticPreferences, WhatIfScenario } from "../types/simulation-types";
import type { ModelDependencyRule, ModelEdge, ModelNode, ModelParameter } from "../../modeling/types/model-types";

type Props = { rows: DataRow[]; columns: ChartColumn[]; datasetName: string; sampled: boolean; nodes: ModelNode[]; edges: ModelEdge[]; dependencyRules: ModelDependencyRule[]; modelParameters: ModelParameter[]; scenario?: WhatIfScenario; preferences: DiagnosticPreferences; onPreferencesChange: (preferences: DiagnosticPreferences) => void; onCustomize: () => void; onOpenModel: (nodeId?: string) => void; onOpenSimulation: () => void };
type StatusFilter = "all" | ColumnDiagnostic["status"];
type DiagnosticMode = "overview" | "actions" | "fields";

function durationLabel(milliseconds: number | null, formatter: Intl.NumberFormat, language: "pl" | "en"): string {
  if (milliseconds == null) return "—";
  const minutes = milliseconds / 60_000;
  if (minutes < 60) return `${formatter.format(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${formatter.format(hours)} ${language === "en" ? "hr" : "godz."}`;
  return `${formatter.format(hours / 24)} ${language === "en" ? "days" : "dni"}`;
}

function fieldSummary(column: ColumnDiagnostic, formatter: Intl.NumberFormat, locale: string, language: "pl" | "en"): string {
  if (column.constant) return column.summary;
  if (column.status === "critical" || column.status === "warning") return column.summary;
  if (column.kind === "number" && column.minimum != null && column.maximum != null) {
    return `${language === "en" ? "Range" : "Zakres"} ${formatter.format(column.minimum)}–${formatter.format(column.maximum)} · ${language === "en" ? "no significant issues" : "bez istotnych problemów"}`;
  }
  if (column.kind === "date") return `${column.unique.toLocaleString(locale)} ${language === "en" ? "distinct time points" : "różnych punktów czasu"}`;
  return `${column.unique.toLocaleString(locale)} ${language === "en" ? "distinct values · no significant issues" : "różnych wartości · bez istotnych problemów"}`;
}

export function DiagnosticStudio({ rows, columns, datasetName, sampled, nodes, edges, dependencyRules, modelParameters, scenario, preferences, onPreferencesChange, onCustomize, onOpenModel, onOpenSimulation }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const percentFormatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const roleLabels: Record<ColumnDiagnostic["role"], string> = { time: tr("Czas", "Time"), setting: tr("Nastawa", "Setpoint"), measurement: tr("Pomiar", "Measurement"), output: tr("Wynik / wyjście", "Result / output"), correction: tr("Korekta", "Correction"), category: tr("Kategoria", "Category"), other: tr("Pozostałe", "Other") };
  const statusLabels: Record<ColumnDiagnostic["status"], string> = { ok: tr("W porządku", "Good"), info: tr("Informacja", "Information"), warning: tr("Sprawdź", "Review"), critical: tr("Problem", "Problem") };
  const findingLabels: Record<DiagnosticFinding["severity"], string> = { ok: tr("DOBRZE", "GOOD"), info: tr("INFORMACJA", "INFORMATION"), warning: tr("WARTO SPRAWDZIĆ", "WORTH REVIEWING"), critical: tr("WAŻNY PROBLEM", "CRITICAL ISSUE") };
  const report = useMemo(() => analyzeDataset(rows, columns, language), [rows, columns, language]);
  const systemReport = useMemo(() => analyzeModelReadiness(rows, columns, nodes, edges, scenario, dependencyRules, modelParameters, language), [rows, columns, nodes, edges, scenario, dependencyRules, modelParameters, language]);
  const configuredColumns = preferences.monitorAllFields ? report.columns : report.columns.filter((column) => preferences.monitoredFields.includes(column.field));
  const firstPriority = configuredColumns.find((column) => column.status === "critical")
    ?? configuredColumns.find((column) => column.status === "warning")
    ?? configuredColumns.find((column) => column.role === "measurement")
    ?? configuredColumns[0];
  const [selectedField, setSelectedField] = useState(firstPriority?.field ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<DiagnosticMode>("overview");
  const selected = configuredColumns.find((column) => column.field === selectedField) ?? firstPriority;
  const filteredColumns = configuredColumns.filter((column) => {
    const matchesSearch = !search || column.field.toLowerCase().includes(search.toLowerCase()) || roleLabels[column.role].toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || column.status === statusFilter);
  });
  const analyzedRows = report.sampled ? Math.min(rows.length, 5000) : rows.length;
  const totalCells = analyzedRows * configuredColumns.length;
  const missing = configuredColumns.reduce((sum, column) => sum + column.missing, 0);
  const completeness = totalCells ? ((totalCells - missing) / totalCells) * 100 : 0;
  const configuredCriticalIssues = configuredColumns.filter((column) => column.status === "critical").length;
  const configuredWarningIssues = configuredColumns.filter((column) => column.status === "warning").length;
  const issueCount = configuredCriticalIssues + configuredWarningIssues;
  const configuredTime = report.time && configuredColumns.some((column) => column.field === report.time?.field) ? report.time : null;
  const timeField = report.time?.field ?? columns.find((column) => column.type === "date")?.name;
  const detailRows = useMemo(() => rows.map((row, index) => ({ ...row, __diagnostic_row: String(index + 1) })), [rows]);
  const detailColumns = useMemo(() => [...columns, { name: "__diagnostic_row", type: "number" as const }], [columns]);
  const detailChart: ChartDefinition | null = selected?.kind === "number" ? {
    id: `diagnostic-detail-${selected.field}`,
    title: `${tr("Przebieg", "Trend")}: ${selected.field}`,
    datasetId: "diagnostic-detail",
    type: "line",
    xField: timeField ?? "__diagnostic_row",
    yFields: [selected.field],
    aggregation: "average",
    filters: [],
    thresholds: [],
    size: "large",
    presentation: { showZoom: true, showBrush: true, showSymbols: false, showDataLabels: false },
  } : null;
  const allStrongRelationships = report.relationships
    .filter((item) => Math.abs(item.correlation) >= .7 && configuredColumns.some((column) => column.field === item.left) && configuredColumns.some((column) => column.field === item.right))
    .sort((left, right) => {
      if (left.relationshipKind !== right.relationshipKind) return left.relationshipKind === "observed" ? -1 : 1;
      return Math.abs(right.correlation) - Math.abs(left.correlation);
    });
  const strongRelationships = allStrongRelationships
    .filter((item) => item.left === selected?.field || item.right === selected?.field)
    .slice(0, 6);
  const matrixFields = [...new Set(allStrongRelationships.slice(0, 8).flatMap((item) => [item.left, item.right]))].slice(0, 8);
  const matrixRows = useMemo(() => {
    const map = new Map(report.relationships.map((item) => [`${item.left}:${item.right}`, item.correlation]));
    return matrixFields.flatMap((left) => matrixFields.map((right) => ({
      __left: left,
      __right: right,
      __correlation: String(left === right ? 1 : map.get(`${left}:${right}`) ?? map.get(`${right}:${left}`) ?? 0),
    })));
  }, [report.relationships, matrixFields]);
  const heatmap: ChartDefinition = {
    id: "diagnostic-correlation",
    title: tr("Techniczna macierz zależności", "Technical relationship matrix"),
    datasetId: "diagnostic",
    type: "heatmap",
    xField: "__left",
    yFields: ["__correlation"],
    seriesField: "__right",
    aggregation: "average",
    filters: [],
    thresholds: [],
    size: "large",
    presentation: { showZoom: false, showBrush: false, showDataLabels: true },
  };
  const configuredStatus = configuredCriticalIssues ? "critical" : configuredWarningIssues ? "attention" : "good";
  const headline = configuredStatus === "critical"
    ? tr("Najpierw popraw najważniejsze problemy", "Fix the critical issues first")
    : configuredStatus === "attention"
      ? tr("Dane nadają się do analizy, ale kilka pól warto sprawdzić", "The data is suitable for analysis, but some fields should be reviewed")
      : tr("Dane wyglądają poprawnie i nadają się do analizy", "The data looks correct and is ready for analysis");
  const headlineDetail = configuredStatus === "critical"
    ? tr("Co najmniej jeden problem może zmienić wyniki obliczeń. Poniżej wskazujemy dokładnie który.", "At least one issue may affect the calculations. The exact issue is identified below.")
    : configuredStatus === "attention"
      ? tr("Nie blokujemy pracy. Nietypowe miejsca są opisane niżej, razem z następnym krokiem.", "Work is not blocked. Unusual areas and the next step are described below.")
      : tr("Nie znaleziono problemów, które blokowałyby dalszą pracę z tym plikiem.", "No issues were found that would block further work with this file.");

  const selectFinding = (finding: DiagnosticFinding) => {
    if (finding.field) setSelectedField(finding.field);
    if (finding.id === "settings") setStatusFilter("info");
    setViewMode("fields");
  };
  const allVisibleFindings = report.findings.filter((finding) => preferences.visibleSeverities.includes(finding.severity) && (!finding.field || configuredColumns.some((column) => column.field === finding.field)));
  const visibleFindings = allVisibleFindings.slice(0, 7);
  const visibleSystemFindings = systemReport.findings.filter((finding) => preferences.visibleSeverities.includes(finding.severity));
  const urgentDataFindings = allVisibleFindings.filter((finding) => finding.severity === "critical" || finding.severity === "warning");
  const urgentSystemFindings = visibleSystemFindings.filter((finding) => finding.severity === "critical" || finding.severity === "warning");
  const urgentCount = urgentDataFindings.length + urgentSystemFindings.length;
  const criticalDataFinding = urgentDataFindings.find((finding) => finding.severity === "critical");
  const criticalSystemFinding = urgentSystemFindings.find((finding) => finding.severity === "critical");
  const priorityFinding = criticalDataFinding
    ? { source: "data" as const, finding: criticalDataFinding }
    : criticalSystemFinding
      ? { source: "system" as const, finding: criticalSystemFinding }
      : urgentDataFindings[0]
        ? { source: "data" as const, finding: urgentDataFindings[0] }
        : urgentSystemFindings[0]
          ? { source: "system" as const, finding: urgentSystemFindings[0] }
          : null;
  const urgentLabel = language === "en" ? `${urgentCount} ${urgentCount === 1 ? "issue" : "issues"}` : urgentCount === 1 ? "1 sprawa" : urgentCount > 1 && urgentCount < 5 ? `${urgentCount} sprawy` : `${urgentCount} spraw`;
  const sectionVisible = (section: DiagnosticPreferences["visibleSections"][number]) => preferences.visibleSections.includes(section);

  const openPriorityFinding = () => {
    if (!priorityFinding) {
      setViewMode("fields");
      return;
    }
    if (priorityFinding.source === "data") {
      selectFinding(priorityFinding.finding);
      return;
    }
    const finding = priorityFinding.finding;
    if (finding.action === "open-model") onOpenModel(finding.nodeId);
    else if (finding.action === "open-simulation") onOpenSimulation();
    else setViewMode("actions");
  };

  return <div className="diagnostic-view diagnostic-v2">
    <div className="view-heading compact-heading"><div><span className="eyebrow">{tr("DIAGNOSTYKA DANYCH", "DATA DIAGNOSTICS")}</span><h2>{tr("Czy z tym plikiem można bezpiecznie pracować?", "Is this file safe to work with?")}</h2><p>{tr("Najpierw prosty wniosek, potem miejsca wymagające uwagi i szczegóły konkretnych pól.", "Start with a clear conclusion, then review areas that need attention and details for specific fields.")}</p></div><div className="diagnostic-heading-actions"><div className="diagnostic-health"><i /> {report.rows.toLocaleString(locale)} {tr("rekordów", "records")} · {configuredColumns.length}/{columns.length} {tr("kolumn", "fields")}</div><button className="secondary-button" onClick={onCustomize}>{tr("Dostosuj widok", "Customize view")}</button></div></div>
    {!configuredColumns.length && <div className="analysis-notice">{tr("Nie wybrano żadnej kolumny do diagnostyki. Otwórz „Dostosuj widok”, aby wskazać pola.", "No fields are selected for diagnostics. Open “Customize view” to select them.")}</div>}
    {(sampled || report.sampled) && <div className="analysis-notice">{tr("Duży plik: diagnoza korzysta z równomiernie wybranych 5000 rekordów. Nie zmienia to danych źródłowych.", "Large file: diagnostics uses an evenly selected sample of 5,000 records. Source data is not changed.")}</div>}

    <nav className="diagnostic-mode-switcher" aria-label={tr("Zakres diagnostyki", "Diagnostics scope")}>
      <button className={viewMode === "overview" ? "active" : ""} aria-pressed={viewMode === "overview"} onClick={() => setViewMode("overview")}><span>01</span><strong>{tr("Podsumowanie", "Summary")}</strong><small>{tr("Najważniejszy wniosek", "Key conclusion")}</small></button>
      <button className={viewMode === "actions" ? "active" : ""} aria-pressed={viewMode === "actions"} onClick={() => setViewMode("actions")}><span>02</span><strong>{tr("Do sprawdzenia", "Needs review")}</strong><small>{urgentCount ? urgentLabel : tr("brak pilnych spraw", "no urgent issues")}</small></button>
      <button className={viewMode === "fields" ? "active" : ""} aria-pressed={viewMode === "fields"} onClick={() => setViewMode("fields")}><span>03</span><strong>{tr("Pola i zależności", "Fields & relationships")}</strong><small>{configuredColumns.length} {tr("monitorowanych pól", "monitored fields")}</small></button>
    </nav>

    {viewMode === "overview" && sectionVisible("verdict") && <section className={`diagnostic-verdict ${configuredStatus}`}>
      <div className="verdict-mark">{configuredStatus === "critical" ? "!" : configuredStatus === "attention" ? "i" : "✓"}</div>
      <div><span>{tr("WERDYKT", "VERDICT")}</span><h3>{headline}</h3><p>{headlineDetail}</p></div>
      <div className="verdict-source"><small>{tr("Sprawdzony plik", "Checked file")}</small><strong>{datasetName}</strong></div>
    </section>}

    {viewMode === "overview" && sectionVisible("verdict") && <section className={`diagnostic-next-step ${priorityFinding?.finding.severity ?? "ok"}`}>
      <div className="next-step-number">{priorityFinding ? "1" : "✓"}</div>
      <div><span>{priorityFinding ? tr("ZACZNIJ TUTAJ", "START HERE") : tr("NASTĘPNY KROK", "NEXT STEP")}</span><strong>{priorityFinding?.finding.title ?? tr("Nie ma pilnych problemów do naprawy", "There are no urgent issues to fix")}</strong><p>{priorityFinding?.finding.description ?? tr("Możesz przejrzeć wybrane pola albo przejść dalej do wykresów i modelu.", "You can review selected fields or continue to charts and the model.")}</p></div>
      <button onClick={openPriorityFinding}>{priorityFinding ? priorityFinding.source === "data" ? tr("Pokaż pole", "Show field") : tr("Otwórz miejsce naprawy", "Open fix location") : tr("Przejrzyj pola", "Review fields")} →</button>
    </section>}

    {viewMode === "actions" && sectionVisible("model") && <section className="diagnostic-system-readiness">
      <header><div><span>{tr("MODEL I SYMULACJA", "MODEL & SIMULATION")}</span><strong>{tr("Czy analiza zadziała po użyciu tych danych?", "Will the analysis work with this data?")}</strong><p>{tr("Ta kontrola łączy jakość pliku z rzeczywistą konfiguracją grafu i wariantu Co-jeśli.", "This check combines file quality with the actual graph and What-if configuration.")}</p></div><b className={systemReport.status}>{systemReport.status === "ready" ? tr("GOTOWE", "READY") : systemReport.status === "attention" ? tr("Z OSTRZEŻENIAMI", "WITH WARNINGS") : tr("ZABLOKOWANE", "BLOCKED")}</b></header>
      <div>{visibleSystemFindings.slice(0, 6).map((finding) => <article className={finding.severity} key={finding.id}><span>{finding.area === "model" ? "MODEL" : finding.area === "simulation" ? tr("SYMULACJA", "SIMULATION") : tr("DANE", "DATA")}</span><strong>{finding.title}</strong><p>{finding.description}</p>{finding.action !== "none" && <button onClick={() => finding.action === "open-model" ? onOpenModel(finding.nodeId) : finding.action === "open-simulation" ? onOpenSimulation() : undefined}>{tr("Przejdź do naprawy →", "Go to fix →")}</button>}</article>)}</div>
    </section>}

    {viewMode === "overview" && sectionVisible("summary") && <section className="diagnostic-summary-cards">
      {preferences.summaryMetrics.includes("completeness") && <article><span>{tr("Wypełnienie danych", "Data completeness")}</span><strong>{percentFormatter.format(completeness)}%</strong><small>{missing ? `${missing.toLocaleString(locale)} ${tr("pustych komórek", "empty cells")}` : tr("brak pustych komórek", "no empty cells")}</small></article>}
      {preferences.summaryMetrics.includes("time") && <article><span>{tr("Oś czasu", "Time axis")}</span><strong>{configuredTime?.status === "ok" ? tr("Spójna", "Consistent") : configuredTime ? tr("Sprawdź", "Review") : tr("Brak", "Missing")}</strong><small>{configuredTime?.status === "ok" ? `${tr("krok około", "step about")} ${durationLabel(configuredTime.expectedIntervalMs, formatter, language)}` : configuredTime?.summary ?? tr("nie wybrano pola czasu", "no time field selected")}</small></article>}
      {preferences.summaryMetrics.includes("constants") && <article className="informational"><span>{tr("Stałe nastawy", "Constant setpoints")}</span><strong>{configuredColumns.filter((column) => column.constant && column.role === "setting").length}</strong><small>{tr("nie są liczone jako błąd", "are not counted as an error")}</small></article>}
      {preferences.summaryMetrics.includes("issues") && <article className={issueCount ? "attention" : ""}><span>{tr("Pola do sprawdzenia", "Fields to review")}</span><strong>{issueCount}</strong><small>{configuredCriticalIssues ? `${configuredCriticalIssues} ${tr("ważnych problemów", "critical issues")}` : issueCount ? tr("nie blokują analizy", "do not block analysis") : tr("brak", "none")}</small></article>}
    </section>}

    {viewMode === "actions" && sectionVisible("findings") && <section className="diagnostic-findings">
      <header><div><span>{tr("WNIOSKI I KONTROLE", "FINDINGS & CHECKS")}</span><strong>{tr("Co wymaga uwagi?", "What needs attention?")}</strong></div><small>{tr("Najpierw problemy, później informacje i potwierdzenia poprawności.", "Issues first, followed by information and confirmations.")}</small></header>
      <div>{visibleFindings.map((finding) => <article className={finding.severity} key={finding.id}>
        <div className="finding-icon">{finding.severity === "critical" || finding.severity === "warning" ? "!" : finding.severity === "ok" ? "✓" : "i"}</div>
        <div><span>{findingLabels[finding.severity]}</span><strong>{finding.title}</strong><p>{finding.description}</p></div>
        {finding.actionLabel && <button onClick={() => selectFinding(finding)}>{finding.actionLabel} →</button>}
      </article>)}{!visibleFindings.length && <div className="diagnostic-no-results">{tr("Brak komunikatów dla wybranych ustawień diagnostyki.", "No messages for the selected diagnostic settings.")}</div>}</div>
    </section>}

    {viewMode === "fields" && sectionVisible("columns") && <section className="diagnostic-columns">
      <header><div><span>{tr("POLA W PLIKU", "FIELDS IN FILE")}</span><strong>{tr("Zobacz konkretną kolumnę", "Inspect a specific field")}</strong><p>{tr("Wybierz pole, żeby zobaczyć jego przebieg, zakres i prostą ocenę.", "Select a field to see its trend, range and simple assessment.")}</p></div><div className="diagnostic-column-filters"><input aria-label={tr("Szukaj pola", "Search fields")} placeholder={tr("Szukaj nazwy lub rodzaju…", "Search by name or type…")} value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={tr("Filtruj pola", "Filter fields")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">{tr("Wszystkie pola", "All fields")}</option><option value="critical">{tr("Tylko problemy", "Issues only")}</option><option value="warning">{tr("Do sprawdzenia", "Needs review")}</option><option value="info">{tr("Informacje", "Information")}</option><option value="ok">{tr("W porządku", "Good")}</option></select></div></header>
      <div className="diagnostic-column-layout">
        <div className="diagnostic-column-list">{filteredColumns.length ? filteredColumns.map((column) => <button className={`${selected?.field === column.field ? "active" : ""} ${column.status}`} key={column.field} onClick={() => setSelectedField(column.field)}>
          <div><strong>{column.field}</strong><span>{roleLabels[column.role]}</span></div><p>{fieldSummary(column, formatter, locale, language)}</p><b>{statusLabels[column.status]}</b>
        </button>) : <div className="diagnostic-no-results">{tr("Brak pól pasujących do filtra.", "No fields match the filter.")}</div>}</div>
        {selected && <div className="diagnostic-field-detail">
          <header><div><span>{roleLabels[selected.role]}</span><h3>{selected.field}</h3></div><b className={selected.status}>{statusLabels[selected.status]}</b></header>
          <div className={`field-explanation ${selected.status}`}><strong>{selected.summary}</strong><p>{selected.constant ? tr("Stałość sama w sobie nie oznacza błędu. Oceń ją w kontekście sposobu działania maszyny lub procesu.", "A constant value is not an error by itself. Assess it in the context of how the machine or process operates.") : selected.status === "ok" ? tr("Nie znaleziono sygnału, który wymaga działania.", "No signal requiring action was found.") : tr("Sprawdź widoczny fragment przebiegu i dane źródłowe przed wyciągnięciem wniosków.", "Review the visible trend and source data before drawing conclusions.")}</p></div>
          <div className="field-stat-grid">
            <article><span>{tr("Braki", "Missing")}</span><strong>{selected.missing ? `${selected.missing} (${percentFormatter.format(selected.missingPercent)}%)` : tr("Brak", "None")}</strong></article>
            <article><span>{tr("Różne wartości", "Distinct values")}</span><strong>{selected.unique.toLocaleString(locale)}</strong></article>
            <article><span>{tr("Typowa wartość", "Typical value")}</span><strong>{selected.median == null ? "—" : formatter.format(selected.median)}</strong></article>
            <article><span>{tr("Zakres", "Range")}</span><strong>{selected.minimum == null || selected.maximum == null ? "—" : `${formatter.format(selected.minimum)}–${formatter.format(selected.maximum)}`}</strong></article>
            <article><span>{tr("Nietypowe punkty", "Outliers")}</span><strong>{selected.kind === "number" ? `${selected.outliers} (${percentFormatter.format(selected.outlierPercent)}%)` : "—"}</strong></article>
            <article><span>{tr("Nieprawidłowy format", "Invalid format")}</span><strong>{selected.invalid || tr("Brak", "None")}</strong></article>
          </div>
          {selected.role === "time" && report.time ? <div className="time-detail"><strong>{tr("Spójność czasu", "Time consistency")}</strong><p>{report.time.summary}</p><div><span>{tr("Typowy krok", "Typical step")}: {durationLabel(report.time.expectedIntervalMs, formatter, language)}</span><span>{tr("Duplikaty", "Duplicates")}: {report.time.duplicates}</span><span>{tr("Większe przerwy", "Large gaps")}: {report.time.gaps}</span></div></div> : detailChart ? <ChartRenderer rows={detailRows} columns={detailColumns} definition={detailChart} height={280} /> : <div className="forecast-empty">{tr("To pole nie jest liczbą, dlatego pokazujemy jego jakość i liczbę różnych wartości zamiast wykresu przebiegu.", "This field is not numeric, so its quality and number of distinct values are shown instead of a trend chart.")}</div>}
        </div>}
      </div>
    </section>}

    {viewMode === "fields" && sectionVisible("relationships") && <section className="plain-relationships">
      <header><div><span>{tr("ZALEŻNOŚCI WYBRANEGO POLA", "SELECTED FIELD RELATIONSHIPS")}</span><strong>{tr("Co zmienia się razem z", "What changes together with")} {selected?.field ?? tr("wybranym polem", "the selected field")}?</strong><p>{tr("Wybór zmienisz na liście powyżej. To wskazówki do sprawdzenia, nie dowód przyczyny.", "Change the selection in the list above. These are clues to investigate, not proof of causation.")}</p></div><button onClick={() => onPreferencesChange({ ...preferences, showAdvancedCorrelation: !preferences.showAdvancedCorrelation })}>{preferences.showAdvancedCorrelation ? tr("Ukryj analizę techniczną", "Hide technical analysis") : tr("Pokaż analizę techniczną", "Show technical analysis")}</button></header>
      {strongRelationships.length ? <div className="plain-relationship-grid">{strongRelationships.map((item) => <article key={`${item.left}-${item.right}`}>
        <div className="relationship-names"><strong>{item.left}</strong><span>{item.correlation >= 0 ? tr("poruszają się podobnie", "move similarly") : tr("poruszają się przeciwnie", "move in opposite directions")}</span><strong>{item.right}</strong></div>
        <div className="relationship-meter"><i style={{ width: `${Math.abs(item.correlation) * 100}%` }} /></div>
        <p>{item.relationshipKind === "likely-derived" ? tr("Prawdopodobnie wynika to ze sposobu obliczenia tych pól.", "This likely follows from how these fields are calculated.") : item.correlation >= 0 ? tr("Gdy jedno pole rośnie lub spada, drugie zwykle zachowuje się podobnie.", "When one field rises or falls, the other usually behaves similarly.") : tr("Gdy jedno pole rośnie, drugie zwykle maleje.", "When one field rises, the other usually falls.")}</p>
        <small>{language === "en" ? item.strength === "bardzo silna" ? "very strong" : item.strength === "silna" ? "strong" : "moderate" : item.strength} {tr("zależność", "relationship")} · {tr("porównano", "compared")} {item.sampleSize.toLocaleString(locale)} {tr("rekordów", "records")}{item.bestLag ? ` · ${tr("możliwe przesunięcie o", "possible lag of")} ${Math.abs(item.bestLag)} ${tr("rekordów", "records")}` : ""}</small>
      </article>)}</div> : <div className="forecast-empty">{tr("Dla tego pola nie znaleziono silnej zależności. To normalny wynik i nie oznacza problemu z danymi.", "No strong relationship was found for this field. This is a normal result and does not indicate a data issue.")}</div>}
      {preferences.showAdvancedCorrelation && <div className="advanced-correlation"><div className="advanced-note"><strong>{tr("Jak czytać macierz?", "How to read the matrix?")}</strong><p>{tr("Wartości bliskie +1 oznaczają wspólny kierunek, a bliskie −1 kierunki przeciwne. Zero oznacza brak wyraźnej liniowej zależności.", "Values near +1 indicate the same direction, while values near −1 indicate opposite directions. Zero indicates no clear linear relationship.")}</p></div>{matrixFields.length >= 2 ? <ChartRenderer rows={matrixRows} columns={[{ name: "__left", type: "text" }, { name: "__right", type: "text" }, { name: "__correlation", type: "number" }]} definition={heatmap} height={420} /> : null}</div>}
    </section>}
  </div>;
}
