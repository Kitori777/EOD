import { useMemo, useState } from "react";

import { APP_VERSION } from "../version";
import { useI18n } from "../i18n/translations";

export type HelpDestination = "data" | "model" | "simulation" | "charts" | "diagnostics" | "settings";
type HelpTopic = "start" | "model" | "simulation" | "charts" | "diagnostics" | "settings" | "shortcuts";

type TopicCopy = {
  label: string;
  title: string;
  lead: string;
  steps: Array<{ title: string; description: string; effect: string }>;
  destination?: HelpDestination;
  action?: string;
};

const copy = {
  pl: {
    title: "Pomoc i instrukcje",
    subtitle: "Wybierz temat. Zobaczysz, co kliknąć, co się zmieni i dokąd przejść dalej.",
    search: "Szukaj: model, próg, wykres…",
    noResults: "Nie znaleziono takiej instrukcji.",
    local: "Dane i instrukcje pozostają na tym komputerze.",
    effect: "Wpływ",
    topics: {
      start: { label: "Pierwsze kroki", title: "Od pliku do pierwszego wyniku", lead: "Najkrótsza droga do analizy: wczytaj plik, sprawdź dane, zbuduj model i uruchom go.", destination: "data", action: "Otwórz dane", steps: [
        { title: "Wczytaj plik danych", description: "Kliknij „Wczytaj dane” i wybierz CSV, Excel, JSON lub inny obsługiwany format.", effect: "Powstaje lokalny zestaw danych; plik nie jest wysyłany do chmury." },
        { title: "Sprawdź podgląd", description: "W zakładce Dane zweryfikuj nazwy kolumn, daty i przykładowe wartości.", effect: "Kolumny liczbowe i czasowe stają się dostępne w modelu, wykresach i symulacji." },
        { title: "Uruchom model", description: "Przejdź do Model i symulacja, połącz bloki i kliknij „Uruchom”.", effect: "Panel wyników pokaże obliczenia, alerty oraz kolumny utworzone przez formuły." },
      ]},
      model: { label: "Budowa modelu", title: "Jak zbudować obliczenie od początku", lead: "Każdy blok wykonuje jeden krok, a relacja przekazuje wynik do następnego bloku.", destination: "model", action: "Otwórz budowę modelu", steps: [
        { title: "Dodaj blok", description: "Kliknij „+ Blok” i wybierz transformację, decyzję, metrykę albo wynik.", effect: "Transformacja tworzy nową kolumnę; metryka podsumowuje wartości; wynik kończy przepływ." },
        { title: "Skonfiguruj w Inspektorze", description: "Kliknij blok, wybierz kolumnę i regułę lub wpisz własną formułę.", effect: "Podgląd próbki od razu pokaże, czy formuła zwraca poprawne wartości." },
        { title: "Połącz bloki", description: "Kliknij port bloku źródłowego, a potem port bloku docelowego albo użyj „Relacja”.", effect: "Zmiana przechodzi dalej zgodnie z kolejnością grafu." },
      ]},
      simulation: { label: "Co-jeśli i pamięć", title: "Sprawdź skutek zmiany bez modyfikowania pliku", lead: "Symulacja tworzy wariant danych i pokazuje zmianę każdej kolumny oraz całego modelu.", destination: "simulation", action: "Otwórz symulację", steps: [
        { title: "Wybierz zmianę", description: "Wskaż kolumnę, operację, wartość oraz opcjonalny zakres czasu.", effect: "Oryginalne dane pozostają bez zmian; modyfikowany jest tylko wariant." },
        { title: "Sprawdź mapę wpływu", description: "Automatyczne relacje po nazwach, historii i formułach pokazują kolejne etapy reakcji.", effect: "Tabela pokaże wartość przed, po, różnicę i różnicę procentową dla każdej kolumny." },
        { title: "Zapisz w pamięci modelu", description: "W Parametrach zapisz np. „Prędkość +3%” wraz z okresem obowiązywania.", effect: "Po ponownym otwarciu projektu wpis nadal wpływa na obliczenia i może utworzyć nowy scenariusz." },
      ]},
      charts: { label: "Wykresy i progi", title: "Wykres, próg i dokładny czas zdarzenia", lead: "Kreator pozwala dobrać typ wykresu, wygląd, okres oraz dolną i górną granicę.", destination: "charts", action: "Otwórz wykresy", steps: [
        { title: "Wybierz osie", description: "Wybierz czas na osi X i jedną lub kilka wartości Y.", effect: "Podgląd na żywo aktualizuje się bez dodawania wykresu do pulpitu." },
        { title: "Dodaj granice", description: "Ustaw osobno dolny i górny próg ręczny lub percentylowy.", effect: "Linie przerywane i znaczniki pokażą każde dotknięcie albo przekroczenie granicy." },
        { title: "Zapisz lub eksportuj", description: "Dodaj wykres do pulpitu, zapisz szablon albo pobierz PNG/JPG.", effect: "Układ i progi można ponownie wykorzystać na innym zgodnym pliku." },
      ]},
      diagnostics: { label: "Diagnostyka", title: "Jak czytać jakość danych i ostrzeżenia", lead: "Najpierw widzisz prosty wniosek, niżej konkretne problemy oraz miejsca wymagające sprawdzenia.", destination: "diagnostics", action: "Otwórz diagnostykę", steps: [
        { title: "Przeczytaj werdykt", description: "Górna karta mówi, czy dane blokują analizę i z jakiego powodu.", effect: "Stała wartość jest informacją, a nie błędem, dopóki użytkownik nie oznaczy jej inaczej." },
        { title: "Otwórz wniosek", description: "Kliknij działanie przy problemie, aby przejść do danych, modelu lub symulacji.", effect: "Aplikacja otwiera miejsce, w którym można naprawić przyczynę." },
        { title: "Dostosuj zakres", description: "W ustawieniach diagnostyki wybierz sekcje, kolumny i poziomy komunikatów.", effect: "Projekt zapamiętuje własny układ diagnostyki." },
      ]},
      settings: { label: "Ustawienia", title: "Język, kolory i układ pracy", lead: "Zmiany wyglądu oraz paneli są natychmiastowe i zapisują się lokalnie.", destination: "settings", action: "Otwórz ustawienia", steps: [
        { title: "Zmień język", description: "Wybierz Polski albo English w sekcji Język i format.", effect: "Centrum pomocy, ustawienia i główne polecenia zmieniają język bez restartu." },
        { title: "Wybierz motyw i akcent", description: "Aurora to motyw jasny; Odin, Midnight i Graphite są ciemne.", effect: "Wykresy, dialogi, formularze i kolory stanów dopasowują kontrast." },
        { title: "Ustaw przestrzeń", description: "Włączaj Eksplorator, Inspektor i Panel wyników zależnie od zadania.", effect: "Poza budową modelu panele są ukrywane, aby zostawić więcej miejsca na analizę." },
      ]},
      shortcuts: { label: "Skróty", title: "Najważniejsze skróty klawiaturowe", lead: "Skróty działają w całej przestrzeni roboczej.", steps: [
        { title: "Ctrl K", description: "Otwiera paletę poleceń.", effect: "Szybko przejdziesz do modelu, danych, wykresów lub ustawień." },
        { title: "Ctrl B / Ctrl J", description: "Pokazuje lub ukrywa Eksplorator / Panel wyników.", effect: "Możesz odzyskać więcej miejsca bez zmiany układu projektu." },
        { title: "Esc", description: "Zamyka aktywne okno albo anuluje import.", effect: "Nie usuwa danych ani ustawień projektu." },
      ]},
    } satisfies Record<HelpTopic, TopicCopy>,
  },
  en: {
    title: "Help and guides",
    subtitle: "Choose a topic to see what to click, what changes and where to go next.",
    search: "Search: model, threshold, chart…",
    noResults: "No matching guide was found.",
    local: "Your data and guides stay on this computer.",
    effect: "Effect",
    topics: {
      start: { label: "First steps", title: "From a file to the first result", lead: "The shortest route: load a file, inspect the data, build a model and run it.", destination: "data", action: "Open data", steps: [
        { title: "Load a data file", description: "Click Load data and select CSV, Excel, JSON or another supported format.", effect: "A local dataset is created; the file is not uploaded to the cloud." },
        { title: "Inspect the preview", description: "In Data, verify field names, dates and sample values.", effect: "Numeric and time fields become available to models, charts and simulations." },
        { title: "Run the model", description: "Open Model & simulation, connect blocks and click Run.", effect: "The Results panel shows calculations, alerts and formula-generated fields." },
      ]},
      model: { label: "Build a model", title: "Build a calculation from scratch", lead: "Each block performs one step and each connection passes its result forward.", destination: "model", action: "Open model builder", steps: [
        { title: "Add a block", description: "Click + Block and choose a transform, decision, metric or result.", effect: "Transforms create fields, metrics summarize values and results finish the flow." },
        { title: "Configure in Inspector", description: "Select the block, choose a field and rule or enter a custom formula.", effect: "The sample preview immediately validates formula output." },
        { title: "Connect blocks", description: "Select the source and target ports or use Relation.", effect: "Changes flow forward in graph order." },
      ]},
      simulation: { label: "What-if & memory", title: "Test a change without editing the file", lead: "A simulation creates a variant and compares every field and the complete model.", destination: "simulation", action: "Open simulation", steps: [
        { title: "Choose a change", description: "Select a field, operation, value and optional time range.", effect: "The source data stays unchanged; only the variant is modified." },
        { title: "Inspect the impact map", description: "Name, history and formula based relationships reveal the next reaction steps.", effect: "The table shows before, after, absolute and percentage difference for every field." },
        { title: "Save to model memory", description: "In Parameters, save e.g. Speed +3% with its time range.", effect: "It survives reopening, affects calculations and can create a new scenario." },
      ]},
      charts: { label: "Charts & thresholds", title: "Charts, thresholds and exact event time", lead: "Choose a chart, appearance, time range and independent lower and upper limits.", destination: "charts", action: "Open charts", steps: [
        { title: "Choose axes", description: "Select time on X and one or more Y values.", effect: "The live preview updates before adding the chart to the dashboard." },
        { title: "Add boundaries", description: "Set separate manual or percentile lower and upper limits.", effect: "Dashed lines and markers show every touch or breach." },
        { title: "Save or export", description: "Add to dashboard, save a template or download PNG/JPG.", effect: "Layouts and thresholds can be reused on another compatible file." },
      ]},
      diagnostics: { label: "Diagnostics", title: "Understand data quality and warnings", lead: "Start with a plain conclusion, then inspect concrete issues and fields.", destination: "diagnostics", action: "Open diagnostics", steps: [
        { title: "Read the verdict", description: "The top card says whether the data blocks analysis and why.", effect: "A constant value is informational, not an error, unless configured otherwise." },
        { title: "Open a finding", description: "Use its action to jump to Data, Model or Simulation.", effect: "The app opens the place where the cause can be addressed." },
        { title: "Customize the scope", description: "Choose sections, fields and severities in diagnostic settings.", effect: "The project remembers your diagnostic layout." },
      ]},
      settings: { label: "Settings", title: "Language, colors and workspace", lead: "Appearance and panel changes are immediate and stored locally.", destination: "settings", action: "Open settings", steps: [
        { title: "Change language", description: "Choose Polski or English under Language & format.", effect: "Help, settings and primary commands switch without a restart." },
        { title: "Choose theme and accent", description: "Aurora is light; Odin, Midnight and Graphite are dark.", effect: "Charts, dialogs, forms and statuses retain appropriate contrast." },
        { title: "Arrange workspace", description: "Toggle Explorer, Inspector and Results for the current task.", effect: "Outside model building, auxiliary panels stay hidden to maximize analysis space." },
      ]},
      shortcuts: { label: "Shortcuts", title: "Essential keyboard shortcuts", lead: "These shortcuts work across the workspace.", steps: [
        { title: "Ctrl K", description: "Open the command palette.", effect: "Jump to the model, data, charts or settings." },
        { title: "Ctrl B / Ctrl J", description: "Toggle Explorer / Results panel.", effect: "Recover space without changing the project layout." },
        { title: "Esc", description: "Close the active window or cancel an import.", effect: "This does not delete project data or settings." },
      ]},
    } satisfies Record<HelpTopic, TopicCopy>,
  },
};

