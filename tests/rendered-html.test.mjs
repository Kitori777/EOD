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
  assert.match(builder, /Zakres czasu/);
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
  assert.match(studio, /chart-editor-drawer/);
  assert.match(studio, /chart-card-summary/);
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
  assert.match(preferences, /eyes-of-odin-preferences-v2/);
  assert.match(preferences, /reduceMotion/);
  assert.match(translations, /Application settings/);
  assert.match(styles, /data-theme="midnight"/);
  assert.match(styles, /data-accent="violet"/);
});

test("workspace panels are actionable and the chart view has no reserved empty row", async () => {
  const [application, styles] = await Promise.all([
    readFile(new URL("../src/app/EyesOfOdin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/styles/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(application, /setShowExplorer/);
  assert.match(application, /setShowInspector/);
  assert.match(application, /setBottomPanelMode/);
  assert.match(application, /if \(controller\.signal\.aborted\) throw new DOMException\("Import anulowany\."/);
  assert.match(application, /Pomoc i informacje/);
  assert.match(application, /Pobrano raport porównania/);
  assert.match(styles, /\.main-grid\.charts-mode \{ grid-template-rows: minmax\(0, 1fr\); \}/);
  assert.doesNotMatch(styles, /\.main-grid\.charts-mode \{ grid-template-rows: minmax\(480px, 1fr\) 118px; \}/);
});

test("ships an offline Windows target as version 0.1.0", async () => {
  const [desktopMain, desktopHtml, tauriConfig, cargoConfig, packageJson] = await Promise.all([
    readFile(new URL("../src/desktop/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const config = JSON.parse(tauriConfig);
  assert.match(desktopMain, /import EyesOfOdin from "\.\.\/app\/EyesOfOdin"/);
  assert.match(desktopHtml, /<div id="root"><\/div>/);
  assert.equal(config.productName, "Eyes of Odin");
  assert.equal(config.version, "0.1.0");
  assert.equal(JSON.parse(packageJson).version, "0.1.0");
  assert.equal(config.identifier, "com.eyesofodin.scenariostudio");
  assert.equal(config.build.frontendDist, "../desktop-dist");
  assert.deepEqual(config.bundle.targets, ["nsis"]);
  assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
  assert.match(cargoConfig, /version = "0.1.0"/);
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
