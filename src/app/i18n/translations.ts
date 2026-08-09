import { useAppPreferences } from "../settings/preferences";

const pl = {
  settings: "Ustawienia",
  settingsTitle: "Ustawienia aplikacji",
  settingsDescription: "Dostosuj wygląd i sposób pracy. Zmiany zapisują się automatycznie na tym komputerze.",
  appearance: "Wygląd",
  language: "Język i format",
  workspace: "Przestrzeń robocza",
  about: "Aplikacja",
  theme: "Motyw",
  themeDescription: "Wybierz bazową kolorystykę interfejsu",
  accent: "Kolor akcentu",
  density: "Gęstość interfejsu",
  comfortable: "Wygodna",
  compact: "Kompaktowa",
  reduceMotion: "Ogranicz animacje",
  reduceMotionDescription: "Mniej ruchu podczas otwierania i przełączania widoków",
  appLanguage: "Język aplikacji",
  appLanguageDescription: "Zmiana jest widoczna od razu",
  polish: "Polski",
  english: "English",
  explorer: "Eksplorator",
  explorerDescription: "Pliki, modele i scenariusze",
  inspector: "Inspektor",
  inspectorDescription: "Właściwości aktywnego elementu",
  resultsPanel: "Panel wyników",
  resultsDescription: "Metryki, dane i problemy",
  snapGrid: "Przyciągaj bloki do siatki",
  snapGridDescription: "Ułatwia tworzenie równego i czytelnego modelu",
  restoreDefaults: "Przywróć domyślne",
  done: "Gotowe",
  version: "Wersja",
  localFirst: "Dane pozostają na tym komputerze",
  checkUpdates: "Sprawdź aktualizacje",
  releaseDescription: "Pobierz najnowszy instalator z oficjalnego wydania GitHub.",
  homeTagline: "TWOJE DANE. TWOJE DECYZJE.",
  homeTitle: "Zobacz zmianę,",
  homeTitleAccent: "zanim ją wprowadzisz.",
  homeDescription: "Wczytaj dane, ustaw osie i limity, a potem porównuj wiele widoków bez wysyłania plików do chmury.",
  loadData: "Wczytaj dane",
  resume: "Kontynuuj pracę",
  dataFormats: "13 formatów",
  localData: "dane lokalne",
  noAccount: "bez konta",
  start: "Start",
  model: "Model",
  data: "Dane",
  charts: "Wykresy",
  paths: "Ścieżki",
  compare: "Porównaj",
  run: "Uruchom",
  search: "Szukaj lub uruchom polecenie",
  arrange: "Uporządkuj",
  block: "Blok",
  relation: "Relacja",
  saved: "zapisano",
  ready: "gotowy",
} as const;

const en: Record<keyof typeof pl, string> = {
  settings: "Settings", settingsTitle: "Application settings", settingsDescription: "Adjust the appearance and workspace. Changes are saved automatically on this computer.",
  appearance: "Appearance", language: "Language & format", workspace: "Workspace", about: "Application", theme: "Theme", themeDescription: "Choose the base interface palette",
  accent: "Accent color", density: "Interface density", comfortable: "Comfortable", compact: "Compact", reduceMotion: "Reduce motion", reduceMotionDescription: "Use fewer animations when opening and switching views",
  appLanguage: "Application language", appLanguageDescription: "The change is applied immediately", polish: "Polski", english: "English", explorer: "Explorer", explorerDescription: "Files, models and scenarios",
  inspector: "Inspector", inspectorDescription: "Properties of the active item", resultsPanel: "Results panel", resultsDescription: "Metrics, data and issues", snapGrid: "Snap blocks to grid", snapGridDescription: "Keeps the model even and readable",
  restoreDefaults: "Restore defaults", done: "Done", version: "Version", localFirst: "Your data stays on this computer", checkUpdates: "Check for updates", releaseDescription: "Download the newest installer from the official GitHub release.",
  homeTagline: "YOUR DATA. YOUR DECISIONS.", homeTitle: "See the change,", homeTitleAccent: "before you make it.", homeDescription: "Load data, set axes and limits, then compare multiple views without sending files to the cloud.",
  loadData: "Load data", resume: "Resume work", dataFormats: "13 formats", localData: "local data", noAccount: "no account", start: "Start", model: "Model", data: "Data", charts: "Charts", paths: "Paths", compare: "Compare",
  run: "Run", search: "Search or run a command", arrange: "Arrange", block: "Block", relation: "Relation", saved: "saved", ready: "ready",
};

export type TranslationKey = keyof typeof pl;

export function useI18n() {
  const { preferences } = useAppPreferences();
  const dictionary = preferences.language === "en" ? en : pl;
  return { t: (key: TranslationKey) => dictionary[key], language: preferences.language, locale: preferences.language === "en" ? "en-US" : "pl-PL" };
}
