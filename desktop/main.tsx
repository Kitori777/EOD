import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EyesOfOdin from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Nie znaleziono głównego elementu aplikacji.");
}

createRoot(root).render(
  <StrictMode>
    <EyesOfOdin />
  </StrictMode>,
);
