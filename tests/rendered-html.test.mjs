import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("desktop build contains the Eyes of Odin application shell", async () => {
  const html = await readFile(new URL("../desktop-dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Eyes of Odin — Scenario Studio<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /assets\/index-/i);
});

test("source contains the chart studio, time range and local workspace", async () => {
  const [application, builder, chartEngine] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/components/ChartBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/engine/chart-engine.ts", import.meta.url), "utf8"),
  ]);
  assert.match(application, /ChartStudio/);
  assert.match(application, /localStorage\.setItem/);
  assert.match(builder, /type="datetime-local"/);
  assert.match(builder, /Dzień i godzina/);
  assert.match(builder, /Własna formuła/);
  assert.match(builder, /type="datetime-local"/);
  assert.match(chartEngine, /passesTimeRange/);
});

test("source provides a calm home screen and an on-demand chart editor", async () => {
  const [application, home, studio] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/views/HomeView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/components/ChartStudio.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(application, /homeOpen/);
  assert.match(home, /t\("loadData"\)/);
  assert.match(home, /t\("resume"\)/);
  assert.match(home, /Pusty projekt/);
  assert.doesNotMatch(home, /home-launchpad/);
  assert.match(home, /home-preview-slot--feature/);
  assert.match(home, /home-preview-slot--alerts/);
  assert.match(home, /home-preview-slot--events/);
  assert.match(home, /Ostatnia sesja na tym urządzeniu/);
  assert.match(home, /Cały proces w jednym spojrzeniu/);
  assert.match(studio, /chart-editor-drawer/);
  assert.match(studio, /chart-card-summary/);
  assert.match(studio, /Edytuj wykres/);
  assert.match(studio, /Zapisz jako PNG/);
  assert.match(studio, /Zapisz jako JPG/);
});