function ScreenPreview({ topic, language }: { topic: HelpTopic; language: "pl" | "en" }) {
  const label = (pl: string, en: string) => language === "en" ? en : pl;
  if (topic === "charts") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-chart-preview"><aside><b>{label("Oś X", "X axis")}</b><span>Timestamp</span><b>{label("Wartości Y", "Y values")}</b><span>Process_Value</span><b>{label("Granice", "Boundaries")}</b><span>40 — 60</span></aside><main><div className="help-chart-line" /><div className="help-limit top" /><div className="help-limit bottom" /><em className="help-alert-dot one" /><em className="help-alert-dot two" /></main></div></div>;
  if (topic === "model") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-model-preview"><span>{label("Źródło", "Source")}</span><b>→</b><span>{label("Formuła", "Formula")}</span><b>→</b><span>{label("Metryka", "Metric")}</span><b>→</b><span>{label("Wynik", "Result")}</span></div><div className="help-inspector-preview"><strong>{label("Inspektor", "Inspector")}</strong><span>{label("Kolumna", "Field")}</span><span>{label("Reguła obliczenia", "Calculation rule")}</span></div></div>;
  if (topic === "simulation") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-impact-preview"><header><span>{label("Przed", "Before")}</span><span>{label("Po zmianie", "After")}</span><span>{label("Różnica", "Difference")}</span></header>{["Line_Speed", "Dancer_Output", "Seal_Temp"].map((name, index) => <div key={name}><strong>{name}</strong><span>{50 + index * 4}</span><span>{((50 + index * 4) * 1.03).toFixed(2)}</span><b>+3%</b></div>)}</div></div>;
  if (topic === "diagnostics") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-diagnostic-preview"><strong>✓ {label("Dane nadają się do analizy", "Data is ready for analysis")}</strong><span>{label("Oś czasu: spójna", "Time axis: consistent")}</span><span>{label("Braki: 0", "Missing: 0")}</span><span className="warning">{label("2 pola do sprawdzenia", "2 fields to review")}</span></div></div>;
  if (topic === "settings") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-settings-preview"><aside><b>{label("Wygląd", "Appearance")}</b><span>{label("Język", "Language")}</span><span>{label("Przestrzeń", "Workspace")}</span></aside><main><b>{label("Motyw", "Theme")}</b><div><i /><i /><i /><i /></div><b>{label("Kolor akcentu", "Accent color")}</b><div><em /><em /><em /></div></main></div></div>;
  if (topic === "shortcuts") return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-keys-preview"><kbd>Ctrl K</kbd><span>{label("Paleta poleceń", "Command palette")}</span><kbd>Ctrl B</kbd><span>{label("Eksplorator", "Explorer")}</span><kbd>Ctrl J</kbd><span>{label("Wyniki", "Results")}</span><kbd>Esc</kbd><span>{label("Zamknij", "Close")}</span></div></div>;
  return <div className="help-screen"><div className="help-screen-bar"><i /><i /><i /></div><div className="help-start-preview"><span>1<small>{label("Dane", "Data")}</small></span><b>→</b><span>2<small>{label("Model", "Model")}</small></span><b>→</b><span>3<small>{label("Symulacja", "Simulation")}</small></span><b>→</b><span>4<small>{label("Wynik", "Result")}</small></span></div></div>;
}

