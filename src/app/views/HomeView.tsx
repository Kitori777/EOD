type Props = {
  datasetName: string;
  totalRows: number;
  chartCount: number;
  hasSavedWorkspace: boolean;
  onOpenFile: () => void;
  onResume: () => void;
  onOpenSample: () => void;
  onOpenModel: () => void;
};

export function HomeView({ datasetName, totalRows, chartCount, hasSavedWorkspace, onOpenFile, onResume, onOpenSample, onOpenModel }: Props) {
  const { t, language, locale } = useI18n();
  return (
    <section className="home-view">
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <div><strong>EYES OF ODIN</strong><small>LOCAL DATA STUDIO</small></div>
        </div>
        <span className="home-version">0.1.0 · lokalnie</span>
      </header>

      <div className="home-content">
        <div className="home-hero">
          <span className="eyebrow">{t("homeTagline")}</span>
          <h1>{t("homeTitle")}<br /><em>{t("homeTitleAccent")}</em></h1>
          <p>{t("homeDescription")}</p>
          <div className="home-hero-actions">
            <button className="home-primary" onClick={onOpenFile}><span>＋</span> {t("loadData")}</button>
            <button className="home-secondary" onClick={onResume} disabled={!hasSavedWorkspace}>{t("resume")} <span>→</span></button>
          </div>
          <div className="home-trust"><span>✓ {t("dataFormats")}</span><span>✓ {t("localData")}</span><span>✓ {t("noAccount")}</span></div>
        </div>

        <div className="home-preview" aria-label="Podgląd możliwości aplikacji">
          <div className="home-preview-top"><span>AKTYWNY PODGLĄD</span><strong>Wyniki w jednym miejscu</strong><i>● gotowy</i></div>
          <div className="home-preview-chart">
            <div className="home-preview-metric"><span>Ostatnia wartość</span><strong>108,4</strong><small>+8,4% względem początku</small></div>
            <svg viewBox="0 0 540 190" role="img" aria-label="Przykładowy wykres wartości i limitów">
              <g className="preview-grid"><line x1="28" x2="520" y1="38" y2="38"/><line x1="28" x2="520" y1="92" y2="92"/><line x1="28" x2="520" y1="146" y2="146"/></g>
              <rect x="28" y="53" width="492" height="79" className="preview-safe" />
              <line x1="28" x2="520" y1="53" y2="53" className="preview-limit"/><line x1="28" x2="520" y1="132" y2="132" className="preview-limit"/>
              <polyline points="28,124 72,118 116,121 160,104 204,108 248,88 292,93 336,76 380,82 424,60 468,68 520,42" className="preview-line"/>
              <circle cx="520" cy="42" r="5" className="preview-point" />
            </svg>
          </div>
          <div className="home-preview-footer"><span><i className="dot-teal" /> trend</span><span><i className="dot-muted" /> bezpieczny zakres 90–110</span><strong>12 punktów</strong></div>
        </div>

        <div className="home-section-title"><div><span>ROZPOCZNIJ</span><strong>Wybierz sposób pracy</strong></div><small>W każdej chwili możesz przejść do innego widoku.</small></div>
        <div className="home-actions-grid">
          <button className="home-action-card featured" onClick={onOpenFile}><span className="home-action-icon">▦</span><div><strong>{language === "en" ? "Open your data" : "Otwórz własne dane"}</strong><p>{language === "en" ? "CSV, Excel, JSON, Parquet and 9 more formats." : "CSV, Excel, JSON, Parquet i 9 innych formatów."}</p></div><i>→</i></button>
          <button className="home-action-card" onClick={onOpenSample}><span className="home-action-icon purple">▥</span><div><strong>{language === "en" ? "Try the sample" : "Wypróbuj przykład"}</strong><p>{language === "en" ? "A ready sales dashboard with two charts." : "Gotowy pulpit sprzedaży z dwoma wykresami."}</p></div><i>→</i></button>
          <button className="home-action-card" onClick={onOpenModel}><span className="home-action-icon amber">◇</span><div><strong>{language === "en" ? "Build a scenario" : "Zbuduj scenariusz"}</strong><p>{language === "en" ? "Connect data, decisions and results in a what-if model." : "Połącz dane, decyzje i wyniki w model „co, jeśli”."}</p></div><i>→</i></button>
        </div>

        <div className="home-recent">
          <div><span className="home-recent-icon">▦</span><div><small>{language === "en" ? "LAST WORKSPACE" : "OSTATNIA PRZESTRZEŃ"}</small><strong>{datasetName}</strong><p>{totalRows.toLocaleString(locale)} {language === "en" ? "records" : "rekordów"} · {chartCount} {language === "en" ? "charts" : "wykresy"} · {language === "en" ? "local save" : "zapis lokalny"}</p></div></div>
          <button onClick={onResume}>{language === "en" ? "Open" : "Otwórz"} <span>→</span></button>
        </div>
      </div>
    </section>
  );
}
import { useI18n } from "../i18n/translations";