test("new workspaces start empty while continue restores the full saved dataset", async () => {
  const [application, storage] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/storage/workspace-storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(application, /useState<DataRow\[]>\(\[\]\)/);
  assert.match(application, /useState<ChartDefinition\[]>\(\[\]\)/);
  assert.match(application, /useState<ModelNode\[]>\(\[\]\)/);
  assert.match(application, /Pusty projekt/);
  assert.match(application, /startEmptyWorkspace/);
  assert.match(application, /onResume=\{\(\) => void resumeWorkspace\(\)\}/);
  assert.match(application, /isMeaningfulLegacyWorkspace/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /rows: DataRow\[]/);
  assert.match(storage, /datasetMeta: DatasetMeta/);
  assert.match(storage, /version: 2 \| 3 \| 4 \| 5 \| 6/);
  assert.match(storage, /modelMode\?: ModelWorkspaceMode/);
  assert.match(application, /snapshot\.view === "compare" \? "simulate"/);
  assert.match(application, /responseMode: "auto"/);
  assert.match(application, /econometricModel: "auto"/);
  assert.match(application, /econometricMaxLag: 12/);
  assert.match(storage, /objectStore\(STORE_NAME\)\.put\(snapshot/);
});

test("what-if studio lets the user select the econometric method", async () => {
  const studio = await readFile(new URL("../src/mechanics/simulation/components/WhatIfStudio.tsx", import.meta.url), "utf8");
  assert.match(studio, /ZACHOWANIE PROCESU/);
  assert.match(studio, /Dobierz automatycznie/);
  assert.match(studio, /econometricModel: "ols"/);
  assert.match(studio, /econometricModel: "arx"/);
  assert.match(studio, /econometricModel: "arx-trend"/);
  assert.match(studio, /Maksymalne opóźnienie/);
  assert.match(studio, /econometricMaxLag/);
});

test("settings provide persisted themes, accents, languages and workspace controls", async () => {
  const [settings, preferences, translations, styles] = await Promise.all([
    readFile(new URL("../src/app/settings/SettingsDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/settings/preferences.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/i18n/translations.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/styles/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(settings, /appearance.*language.*workspace.*about/s);
  assert.match(settings, /Odin Dark/);
  assert.match(preferences, /eyes-of-odin-preferences-v3/);
  assert.match(preferences, /"aurora"/);
  assert.match(preferences, /reduceMotion/);
  assert.match(translations, /Application settings/);
  assert.match(styles, /data-theme="midnight"/);
  assert.match(styles, /data-theme="aurora"/);
  assert.match(styles, /data-accent="violet"/);
});

test("project settings persist model constants and customizable analysis views", async () => {
  const [application, dialog, verification, diagnostics, storage] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/modeling/components/ModelSettingsDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/modeling/components/ModelVerificationStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/simulation/components/DiagnosticStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/storage/workspace-storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(application, /modelParameters.*modelMemory.*verificationPreferences.*diagnosticPreferences/s);
  assert.match(application, /applyModelMemory/);
  assert.match(application, /version: 8/);
  assert.match(storage, /modelParameters\?: ModelParameter\[]/);
  assert.match(storage, /modelMemory\?: ModelMemoryEntry\[]/);
  assert.match(storage, /verificationPreferences\?: VerificationPreferences/);
  assert.match(storage, /diagnosticPreferences\?: DiagnosticPreferences/);
  assert.match(dialog, /Stałe modelu/);
  assert.match(dialog, /Pamięć modelu/);
  assert.match(dialog, /Zapamiętane zachowanie danych/);
  assert.match(dialog, /Własne punkty kontrolne/);
  assert.match(dialog, /Monitorowane kolumny/);
  assert.match(verification, /Edytuj listę/);
  assert.match(diagnostics, /Dostosuj widok/);
});

test("workspace panels are actionable and the chart view has no reserved empty row", async () => {
  const [application, styles, help] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/styles/app.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/help/HelpCenterDialog.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(application, /setShowExplorer/);
  assert.match(application, /setShowInspector/);
  assert.match(application, /setBottomPanelMode/);
  assert.match(application, /handleCanvasPointerDown/);
  assert.match(application, /calculateCanvasPan/);
  assert.match(application, /onPointerMove=\{handleNodePointerMove\}/);
  assert.match(application, /onPointerUp=\{stopNodeDrag\}/);
  assert.match(application, /setSelectedNodeId\(node\.id\); setShowInspector\(true\)/);
  assert.match(application, /Przeciągnij, aby przenieść · kliknij, aby edytować/);
  assert.match(application, /workspace-resizer explorer-resizer/);
  assert.match(application, /workspace-resizer inspector-resizer/);
  assert.match(application, /workspace-resizer results-resizer/);
  assert.match(application, /if \(controller\.signal\.aborted\) throw new DOMException\("Import anulowany\."/);
  assert.match(application, /HelpCenterDialog/);
  assert.match(help, /Pomoc i instrukcje/);
  assert.match(help, /Help and guides/);
  assert.match(application, /Pobrano porównanie aktualnych danych/);
  assert.match(styles, /\.main-grid\.charts-mode \{ grid-template-rows: minmax\(0, 1fr\); \}/);
  assert.match(styles, /\.dashboard-viewport\.dashboard-grid-4/);
  assert.match(styles, /dashboard-count-2/);
  assert.match(styles, /data-theme="aurora"\] \.quality-grid article/);
  assert.match(styles, /grid-template-rows: minmax\(300px, 1fr\) var\(--results, 170px\)/);
  assert.doesNotMatch(styles, /\.main-grid\.charts-mode \{ grid-template-rows: minmax\(480px, 1fr\) 118px; \}/);
});

test("home preview and chart dashboard expose four views and paged chart sets", async () => {
  const [home, studio, templates] = await Promise.all([
    readFile(new URL("../src/app/views/HomeView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/components/ChartStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/templates/dashboard-templates.ts", import.meta.url), "utf8"),
  ]);
  assert.match(home, /03 · .*ROZKŁAD/);
  assert.match(home, /04 · .*ZDARZENIA/);
  assert.match(home, /Histogram wartości/);
  assert.match(home, /Zdarzenia według okresu/);
  assert.match(studio, /pageRanges/);
  assert.match(studio, /Pokaż wykresy/);
  assert.match(studio, /range\.from.*range\.to/s);
  assert.match(templates, /thresholds: \(chart\.thresholds \?\? \[\]\)\.map/);
});

test("what-if and diagnostics use the imported dataset instead of a fixed sales story", async () => {
  const [application, diagnostics, whatIf, builder, styles] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/simulation/components/DiagnosticStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/simulation/components/WhatIfStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/mechanics/charts/components/ChartBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/styles/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(application, /WhatIfStudio/);
  assert.match(application, /ModelVerificationStudio/);
  assert.match(application, /"Build" : "Budowa"/);
  assert.match(application, /"Simulation" : "Symulacja"/);
  assert.match(application, /"Verification" : "Weryfikacja"/);
  assert.match(application, /DiagnosticStudio/);
  assert.match(whatIf, /Wszystkie automatycznie/);
  assert.match(whatIf, /Zmiany we wszystkich kolumnach/);
  assert.doesNotMatch(whatIf, /CZY TEN WARIANT ZADZIA/);
  assert.match(diagnostics, /Czy z tym plikiem można bezpiecznie pracować/);
  assert.match(diagnostics, /Stałość sama w sobie nie oznacza błędu/);
  assert.match(diagnostics, /Pokaż analizę techniczną/);
  assert.match(diagnostics, /Czy analiza zadziała po użyciu tych danych/);
  assert.match(diagnostics, /Podsumowanie/);
  assert.match(diagnostics, /Do sprawdzenia/);
  assert.match(diagnostics, /Pola i zależności/);
  assert.match(diagnostics, /ZACZNIJ TUTAJ/);
  assert.match(styles, /\.diagnostic-mode-switcher/);
  assert.match(styles, /\.diagnostic-next-step/);
  assert.match(application, /Brak diagnostyki/);
  assert.doesNotMatch(application, /Cena premium \+8%/);
  assert.doesNotMatch(application, /Rynek DACH/);
  assert.match(builder, /Wygląd wykresu/);
  assert.match(builder, /type="color"/);
  assert.match(styles, /data-theme="aurora"\] \.field-checks button/);
});

test("model inspector exposes real rule, column and connection controls", async () => {
  const application = await readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8");
  assert.match(application, /Kolumna z danych/);
  assert.match(application, /Reguła źródłowa/);
  assert.match(application, /Dodaj połączenie/);
  assert.match(application, /Wybierz blok docelowy/);
  assert.match(application, /Usuń relację/);
  assert.match(application, /Cofnij usunięcie/);
  assert.match(application, /Duplikuj blok/);
  assert.match(application, /Własna formuła/);
  assert.match(application, /Zbuduj przykład z danych/);
  assert.match(application, /PRZEBIEG/);
});

test("ships an offline Windows target as version 0.1.2", async () => {
  const [desktopMain, desktopHtml, tauriConfig, cargoConfig, packageJson, appVersion] = await Promise.all([
    readFile(new URL("../src/desktop/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../src/app/version.ts", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(tauriConfig);
  assert.match(desktopMain, /import EyesOfOdin from "\.\.\/app\/EyesOfOdin"/);
  assert.match(desktopHtml, /<div id="root"><\/div>/);
  assert.equal(config.productName, "Eyes of Odin");
  assert.equal(config.version, "0.1.2");
  assert.equal(JSON.parse(packageJson).version, "0.1.2");
  assert.equal(config.identifier, "com.eyesofodin.scenariostudio");
  assert.equal(config.build.frontendDist, "../desktop-dist");
  assert.deepEqual(config.bundle.targets, ["nsis"]);
  assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
  assert.match(cargoConfig, /version = "0.1.2"/);
  assert.match(appVersion, /APP_VERSION = "0.1.2"/);
  assert.match(cargoConfig, /tauri = \{ version = "2"/);
  await access(new URL("../src-tauri/icons/icon.ico", import.meta.url));
  await access(new URL("../src/mechanics/charts/components/ChartStudio.tsx", import.meta.url));
  await access(new URL("../src/mechanics/data/workers/workbook.worker.ts", import.meta.url));
  await access(new URL("../src/mechanics/data/workers/delimited.worker.ts", import.meta.url));
  await access(new URL("../src/mechanics/data/importers/parquet-import.ts", import.meta.url));
});

test("removed starter stacks do not remain in the desktop repository", async () => {
  for (const path of ["../app", "../worker", "../db", "../drizzle", "../examples", "../.openai", "../next.config.ts", "../vite.config.ts"]) {
    await assert.rejects(access(new URL(path, import.meta.url)));
  }
});

test("ships three ready datasets in CSV and XLSX", async () => {
  for (const interval of ["5-minutes", "10-minutes", "15-minutes"]) {
    const stem = `eyes_of_odin_${interval.replace("-minutes", "_minutes")}`;
    await access(new URL(`../data/ready/${interval}/${stem}.csv`, import.meta.url));
    await access(new URL(`../data/ready/${interval}/${stem}.xlsx`, import.meta.url));
  }
});
