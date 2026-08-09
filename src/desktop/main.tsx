import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EyesOfOdin from "../app/EyesOfOdin";
import { AppPreferencesProvider } from "../app/settings/preferences";
import "../app/styles/app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Nie znaleziono głównego elementu aplikacji.");
}

createRoot(root).render(
  <StrictMode>
    <AppPreferencesProvider><EyesOfOdin /></AppPreferencesProvider>
  </StrictMode>,
);
