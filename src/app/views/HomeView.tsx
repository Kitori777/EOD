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
            {hasSavedWorkspace && <button className="home-secondary" onClick={onResume}>{t("resume")}<span>→</span></button>}
            <button className="home-secondary home-empty-project" onClick={onStartEmpty}>{english ? "Empty project" : "Pusty projekt"}<span>→</span></button>
          </div>
          <div className="home-trust"><span>13 {english ? "formats" : "formatów"}</span><span>{english ? "local processing" : "obliczenia lokalne"}</span><span>{english ? "no account" : "bez konta"}</span></div>
        </div>

        <aside className="home-preview" aria-label={english ? "Application preview" : "Podgląd możliwości aplikacji"}>
          <div className="home-preview-top">
            <span>{english ? "LIVE OVERVIEW" : "PODGLĄD NA ŻYWO"}</span>
            <strong>{english ? "Results at a glance" : "Wyniki w jednym miejscu"}</strong>
            <i><b />{english ? "ready" : "gotowy"}</i>
          </div>
          <div className="home-preview-chart">
            <div className="home-preview-metric"><span>{english ? "Current value" : "Bieżąca wartość"}</span><strong>108,4</strong><small>↗ 8,4% {english ? "since start" : "od początku"}</small></div>
            <div className="home-preview-range"><span>{english ? "SAFE RANGE" : "BEZPIECZNY ZAKRES"}</span><strong>90–110</strong></div>
            <svg viewBox="0 0 600 214" role="img" aria-label={english ? "Sample value and limit chart" : "Przykładowy wykres wartości i limitów"}>
              <defs><linearGradient id="previewArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2fc8b5" stopOpacity=".24"/><stop offset="1" stopColor="#2fc8b5" stopOpacity="0"/></linearGradient></defs>
              <g className="preview-grid"><line x1="26" x2="574" y1="45" y2="45"/><line x1="26" x2="574" y1="103" y2="103"/><line x1="26" x2="574" y1="161" y2="161"/></g>
              <rect x="26" y="62" width="548" height="83" className="preview-safe" />
              <line x1="26" x2="574" y1="62" y2="62" className="preview-limit"/><line x1="26" x2="574" y1="145" y2="145" className="preview-limit"/>
              <path d="M26 147 L76 138 L126 143 L176 119 L226 126 L276 98 L326 106 L376 81 L426 91 L476 62 L526 74 L574 47 L574 190 L26 190 Z" className="preview-area" />
              <polyline points="26,147 76,138 126,143 176,119 226,126 276,98 326,106 376,81 426,91 476,62 526,74 574,47" className="preview-line"/>
              <circle cx="574" cy="47" r="6" className="preview-point" />
            </svg>
          </div>
          <div className="home-preview-footer"><span><i className="dot-teal" />{english ? "value trend" : "trend wartości"}</span><span><i className="dot-muted" />{english ? "configured limits" : "ustawione limity"}</span><strong>12 {english ? "points" : "punktów"}</strong></div>
        </aside>

      </main>
    </section>
  );
}