export function HelpCenterDialog({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (destination: HelpDestination) => void }) {
  const { language } = useI18n();
  const [topic, setTopic] = useState<HelpTopic>("start");
  const [query, setQuery] = useState("");
  const content = copy[language];
  const topics = useMemo(() => (Object.entries(content.topics) as Array<[HelpTopic, TopicCopy]>).filter(([, item]) => `${item.label} ${item.title} ${item.lead} ${item.steps.map((step) => `${step.title} ${step.description} ${step.effect}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), [content, query]);
  if (!open) return null;
  const active: TopicCopy = content.topics[topic];
  return <div className="app-dialog-backdrop help-center-backdrop" onMouseDown={onClose}><section className="app-dialog help-center-dialog" role="dialog" aria-modal="true" aria-labelledby="help-center-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">EYES OF ODIN {APP_VERSION} · HELP CENTER</span><h2 id="help-center-title">{content.title}</h2><p>{content.subtitle}</p></div><button aria-label={language === "en" ? "Close help" : "Zamknij pomoc"} onClick={onClose}>×</button></header>
    <div className="help-center-body"><aside><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={content.search} autoFocus /></label><nav>{topics.map(([id, item], index) => <button key={id} className={topic === id ? "active" : ""} onClick={() => setTopic(id)}><i>{String(index + 1).padStart(2, "0")}</i><span>{item.label}</span><b>→</b></button>)}</nav>{!topics.length && <p className="help-no-results">{content.noResults}</p>}<small>● {content.local}</small></aside>
      <main><div className="help-topic-heading"><span>{active.label}</span><h3>{active.title}</h3><p>{active.lead}</p></div><ScreenPreview topic={topic} language={language} /><div className="help-steps">{active.steps.map((step, index) => <article key={step.title}><span>{index + 1}</span><div><strong>{step.title}</strong><p>{step.description}</p><small><b>{content.effect}:</b> {step.effect}</small></div></article>)}</div>{active.destination && <button className="primary-button help-open-action" onClick={() => onNavigate(active.destination!)}>{active.action} →</button>}</main></div>
    <footer><span>{language === "en" ? "Tip: use Ctrl K to jump anywhere in the app." : "Wskazówka: Ctrl K pozwala przejść w dowolne miejsce aplikacji."}</span><button className="secondary-button" onClick={onClose}>{language === "en" ? "Close" : "Zamknij"}</button></footer>
  </section></div>;
}
