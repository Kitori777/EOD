import type { ChartColumn } from "../../charts/types/chart-types";
import { useI18n } from "../../../app/i18n/translations";
import type { DiagnosticPreferences, DiagnosticSectionId, DiagnosticSummaryId, VerificationPreferences } from "../../simulation/types/simulation-types";
import { DEFAULT_DIAGNOSTIC_PREFERENCES, DEFAULT_VERIFICATION_PREFERENCES } from "../../simulation/types/simulation-types";
import type { ModelMemoryEntry, ModelParameter } from "../types/model-types";

export type ModelSettingsTab = "parameters" | "memory" | "checklist" | "diagnostics";
type Props = {
  open: boolean;
  tab: ModelSettingsTab;
  columns: ChartColumn[];
  parameters: ModelParameter[];
  memory: ModelMemoryEntry[];
  datasetName: string;
  verification: VerificationPreferences;
  diagnostics: DiagnosticPreferences;
  onParametersChange: (parameters: ModelParameter[]) => void;
  onMemoryChange: (memory: ModelMemoryEntry[]) => void;
  onVerificationChange: (preferences: VerificationPreferences) => void;
  onDiagnosticsChange: (preferences: DiagnosticPreferences) => void;
  onTabChange: (tab: ModelSettingsTab) => void;
  onClose: () => void;
};

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function ModelSettingsDialog({ open, tab, columns, parameters, memory, datasetName, verification, diagnostics, onParametersChange, onMemoryChange, onVerificationChange, onDiagnosticsChange, onTabChange, onClose }: Props) {
  const { language } = useI18n();
  const english = language === "en";
  const text = (pl: string, en: string) => english ? en : pl;
  const areaLabels = { data: text("Dane", "Data"), model: "Model", simulation: text("Symulacja", "Simulation") } as const;
  const severityLabels = { ok: text("Gotowe", "Ready"), info: text("Informacje", "Information"), warning: text("Ostrzeżenia", "Warnings"), critical: text("Problemy blokujące", "Blocking issues") } as const;
  const sectionLabels: Record<DiagnosticSectionId, string> = { verdict: text("Werdykt pliku", "File verdict"), model: text("Gotowość modelu i symulacji", "Model and simulation readiness"), summary: text("Karty podsumowania", "Summary cards"), findings: text("Najważniejsze wnioski", "Key findings"), columns: text("Szczegóły kolumn", "Field details"), relationships: text("Zależności między polami", "Field relationships") };
  const summaryLabels: Record<DiagnosticSummaryId, string> = { completeness: text("Wypełnienie danych", "Data completeness"), time: text("Spójność osi czasu", "Time-axis consistency"), constants: text("Stałe nastawy", "Constant setpoints"), issues: text("Pola wymagające uwagi", "Fields needing attention") };
  if (!open) return null;

  const addParameter = () => onParametersChange([...parameters, { id: `parameter-${Date.now()}`, name: `${text("Parametr", "Parameter")} ${parameters.length + 1}`, value: 0, unit: "", description: "" }]);
  const updateParameter = (id: string, patch: Partial<ModelParameter>) => onParametersChange(parameters.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter));
  const addMemory = () => {
    const numericField = columns.find((column) => column.type === "number")?.name ?? "";
    const timeField = columns.find((column) => column.type === "date")?.name;
    onMemoryChange([...memory, { id: `memory-${Date.now()}`, name: text(`Założenie ${memory.length + 1}`, `Assumption ${memory.length + 1}`), field: numericField, operation: "percent", value: 3, timeField, capturedAt: new Date().toISOString(), datasetName, enabled: true, useInModel: true, availableInSimulation: true }]);
  };
  const updateMemory = (id: string, patch: Partial<ModelMemoryEntry>) => onMemoryChange(memory.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  const addChecklistItem = () => onVerificationChange({ ...verification, customItems: [...verification.customItems, { id: `check-${Date.now()}`, title: text("Nowy punkt kontrolny", "New checklist item"), description: "", checked: false }] });
  const updateChecklistItem = (id: string, patch: Partial<VerificationPreferences["customItems"][number]>) => onVerificationChange({ ...verification, customItems: verification.customItems.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const moveChecklistItem = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= verification.customItems.length) return;
    const items = [...verification.customItems];
    [items[index], items[target]] = [items[target], items[index]];
    onVerificationChange({ ...verification, customItems: items });
  };
  const allFields = diagnostics.monitorAllFields;

  return <div className="app-dialog-backdrop" onMouseDown={onClose}>
    <section className="app-dialog model-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="model-settings-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className="eyebrow">{text("USTAWIENIA PROJEKTU", "PROJECT SETTINGS")}</span><h2 id="model-settings-title">{text("Parametry, pamięć i zakres kontroli", "Parameters, memory and controls")}</h2></div><button aria-label={text("Zamknij", "Close")} onClick={onClose}>×</button></header>
      <div className="model-settings-tabs" role="tablist">
        <button className={tab === "parameters" ? "active" : ""} onClick={() => onTabChange("parameters")}>{text("Stałe modelu", "Model constants")} <span>{parameters.length}</span></button>
        <button className={tab === "memory" ? "active" : ""} onClick={() => onTabChange("memory")}>{text("Pamięć modelu", "Model memory")} <span>{memory.length}</span></button>
        <button className={tab === "checklist" ? "active" : ""} onClick={() => onTabChange("checklist")}>{text("Lista kontrolna", "Checklist")} <span>{verification.customItems.length}</span></button>
        <button className={tab === "diagnostics" ? "active" : ""} onClick={() => onTabChange("diagnostics")}>{text("Diagnostyka", "Diagnostics")}</button>
      </div>
      <div className="model-settings-content">
        {tab === "parameters" && <section className="model-setting-section">
          <div className="model-setting-intro"><div><strong>{text("Stałe dostępne w całym modelu", "Constants available across the model")}</strong><p>{text("Wstawisz je do formuły jako", "Insert them into a formula as")} <code>{"{{Name}}"}</code>. {text("Wartości zapisują się razem z projektem.", "Values are saved with the project.")}</p></div><button className="primary-button" onClick={addParameter}>＋ {text("Dodaj parametr", "Add parameter")}</button></div>
          <div className="parameter-table"><div className="parameter-table-head"><span>{text("Nazwa", "Name")}</span><span>{text("Wartość", "Value")}</span><span>{text("Jednostka", "Unit")}</span><span>{text("Opis", "Description")}</span><i /></div>{parameters.map((parameter) => <div className="parameter-row" key={parameter.id}>
            <input aria-label={text("Nazwa parametru", "Parameter name")} value={parameter.name} onChange={(event) => updateParameter(parameter.id, { name: event.target.value })} />
            <input aria-label={`${text("Wartość", "Value")} ${parameter.name}`} type="number" value={parameter.value} onChange={(event) => updateParameter(parameter.id, { value: Number(event.target.value) })} />
            <input aria-label={`${text("Jednostka", "Unit")} ${parameter.name}`} value={parameter.unit ?? ""} placeholder={text("np. %", "e.g. %")} onChange={(event) => updateParameter(parameter.id, { unit: event.target.value })} />
            <input aria-label={`${text("Opis", "Description")} ${parameter.name}`} value={parameter.description ?? ""} placeholder={text("Co oznacza parametr?", "What does this parameter mean?")} onChange={(event) => updateParameter(parameter.id, { description: event.target.value })} />
            <button aria-label={`${text("Usuń", "Delete")} ${parameter.name}`} onClick={() => onParametersChange(parameters.filter((item) => item.id !== parameter.id))}>×</button>
          </div>)}</div>
          {!parameters.length && <div className="settings-empty"><strong>{text("Brak zapisanych stałych", "No saved constants")}</strong><span>{text("Dodaj pierwszy parametr, jeżeli ta sama wartość ma być używana w kilku formułach.", "Add a constant when the same value should be reused by several formulas.")}</span></div>}
        </section>}
        {tab === "memory" && <section className="model-setting-section model-memory-section">
          <div className="model-setting-intro"><div><strong>{text("Zapamiętane zachowanie danych", "Saved data behavior")}</strong><p>{text("Zapisz np. wzrost o 3% dla wybranej kolumny i okresu. Aktywne wpisy zmieniają dane wejściowe modelu, a opcjonalnie stają się gotowymi scenariuszami Co-jeśli.", "Save, for example, a 3% increase for a field and time range. Active entries adjust model inputs and can also become ready-made What-if scenarios.")}</p></div><button className="primary-button" onClick={addMemory}>＋ {text("Zapisz zachowanie", "Save behavior")}</button></div>
          <div className="memory-explainer"><span>1</span><p><strong>{text("Wybierz kolumnę i zmianę", "Choose a field and change")}</strong><small>{text("Np. Line_Speed wzrosło o 3%.", "For example, Line_Speed increased by 3%.")}</small></p><i>→</i><span>2</span><p><strong>{text("Ustaw okres", "Set the time range")}</strong><small>{text("Pusty okres oznacza wszystkie rekordy.", "An empty range means all records.")}</small></p><i>→</i><span>3</span><p><strong>{text("Model pamięta", "The model remembers")}</strong><small>{text("Zmiana trafia do obliczeń i symulacji.", "The change feeds calculations and simulations.")}</small></p></div>
          <div className="model-memory-list">{memory.map((entry) => <article className={entry.enabled ? "active" : ""} key={entry.id}>
            <header><input value={entry.name} aria-label={text("Nazwa zapamiętanej zmiany", "Saved change name")} onChange={(event) => updateMemory(entry.id, { name: event.target.value })} /><button aria-label={text(`Usuń ${entry.name}`, `Delete ${entry.name}`)} onClick={() => onMemoryChange(memory.filter((item) => item.id !== entry.id))}>×</button></header>
            <div className="memory-fields">
              <label>{text("Kolumna", "Field")}<select value={entry.field} onChange={(event) => updateMemory(entry.id, { field: event.target.value })}>{columns.filter((column) => column.type === "number").map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
              <label>{text("Zmiana", "Change")}<select value={entry.operation} onChange={(event) => updateMemory(entry.id, { operation: event.target.value as ModelMemoryEntry["operation"] })}><option value="percent">{text("Procent", "Percent")}</option><option value="add">{text("Dodaj wartość", "Add value")}</option><option value="multiply">{text("Pomnóż", "Multiply")}</option><option value="set">{text("Ustaw wartość", "Set value")}</option></select></label>
              <label>{text("Wartość", "Value")}<input type="number" step="any" value={entry.value} onChange={(event) => updateMemory(entry.id, { value: Number(event.target.value) })} /></label>
              <label>{text("Kolumna czasu", "Time field")}<select value={entry.timeField ?? ""} onChange={(event) => updateMemory(entry.id, { timeField: event.target.value || undefined })}><option value="">{text("Cały plik", "Entire file")}</option>{columns.filter((column) => column.type === "date").map((column) => <option key={column.name}>{column.name}</option>)}</select></label>
              <label>{text("Od", "From")}<input type="datetime-local" disabled={!entry.timeField} value={entry.from ?? ""} onChange={(event) => updateMemory(entry.id, { from: event.target.value || undefined })} /></label>
              <label>{text("Do", "To")}<input type="datetime-local" disabled={!entry.timeField} value={entry.to ?? ""} onChange={(event) => updateMemory(entry.id, { to: event.target.value || undefined })} /></label>
            </div>
            <textarea value={entry.note ?? ""} placeholder={text("Dlaczego ta zmiana jest ważna?", "Why is this change important?")} onChange={(event) => updateMemory(entry.id, { note: event.target.value })} />
            <footer><label><input type="checkbox" checked={entry.enabled} onChange={(event) => updateMemory(entry.id, { enabled: event.target.checked })} /> {text("Aktywna", "Enabled")}</label><label><input type="checkbox" checked={entry.useInModel} onChange={(event) => updateMemory(entry.id, { useInModel: event.target.checked })} /> {text("Uwzględnij w obliczeniach", "Use in calculations")}</label><label><input type="checkbox" checked={entry.availableInSimulation} onChange={(event) => updateMemory(entry.id, { availableInSimulation: event.target.checked })} /> {text("Pokaż w Co-jeśli", "Show in What-if")}</label><small>{entry.datasetName || datasetName} · {new Date(entry.capturedAt).toLocaleString(english ? "en-US" : "pl-PL")}</small></footer>
          </article>)}</div>
          {!memory.length && <div className="settings-empty"><strong>{text("Pamięć modelu jest pusta", "Model memory is empty")}</strong><span>{text("Zapisz pierwszą zmianę, aby model mógł użyć jej ponownie po ponownym otwarciu projektu.", "Save the first change so the model can reuse it after reopening the project.")}</span></div>}
        </section>}
        {tab === "checklist" && <section className="model-setting-section">
          <div className="model-setting-intro"><div><strong>{text("Automatyczne pozycje listy", "Automatic checklist items")}</strong><p>{text("Wybierz obszary i rodzaje komunikatów, które mają być widoczne podczas weryfikacji.", "Choose the areas and message types shown during verification.")}</p></div><button className="secondary-button" onClick={() => onVerificationChange({ ...DEFAULT_VERIFICATION_PREFERENCES, customItems: verification.customItems })}>{text("Przywróć wybór", "Restore selection")}</button></div>
          <div className="preference-grid"><fieldset><legend>{text("Obszary", "Areas")}</legend>{Object.entries(areaLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={verification.visibleAreas.includes(id as keyof typeof areaLabels)} onChange={() => onVerificationChange({ ...verification, visibleAreas: toggleValue(verification.visibleAreas, id as keyof typeof areaLabels) })} /><span>{label}</span></label>)}</fieldset><fieldset><legend>{text("Rodzaje wpisów", "Entry types")}</legend>{Object.entries(severityLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={verification.visibleSeverities.includes(id as keyof typeof severityLabels)} onChange={() => onVerificationChange({ ...verification, visibleSeverities: toggleValue(verification.visibleSeverities, id as keyof typeof severityLabels) })} /><span>{label}</span></label>)}</fieldset></div>
          <div className="model-setting-intro custom-list-heading"><div><strong>{text("Własne punkty kontrolne", "Custom checklist items")}</strong><p>{text("Możesz je zaznaczać, edytować, ustawiać w kolejności i usuwać.", "You can check, edit, reorder and delete them.")}</p></div><button className="primary-button" onClick={addChecklistItem}>＋ {text("Dodaj punkt", "Add item")}</button></div>
          <div className="custom-checklist-editor">{verification.customItems.map((item, index) => <div className="custom-checklist-row" key={item.id}>
            <input aria-label={`${text("Wykonano", "Completed")} ${item.title}`} type="checkbox" checked={item.checked} onChange={(event) => updateChecklistItem(item.id, { checked: event.target.checked })} />
            <div><input aria-label={text("Nazwa punktu", "Item name")} value={item.title} onChange={(event) => updateChecklistItem(item.id, { title: event.target.value })} /><input aria-label={text("Opis punktu", "Item description")} value={item.description} placeholder={text("Opcjonalny opis", "Optional description")} onChange={(event) => updateChecklistItem(item.id, { description: event.target.value })} /></div>
            <span><button disabled={index === 0} aria-label={text("Przesuń wyżej", "Move up")} onClick={() => moveChecklistItem(index, -1)}>↑</button><button disabled={index === verification.customItems.length - 1} aria-label={text("Przesuń niżej", "Move down")} onClick={() => moveChecklistItem(index, 1)}>↓</button><button aria-label={text("Usuń punkt", "Delete item")} onClick={() => onVerificationChange({ ...verification, customItems: verification.customItems.filter((candidate) => candidate.id !== item.id) })}>×</button></span>
          </div>)}</div>
        </section>}
        {tab === "diagnostics" && <section className="model-setting-section">
          <div className="model-setting-intro"><div><strong>{text("Widok diagnostyczny projektu", "Project diagnostics view")}</strong><p>{text("Wybrane sekcje i kolumny zostaną przywrócone razem z projektem.", "Selected sections and fields will be restored with the project.")}</p></div><button className="secondary-button" onClick={() => onDiagnosticsChange({ ...DEFAULT_DIAGNOSTIC_PREFERENCES })}>{text("Przywróć wszystko", "Restore all")}</button></div>
          <div className="preference-grid diagnostics-preferences"><fieldset><legend>{text("Sekcje strony", "Page sections")}</legend>{Object.entries(sectionLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={diagnostics.visibleSections.includes(id as DiagnosticSectionId)} onChange={() => onDiagnosticsChange({ ...diagnostics, visibleSections: toggleValue(diagnostics.visibleSections, id as DiagnosticSectionId) })} /><span>{label}</span></label>)}</fieldset><fieldset><legend>{text("Karty podsumowania", "Summary cards")}</legend>{Object.entries(summaryLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={diagnostics.summaryMetrics.includes(id as DiagnosticSummaryId)} onChange={() => onDiagnosticsChange({ ...diagnostics, summaryMetrics: toggleValue(diagnostics.summaryMetrics, id as DiagnosticSummaryId) })} /><span>{label}</span></label>)}</fieldset><fieldset><legend>{text("Wnioski", "Findings")}</legend>{Object.entries(severityLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={diagnostics.visibleSeverities.includes(id as keyof typeof severityLabels)} onChange={() => onDiagnosticsChange({ ...diagnostics, visibleSeverities: toggleValue(diagnostics.visibleSeverities, id as keyof typeof severityLabels) })} /><span>{label}</span></label>)}</fieldset></div>
          <fieldset className="monitored-fields"><legend>{text("Monitorowane kolumny", "Monitored fields")}</legend><label className="all-fields"><input type="checkbox" checked={allFields} onChange={(event) => onDiagnosticsChange({ ...diagnostics, monitorAllFields: event.target.checked, monitoredFields: event.target.checked ? [] : columns.map((column) => column.name) })} /><span>{text("Wszystkie kolumny, również dodane później", "All fields, including those added later")}</span></label><div>{columns.map((column) => <label key={column.name}><input type="checkbox" checked={allFields || diagnostics.monitoredFields.includes(column.name)} onChange={() => {
            const current = allFields ? columns.map((item) => item.name) : diagnostics.monitoredFields;
            onDiagnosticsChange({ ...diagnostics, monitorAllFields: false, monitoredFields: toggleValue(current, column.name) });
          }} /><span>{column.name}</span><small>{column.type}</small></label>)}</div></fieldset>
          <label className="diagnostic-advanced-toggle"><input type="checkbox" checked={diagnostics.showAdvancedCorrelation} onChange={(event) => onDiagnosticsChange({ ...diagnostics, showAdvancedCorrelation: event.target.checked })} /><span><strong>{text("Domyślnie pokazuj analizę techniczną zależności", "Show technical relationship analysis by default")}</strong><small>{text("Macierz korelacji pozostaje wskazówką, a nie dowodem przyczynowości.", "The correlation matrix is a clue, not proof of causation.")}</small></span></label>
        </section>}
      </div>
      <footer><span>{text("Zmiany są zapisywane automatycznie w tym projekcie.", "Changes are saved automatically in this project.")}</span><button className="primary-button" onClick={onClose}>{text("Gotowe", "Done")}</button></footer>
    </section>
  </div>;
}
