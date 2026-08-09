"use client";

import type { Aggregation, ChartColumn, ChartDefinition, ChartType, ThresholdRule } from "../types/chart-types";

const types: Array<{ id: ChartType; label: string; icon: string }> = [
  { id: "line", label: "Linia", icon: "⌁" },
  { id: "bar", label: "Słupki", icon: "▥" },
  { id: "area", label: "Obszar", icon: "◩" },
  { id: "scatter", label: "Punkty", icon: "⁙" },
  { id: "histogram", label: "Histogram", icon: "▤" },
];

const aggregations: Array<{ id: Aggregation; label: string }> = [
  { id: "sum", label: "Suma" },
  { id: "average", label: "Średnia" },
  { id: "min", label: "Minimum" },
  { id: "max", label: "Maksimum" },
  { id: "count", label: "Liczba rekordów" },
];

type Props = {
  draft: ChartDefinition;
  columns: ChartColumn[];
  errors: string[];
  editing: boolean;
  onChange: (definition: ChartDefinition) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
};

export function ChartBuilder({ draft, columns, errors, editing, onChange, onSubmit, onCancelEdit }: Props) {
  const numeric = columns.filter((column) => column.type === "number");
  const dates = columns.filter((column) => column.type === "date");
  const filter = draft.filters[0];
  const update = (patch: Partial<ChartDefinition>) => onChange({ ...draft, ...patch });
  const toggleY = (field: string) => {
    const yFields = draft.yFields.includes(field) ? draft.yFields.filter((item) => item !== field) : [...draft.yFields, field];
    const comparison = draft.comparison && yFields.includes(draft.comparison.referenceField) ? draft.comparison : undefined;
    const thresholds = (draft.thresholds ?? []).filter((rule) => yFields.includes(rule.field));
    update({ yFields, comparison, thresholds, seriesField: yFields.length > 1 ? undefined : draft.seriesField });
  };
  const updateThreshold = (id: string, patch: Partial<ThresholdRule>) => update({ thresholds: (draft.thresholds ?? []).map((rule) => rule.id === id ? { ...rule, ...patch } : rule) });
  const addThreshold = () => {
    const field = draft.yFields.find((candidate) => !(draft.thresholds ?? []).some((rule) => rule.field === candidate)) ?? draft.yFields[0];
    if (!field) return;
    update({ thresholds: [...(draft.thresholds ?? []), { id: `limit-${Date.now()}`, field, lower: 90, upper: 110, evaluation: "raw", enabled: true }] });
  };

  return (
    <aside className="chart-builder">
      <div className="builder-title"><span>{editing ? "EDYCJA WYKRESU" : "NOWY WYKRES"}</span><strong>Mapowanie danych</strong></div>
      <label className="builder-field">Nazwa wykresu<input value={draft.title} onChange={(event) => update({ title: event.target.value })} /></label>
      <div className="builder-field"><span>Typ wizualizacji</span><div className="chart-type-grid">{types.map((type) => <button key={type.id} className={draft.type === type.id ? "active" : ""} onClick={() => update({ type: type.id, yFields: type.id === "histogram" ? [] : draft.yFields, seriesField: type.id === "histogram" ? undefined : draft.seriesField })}><i>{type.icon}</i>{type.label}</button>)}</div></div>
      <label className="builder-field">Oś X<select value={draft.xField} onChange={(event) => update({ xField: event.target.value })}><option value="">Wybierz kolumnę…</option>{columns.map((column) => <option key={column.name} value={column.name}>{column.name} · {column.type}</option>)}</select></label>
      {draft.type !== "histogram" && <div className="builder-field"><span>Wartości Y <small>możesz wybrać kilka</small></span><div className="field-checks">{numeric.map((column) => <button key={column.name} className={draft.yFields.includes(column.name) ? "selected" : ""} onClick={() => toggleY(column.name)}><i>{draft.yFields.includes(column.name) ? "✓" : "+"}</i>{column.name}</button>)}</div></div>}
      {draft.type !== "scatter" && draft.type !== "histogram" && <label className="builder-field">Obliczenie<select value={draft.aggregation} onChange={(event) => update({ aggregation: event.target.value as Aggregation })}>{aggregations.map((aggregation) => <option key={aggregation.id} value={aggregation.id}>{aggregation.label}</option>)}</select></label>}
      {dates.length > 0 && <div className="builder-field time-range-builder"><span>Zakres czasu <small>opcjonalny</small></span><select value={draft.timeRange?.field ?? ""} onChange={(event) => update({ timeRange: event.target.value ? { field: event.target.value, from: draft.timeRange?.from, to: draft.timeRange?.to } : undefined })}><option value="">Cały dostępny okres</option>{dates.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>{draft.timeRange && <div className="time-range-inputs"><label>Od<input type="datetime-local" value={draft.timeRange.from ?? ""} onChange={(event) => update({ timeRange: { ...draft.timeRange!, from: event.target.value || undefined } })} /></label><label>Do<input type="datetime-local" value={draft.timeRange.to ?? ""} onChange={(event) => update({ timeRange: { ...draft.timeRange!, to: event.target.value || undefined } })} /></label></div>}</div>}
      {draft.type !== "histogram" && draft.yFields.length === 1 && <label className="builder-field">Podziel na serie<select value={draft.seriesField ?? ""} onChange={(event) => update({ seriesField: event.target.value || undefined })}><option value="">Bez podziału</option>{columns.filter((column) => column.name !== draft.xField && !draft.yFields.includes(column.name)).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>}
      {draft.yFields.length > 1 && <label className="builder-field">Pokaż różnicę<select value={draft.comparison?.referenceField ?? ""} onChange={(event) => update({ comparison: event.target.value ? { referenceField: event.target.value, mode: draft.comparison?.mode ?? "percent" } : undefined })}><option value="">Wyłączone</option>{draft.yFields.map((field) => <option key={field} value={field}>Względem: {field}</option>)}</select></label>}
      {draft.comparison && <div className="comparison-mode"><button className={draft.comparison.mode === "absolute" ? "active" : ""} onClick={() => update({ comparison: { ...draft.comparison!, mode: "absolute" } })}>Wartość</button><button className={draft.comparison.mode === "percent" ? "active" : ""} onClick={() => update({ comparison: { ...draft.comparison!, mode: "percent" } })}>Procent</button></div>}
      {draft.type !== "histogram" && <div className="builder-field threshold-builder"><span>Limity kontrolne <button onClick={addThreshold} disabled={!draft.yFields.length}>＋ Dodaj</button></span>{(draft.thresholds ?? []).length === 0 && <small className="threshold-empty">Np. zakres prawidłowy 90–110</small>}{(draft.thresholds ?? []).map((rule) => <div className="threshold-rule" key={rule.id}>
        <div><select aria-label="Seria limitu" value={rule.field} onChange={(event) => updateThreshold(rule.id, { field: event.target.value })}>{draft.yFields.map((field) => <option value={field} key={field}>{field}</option>)}</select><button aria-label="Usuń limit" onClick={() => update({ thresholds: draft.thresholds.filter((item) => item.id !== rule.id) })}>×</button></div>
        <div><label>Od<input type="number" value={rule.lower ?? ""} placeholder="bez limitu" onChange={(event) => updateThreshold(rule.id, { lower: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label>Do<input type="number" value={rule.upper ?? ""} placeholder="bez limitu" onChange={(event) => updateThreshold(rule.id, { upper: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></div>
        <select aria-label="Sposób sprawdzania limitu" value={rule.evaluation} onChange={(event) => updateThreshold(rule.id, { evaluation: event.target.value as ThresholdRule["evaluation"] })}><option value="plotted">Wartość widoczna na wykresie</option><option value="raw">Każdy rekord źródłowy</option></select>
      </div>)}</div>}
      <div className="builder-field filter-builder"><span>Filtr opcjonalny</span><select value={filter?.field ?? ""} onChange={(event) => update({ filters: event.target.value ? [{ field: event.target.value, operator: "equals", value: "" }] : [] })}><option value="">Bez filtra</option>{columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>{filter && <><select value={filter.operator} onChange={(event) => update({ filters: [{ ...filter, operator: event.target.value as typeof filter.operator }] })}><option value="equals">równa się</option><option value="contains">zawiera</option><option value="greater">większe niż</option><option value="less">mniejsze niż</option></select><input value={filter.value} placeholder="Wartość filtra" onChange={(event) => update({ filters: [{ ...filter, value: event.target.value }] })} /></>}</div>
      <label className="builder-field">Rozmiar kafelka<select value={draft.size} onChange={(event) => update({ size: event.target.value as ChartDefinition["size"] })}><option value="small">Mały</option><option value="medium">Średni</option><option value="large">Duży</option></select></label>
      {errors.length > 0 && <div className="chart-errors">{errors.map((error) => <span key={error}>! {error}</span>)}</div>}
      <div className="builder-actions"><button className="primary-button" disabled={errors.length > 0} onClick={onSubmit}>{editing ? "Zapisz zmiany" : "Dodaj do pulpitu"}</button>{editing && <button className="secondary-button" onClick={onCancelEdit}>Anuluj</button>}</div>
    </aside>
  );
}
