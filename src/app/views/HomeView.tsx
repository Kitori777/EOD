import { useI18n } from "../i18n/translations";
import { APP_VERSION } from "../version";

type Props = {
  hasSavedWorkspace: boolean;
  onOpenFile: () => void;
  onResume: () => void;
  onStartEmpty: () => void;
};

export function HomeView({ hasSavedWorkspace, onOpenFile, onResume, onStartEmpty }: Props) {
  const { t, language } = useI18n();
  const english = language === "en";

  return (
    <section className="home-view">
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <div><strong>EYES OF ODIN</strong><small>LOCAL DATA STUDIO</small></div>
        </div>
        <div className="home-header-meta"><span className="home-local-dot" />{english ? "Private by design" : "Dane zostają u Ciebie"}<span className="home-version">{APP_VERSION}</span></div>
      </header>

      <main className="home-content">
        <div className="home-hero">
          <span className="eyebrow">{t("homeTagline")}</span>
          <h1>{t("homeTitle")}<br /><em>{t("homeTitleAccent")}</em></h1>
          <p>{t("homeDescription")}</p>
          <div className="home-hero-actions">
            <button className="home-primary" onClick={onOpenFile}><span>＋</span>{t("loadData")}</button>
            {hasSavedWorkspace && (
              <button className="home-secondary home-resume" onClick={onResume}>
                <span className="home-resume-copy"><b>{t("resume")}</b><small>{english ? "Last session on this device" : "Ostatnia sesja na tym urządzeniu"}</small></span>
                <i>→</i>
              </button>
            )}
            <button className="home-empty-project" onClick={onStartEmpty}>{english ? "Empty project" : "Pusty projekt"}<span>→</span></button>
          </div>
          <div className="home-trust" aria-label={english ? "Application benefits" : "Najważniejsze cechy aplikacji"}>
            <span><b>13</b>{english ? "data formats" : "formatów danych"}</span>
            <span><b>100%</b>{english ? "local processing" : "obliczeń lokalnie"}</span>
            <span><b>0</b>{english ? "accounts required" : "wymaganych kont"}</span>
          </div>
        </div>

        <aside className="home-preview" aria-label={english ? "Application preview" : "Podgląd możliwości aplikacji"}>
          <div className="home-preview-top">
            <div>
              <span>{english ? "LIVE OVERVIEW" : "PODGLĄD NA ŻYWO"}</span>
              <strong>{english ? "See the whole process at a glance" : "Cały proces w jednym spojrzeniu"}</strong>
            </div>
            <i><b />{english ? "local analysis" : "analiza lokalna"}</i>
          </div>
          <div className="home-preview-grid">
            <div className="home-preview-slot home-preview-slot--feature">
              <header><div><span>01 · {english ? "PROCESS TREND" : "TREND PROCESU"}</span><small>{english ? "Last 24 hours" : "Ostatnie 24 godziny"}</small></div><strong>108,4 <em>+8,4%</em></strong></header>
              <svg viewBox="0 0 460 116" aria-hidden="true"><defs><linearGradient id="homeTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><rect x="8" y="29" width="444" height="55" className="preview-safe"/><line x1="8" x2="452" y1="29" y2="29" className="preview-limit"/><line x1="8" x2="452" y1="84" y2="84" className="preview-limit"/><path d="M8 89 L48 80 L88 84 L128 66 L168 72 L208 51 L248 61 L288 39 L328 47 L368 24 L408 31 L452 14 L452 108 L8 108 Z" className="preview-feature-area"/><polyline points="8,89 48,80 88,84 128,66 168,72 208,51 248,61 288,39 328,47 368,24 408,31 452,14" className="preview-line"/><circle cx="452" cy="14" r="5" className="preview-point"/></svg>
              <footer><span><i className="dot-teal" />{english ? "within configured limits" : "w ustawionych granicach"}</span><b>90—110</b></footer>
            </div>

            <div className="home-preview-slot home-preview-slot--alerts">
              <header><div><span>02 · {english ? "ALERTS" : "ALERTY"}</span><small>{english ? "Requires attention" : "Wymagają uwagi"}</small></div><strong>3</strong></header>
              <div className="home-alert-list"><span><i className="critical" />12:40 <b>{english ? "above limit" : "powyżej limitu"}</b></span><span><i />10:15 <b>{english ? "contact" : "kontakt"}</b></span><span><i />08:05 <b>{english ? "contact" : "kontakt"}</b></span></div>
            </div>

            <div className="home-preview-slot home-preview-histogram">
              <header><div><span>03 · {english ? "DISTRIBUTION" : "ROZKŁAD"}</span><small>{english ? "Value histogram" : "Histogram wartości"}</small></div><strong>P90</strong></header>
              <svg viewBox="0 0 220 78" aria-hidden="true"><g className="preview-bars"><rect x="12" y="60" width="15" height="10"/><rect x="32" y="52" width="15" height="18"/><rect x="52" y="38" width="15" height="32"/><rect x="72" y="22" width="15" height="48"/><rect x="92" y="10" width="15" height="60"/><rect x="112" y="17" width="15" height="53"/><rect x="132" y="31" width="15" height="39"/><rect x="152" y="46" width="15" height="24"/><rect x="172" y="57" width="15" height="13"/><rect x="192" y="64" width="15" height="6"/></g></svg>
            </div>

            <div className="home-preview-slot home-preview-slot--events">
              <header><div><span>04 · {english ? "EVENTS" : "ZDARZENIA"}</span><small>{english ? "Events by period" : "Zdarzenia według okresu"}</small></div><strong>12 <em>−2</em></strong></header>
              <svg viewBox="0 0 460 78" aria-hidden="true"><g className="preview-bars preview-bars-alert"><rect x="20" y="55" width="42" height="15"/><rect x="82" y="38" width="42" height="32"/><rect x="144" y="48" width="42" height="22"/><rect x="206" y="20" width="42" height="50"/><rect x="268" y="31" width="42" height="39"/><rect x="330" y="12" width="42" height="58"/><rect x="392" y="46" width="42" height="24"/></g></svg>
            </div>
          </div>
          <div className="home-preview-footer"><span><i className="dot-teal" />{english ? "live diagnostics" : "diagnostyka na żywo"}</span><span><i className="dot-muted" />{english ? "configured limits" : "ustawione limity"}</span><strong><b>4</b> {english ? "views ready" : "gotowe widoki"}</strong></div>
        </aside>

      </main>
    </section>
  );
}
