import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the Eyes of Odin workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Eyes of Odin — Scenario Studio<\/title>/i);
  assert.match(html, /EYES OF ODIN/);
  assert.match(html, /Model wzrostu sprzedaży/);
  assert.match(html, /WYNIKI/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the scenario engine and removes the temporary preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function parseCsv/);
  assert.match(page, /const calculate = \(item: Scenario\)/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /choices: \{ pricing: "1", campaign: "4", market: "9" \}/);
  assert.match(layout, /lang="pl"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await access(new URL("../.openai/hosting.json", import.meta.url));
  await access(root);
});

test("includes an offline Windows desktop target", async () => {
  const [desktopMain, desktopHtml, tauriConfig, cargoConfig] = await Promise.all([
    readFile(new URL("../desktop/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  ]);

  const config = JSON.parse(tauriConfig);
  assert.match(desktopMain, /import EyesOfOdin from "\.\.\/app\/page"/);
  assert.match(desktopHtml, /<div id="root"><\/div>/);
  assert.equal(config.productName, "Eyes of Odin");
  assert.equal(config.identifier, "com.eyesofodin.scenariostudio");
  assert.equal(config.build.frontendDist, "../desktop-dist");
  assert.deepEqual(config.bundle.targets, ["nsis"]);
  assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
  assert.match(cargoConfig, /tauri = \{ version = "2"/);
  await access(new URL("../src-tauri/icons/icon.ico", import.meta.url));
  await access(new URL("../desktop-dist/index.html", import.meta.url));
});
