import { useMemo } from "react";

import { useI18n } from "../../../app/i18n/translations";
import type { ChartColumn, DataRow } from "../../charts/types/chart-types";
import { analyzeDataset, analyzeModelReadiness } from "../../simulation/engine/diagnostic-engine";
import type { VerificationPreferences, WhatIfScenario } from "../../simulation/types/simulation-types";
import type { ModelDependencyRule, ModelEdge, ModelNode, ModelParameter } from "../types/model-types";

type Props = {
  rows: DataRow[];
  columns: ChartColumn[];
  nodes: ModelNode[];
  edges: ModelEdge[];
  dependencyRules: ModelDependencyRule[];
  modelParameters: ModelParameter[];
  scenario?: WhatIfScenario;
  sampled: boolean;
  preferences: VerificationPreferences;
  onPreferencesChange: (preferences: VerificationPreferences) => void;
  onCustomize: () => void;
  onOpenBuild: (nodeId?: string) => void;
  onOpenSimulation: () => void;
  onOpenDiagnostics: () => void;
};

export function ModelVerificationStudio({ rows, columns, nodes, edges, dependencyRules, modelParameters, scenario, sampled, preferences, onPreferencesChange, onCustomize, onOpenBuild, onOpenSimulation, onOpenDiagnostics }: Props) {
  const { language, locale } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const severityLabel = { ok: tr("GOTOWE", "READY"), info: tr("INFORMACJA", "INFO"), warning: tr("UWAGA", "WARNING"), critical: tr("BLOKUJE", "BLOCKING") } as const;
  const data = useMemo(() => analyzeDataset(rows, columns, language), [rows, columns, language]);
  const report = useMemo(() => analyzeModelReadiness(rows, columns, nodes, edges, scenario, dependencyRules, modelParameters, language), [rows, columns, nodes, edges, scenario, dependencyRules, modelParameters, language]);
  const dataReady = data.overallStatus !== "critical";
  const finalLabel = report.status === "ready" ? tr("Model jest gotowy do użycia", "The model is ready to use") : report.status === "attention" ? tr("Model zadziała, ale sprawdź ostrzeżenia", "The model will run, but review the warnings") : tr("Model nie powinien być jeszcze uruchamiany", "The model should not be run yet");
  const finalDetail = report.status === "ready"
    ? tr("Dane, graf i aktywny wariant przeszły kontrolę. Nadal oznaczamy wyniki estymowane, aby nie mylić ich z obliczeniami dokładnymi.", "The data, graph and active variant passed validation. Estimated results remain clearly marked so they are not confused with exact calculations.")
    : report.findings.find((finding) => finding.severity === "critical" || finding.severity === "warning")?.description ?? tr("Przejdź przez listę kontroli poniżej.", "Review the checklist below.");
  const visibleFindings = report.findings.filter((finding) => preferences.visibleAreas.includes(finding.area) && preferences.visibleSeverities.includes(finding.severity));

  return <div className="model-verification-view">
    <div className="view-heading compact-heading"><div><span className="eyebrow">{tr("WERYFIKACJA TECHNICZNA", "TECHNICAL VERIFICATION")}</span><h2>{tr("Co zostało policzone i czego brakuje?", "What was calculated and what is missing?")}</h2><p>{tr("Kontrola danych, grafu i formuł bez oceniania, czy wybrany plan jest biznesowo dobry.", "Validation of data, graph and formulas without judging whether the chosen plan is a good business decision.")}</p></div><button className="secondary-button" onClick={onOpenDiagnostics}>{tr("Pełna diagnostyka danych", "Full data diagnostics")}</button></div>
    {sampled && <div className="analysis-notice">{tr("Kontrola korzysta z lokalnej próby analitycznej. Wynik opisuje zakres sprawdzonych danych.", "Validation uses the local analytical sample. The result describes the scope of the checked data.")}</div>}
    <section className={`verification-verdict ${report.status}`}><div className="verdict-mark">{report.status === "ready" ? "✓" : "!"}</div><div><span>{tr("WERDYKT", "VERDICT")}</span><h3>{finalLabel}</h3><p>{finalDetail}</p></div><button onClick={() => report.modelReady ? onOpenSimulation() : onOpenBuild(report.findings.find((finding) => finding.nodeId)?.nodeId)}>{report.modelReady ? tr("Sprawdź wariant →", "Check variant →") : tr("Napraw model →", "Fix model →")}</button></section>
    <section className="verification-gates">
      <article className={dataReady ? "ready" : "blocked"}><span>01 · {tr("DANE", "DATA")}</span><strong>{dataReady ? tr("Nadają się do obliczeń", "Ready for calculations") : tr("Mogą zniekształcić wynik", "May distort the result")}</strong><p>{data.criticalIssues ? `${data.criticalIssues} ${tr("ważnych problemów z jakością", "critical quality issues")}` : `${data.warningIssues} ${tr("ostrzeżeń", "warnings")} · ${data.rows.toLocaleString(locale)} ${tr("rekordów", "records")}`}</p><button onClick={onOpenDiagnostics}>{tr("Zobacz dane", "View data")}</button></article>
      <article className={report.modelReady ? "ready" : "blocked"}><span>02 · MODEL</span><strong>{report.modelReady ? tr("Graf wykonuje się w całości", "The graph runs end to end") : tr("Graf wymaga konfiguracji", "The graph needs configuration")}</strong><p>{nodes.length} {tr("bloków", "blocks")} · {edges.length} {tr("połączeń", "connections")} · {report.processedRows.toLocaleString(locale)} {tr("rekordów", "records")}</p><button onClick={() => onOpenBuild(report.findings.find((finding) => finding.area === "model" && finding.nodeId)?.nodeId)}>{tr("Otwórz budowę", "Open builder")}</button></article>
      <article className={report.simulationReady ? "ready" : scenario ? "attention" : "empty"}><span>03 · {tr("SYMULACJA", "SIMULATION")}</span><strong>{report.simulationReady ? tr("Porównanie zostało obliczone", "The comparison was calculated") : scenario ? tr("Brak pełnego porównania", "The comparison is incomplete") : tr("Brak wariantu", "No variant")}</strong><p>{scenario ? scenario.name : tr("Utwórz zmianę i sprawdź jej wpływ na wynik modelu.", "Create a change and check its impact on the model result.")}</p><button onClick={onOpenSimulation}>{scenario ? tr("Otwórz porównanie", "Open comparison") : tr("Utwórz wariant", "Create variant")}</button></article>
    </section>
    <section className="verification-findings"><header><div><span>{tr("LISTA KONTROLNA", "CHECKLIST")}</span><strong>{tr("Co dokładnie działa, a co trzeba poprawić?", "What works and what needs improvement?")}</strong></div><div className="verification-list-actions"><small>{visibleFindings.length} {tr("automatycznych", "automatic")} · {preferences.customItems.length} {tr("własnych", "custom")}</small><button onClick={onCustomize}>{tr("Edytuj listę", "Edit checklist")}</button></div></header><div>{visibleFindings.map((finding) => <article className={finding.severity} key={finding.id}><b>{severityLabel[finding.severity]}</b><div><strong>{finding.title}</strong><p>{finding.description}</p></div>{finding.action !== "none" && <button onClick={() => finding.action === "open-model" ? onOpenBuild(finding.nodeId) : finding.action === "open-simulation" ? onOpenSimulation() : onOpenDiagnostics()}>{tr("Otwórz →", "Open →")}</button>}</article>)}{preferences.customItems.map((item) => <article className={item.checked ? "ok custom" : "info custom"} key={item.id}><label className="verification-custom-check"><input type="checkbox" checked={item.checked} onChange={(event) => onPreferencesChange({ ...preferences, customItems: preferences.customItems.map((candidate) => candidate.id === item.id ? { ...candidate, checked: event.target.checked } : candidate) })} /><b>{item.checked ? tr("GOTOWE", "READY") : tr("WŁASNE", "CUSTOM")}</b></label><div><strong>{item.title}</strong><p>{item.description || tr("Własny punkt kontrolny użytkownika.", "Custom user checklist item.")}</p></div><button onClick={onCustomize}>{tr("Edytuj →", "Edit →")}</button></article>)}</div></section>
  </div>;
}
