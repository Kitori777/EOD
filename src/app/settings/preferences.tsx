import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguage = "pl" | "en";
export type AppTheme = "odin" | "midnight" | "graphite";
export type AccentColor = "teal" | "blue" | "violet" | "amber";
export type InterfaceDensity = "comfortable" | "compact";

export type AppPreferences = {
  language: AppLanguage;
  theme: AppTheme;
  accent: AccentColor;
  density: InterfaceDensity;
  reduceMotion: boolean;
  snapToGrid: boolean;
};

const STORAGE_KEY = "eyes-of-odin-preferences-v2";

export const DEFAULT_PREFERENCES: AppPreferences = {
  language: "pl",
  theme: "odin",
  accent: "teal",
  density: "comfortable",
  reduceMotion: false,
  snapToGrid: true,
};

type PreferencesContextValue = {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  resetPreferences: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AppPreferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_PREFERENCES;
  }
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(readPreferences);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.density;
    root.dataset.reduceMotion = String(preferences.reduceMotion);
    root.lang = preferences.language;
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    updatePreferences: (patch) => setPreferences((current) => ({ ...current, ...patch })),
    resetPreferences: () => setPreferences(DEFAULT_PREFERENCES),
  }), [preferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("AppPreferencesProvider is missing.");
  return value;
}
