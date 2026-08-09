import { useState } from "react";

import { useI18n } from "../i18n/translations";
import { useAppPreferences, type AccentColor, type AppTheme } from "./preferences";

type SettingsSection = "appearance" | "language" | "workspace" | "about";

type Props = {
  open: boolean;
  showExplorer: boolean;
  showInspector: boolean;
  showResults: boolean;
  onShowExplorer: (visible: boolean) => void;
  onShowInspector: (visible: boolean) => void;
  onShowResults: (visible: boolean) => void;
  onClose: () => void;
  onRestoreLayout: () => void;
};

const themes: Array<{ id: AppTheme; label: string; colors: string[] }> = [
  { id: "odin", label: "Odin Dark", colors: ["#07090d", "#151a24", "#39d8c2"] },
  { id: "midnight", label: "Midnight", colors: ["#070b14", "#111a2b", "#5f8cff"] },
  { id: "graphite", label: "Graphite", colors: ["#101113", "#1a1c20", "#a78bfa"] },
];

const accents: Array<{ id: AccentColor; color: string; label: string }> = [
  { id: "teal", color: "#39d8c2", label: "Teal" },
  { id: "blue", color: "#5f8cff", label: "Blue" },
  { id: "violet", color: "#a78bfa", label: "Violet" },
  { id: "amber", color: "#f5b85b", label: "Amber" },
];

export function SettingsDialog(props: Props) {
  const [section, setSection] = useState<SettingsSection>("appearance");
  const { preferences, updatePreferences, resetPreferences } = useAppPreferences();
  const { t } = useI18n();
  if (!props.open) return null;

  const restoreAll = () => {
    resetPreferences();
    props.onRestoreLayout();
  };

  return (
    <div className="app-dialog-backdrop" onMouseDown={props.onClose}>
      <section className="app-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">EYES OF ODIN</span><h2 id="settings-title">{t("settingsTitle")}</h2></div><button aria-label={t("done")} onClick={props.onClose}>×</button></header>
        <div className="settings-body">
          <nav aria-label={t("settings")}>
            {(["appearance", "language", "workspace", "about"] as SettingsSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}><span>{item === "appearance" ? "◐" : item === "language" ? "文" : item === "workspace" ? "▦" : "ⓘ"}</span>{t(item)}</button>)}
          </nav>
          <div className="settings-content">
            <p>{t("settingsDescription")}</p>
            {section === "appearance" && <>
              <div className="setting-group"><div className="setting-copy"><strong>{t("theme")}</strong><small>{t("themeDescription")}</small></div><div className="theme-grid">{themes.map((theme) => <button key={theme.id} className={preferences.theme === theme.id ? "active" : ""} onClick={() => updatePreferences({ theme: theme.id })}><span>{theme.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{theme.label}</strong></button>)}</div></div>
              <div className="setting-row"><div className="setting-copy"><strong>{t("accent")}</strong><small>{t("themeDescription")}</small></div><div className="accent-grid">{accents.map((accent) => <button key={accent.id} className={preferences.accent === accent.id ? "active" : ""} onClick={() => updatePreferences({ accent: accent.id })} title={accent.label} style={{ "--swatch": accent.color } as React.CSSProperties} />)}</div></div>
              <div className="setting-row"><div className="setting-copy"><strong>{t("density")}</strong><small>{preferences.density === "compact" ? t("compact") : t("comfortable")}</small></div><div className="segmented"><button className={preferences.density === "comfortable" ? "active" : ""} onClick={() => updatePreferences({ density: "comfortable" })}>{t("comfortable")}</button><button className={preferences.density === "compact" ? "active" : ""} onClick={() => updatePreferences({ density: "compact" })}>{t("compact")}</button></div></div>
              <Toggle label={t("reduceMotion")} description={t("reduceMotionDescription")} checked={preferences.reduceMotion} onChange={(reduceMotion) => updatePreferences({ reduceMotion })} />
            </>}
            {section === "language" && <div className="setting-group"><div className="setting-copy"><strong>{t("appLanguage")}</strong><small>{t("appLanguageDescription")}</small></div><div className="language-grid"><button className={preferences.language === "pl" ? "active" : ""} onClick={() => updatePreferences({ language: "pl" })}><span>PL</span><strong>{t("polish")}</strong></button><button className={preferences.language === "en" ? "active" : ""} onClick={() => updatePreferences({ language: "en" })}><span>EN</span><strong>{t("english")}</strong></button></div></div>}
            {section === "workspace" && <>
              <Toggle label={t("explorer")} description={t("explorerDescription")} checked={props.showExplorer} onChange={props.onShowExplorer} />
              <Toggle label={t("inspector")} description={t("inspectorDescription")} checked={props.showInspector} onChange={props.onShowInspector} />
              <Toggle label={t("resultsPanel")} description={t("resultsDescription")} checked={props.showResults} onChange={props.onShowResults} />
              <Toggle label={t("snapGrid")} description={t("snapGridDescription")} checked={preferences.snapToGrid} onChange={(snapToGrid) => updatePreferences({ snapToGrid })} />
            </>}
            {section === "about" && <div className="about-settings"><div className="about-mark"><span className="brand-mark"><i /><i /><i /></span><div><strong>Eyes of Odin</strong><small>{t("version")} 0.1.0</small></div></div><p>✓ {t("localFirst")}</p><a href="https://github.com/Kitori2137/EyesOfOdin/releases/latest" target="_blank" rel="noreferrer">{t("checkUpdates")} <span>↗</span></a><small>{t("releaseDescription")}</small></div>}
          </div>
        </div>
        <footer><button className="secondary-button" onClick={restoreAll}>{t("restoreDefaults")}</button><button className="primary-button" onClick={props.onClose}>{t("done")}</button></footer>
      </section>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="setting-row setting-toggle"><span className="setting-copy"><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}
