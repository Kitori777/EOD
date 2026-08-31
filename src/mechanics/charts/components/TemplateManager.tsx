"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { useI18n } from "../../../app/i18n/translations";
import { createDashboardTemplate, isDashboardTemplate, type DashboardGrid, type DashboardTemplate } from "../templates/dashboard-templates";
import type { ChartDefinition } from "../types/chart-types";

type Props = {
  grid: DashboardGrid;
  charts: ChartDefinition[];
  templates: DashboardTemplate[];
  defaultTemplateId?: string;
  onGridChange: (grid: DashboardGrid) => void;
  onTemplatesChange: (templates: DashboardTemplate[]) => void;
  onDefaultTemplateChange: (id?: string) => void;
  onApply: (template: DashboardTemplate) => void;
  onToast: (message: string) => void;
};

export function TemplateManager({ grid, charts, templates, defaultTemplateId, onGridChange, onTemplatesChange, onDefaultTemplateChange, onApply, onToast }: Props) {
  const { language } = useI18n();
  const tr = (pl: string, en: string) => language === "en" ? en : pl;
  const [name, setName] = useState(() => language === "en" ? "My dashboard" : "Mój pulpit");
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = templates.find((template) => template.id === selectedId);

  useEffect(() => {
    if (selectedId && templates.some((template) => template.id === selectedId)) return;
    setSelectedId(templates[0]?.id ?? "");
  }, [templates, selectedId]);

  const save = () => {
    const template = createDashboardTemplate(name, grid, charts);
    onTemplatesChange([...templates, template]);
    setSelectedId(template.id);
    onToast(`${tr("Zapisano szablon", "Saved template")} „${template.name}”`);
  };
  const update = () => {
    if (!selected) return;
    onTemplatesChange(templates.map((template) => template.id === selected.id ? { ...createDashboardTemplate(name || selected.name, grid, charts), id: selected.id, createdAt: selected.createdAt } : template));
    onToast(tr("Zaktualizowano szablon", "Template updated"));
  };
  const remove = () => {
    if (!selected) return;
    const next = templates.filter((template) => template.id !== selected.id);
    onTemplatesChange(next);
    if (defaultTemplateId === selected.id) onDefaultTemplateChange(undefined);
    setSelectedId(next[0]?.id ?? "");
    onToast(tr("Usunięto szablon", "Template deleted"));
  };
  const exportTemplate = () => {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "uklad"}.odin-template.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDashboardTemplate(parsed)) throw new Error(tr("Nieprawidłowy format szablonu.", "Invalid template format."));
      const imported = { ...parsed, id: `template-${Date.now()}`, name: `${parsed.name} — import` };
      onTemplatesChange([...templates, imported]);
      setSelectedId(imported.id);
      onToast(tr("Zaimportowano szablon", "Template imported"));
    } catch (error) {
      onToast(error instanceof Error ? error.message : tr("Nie udało się zaimportować szablonu", "Could not import the template"));
    }
  };

  return <div className="template-toolbar">
    <div className="grid-picker"><span>{tr("WIDOK", "VIEW")}</span>{([1, 4, 9, "custom"] as DashboardGrid[]).map((value) => <button key={value} className={grid === value ? "active" : ""} onClick={() => onGridChange(value)}>{value === "custom" ? tr("Własny", "Custom") : value}</button>)}</div>
    <div className="template-save"><input aria-label={tr("Nazwa szablonu", "Template name")} value={name} onChange={(event) => setName(event.target.value)} /><button onClick={save}>{tr("Zapisz nowy", "Save new")}</button><button onClick={update} disabled={!selected}>{tr("Aktualizuj", "Update")}</button></div>
    <div className="template-library"><span>{tr("SZABLON", "TEMPLATE")}</span><select aria-label={tr("Zapisany szablon", "Saved template")} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); const template = templates.find((item) => item.id === event.target.value); if (template) setName(template.name); }}><option value="">{tr("Brak zapisanych", "None saved")}</option>{templates.map((template) => <option value={template.id} key={template.id}>{defaultTemplateId === template.id ? "★ " : ""}{template.name}</option>)}</select><button onClick={() => selected && onApply(selected)} disabled={!selected}>{tr("Zastosuj", "Apply")}</button><button onClick={() => selected && onDefaultTemplateChange(defaultTemplateId === selected.id ? undefined : selected.id)} disabled={!selected} title={tr("Ustaw jako domyślny", "Set as default")}>{selected && defaultTemplateId === selected.id ? "★" : "☆"}</button><button onClick={exportTemplate} disabled={!selected}>{tr("Eksport", "Export")}</button><button onClick={() => fileRef.current?.click()}>{tr("Import", "Import")}</button><button className="template-delete" onClick={remove} disabled={!selected}>×</button><input ref={fileRef} type="file" accept=".json,.odin-template.json,application/json" onChange={importTemplate} /></div>
  </div>;
}
