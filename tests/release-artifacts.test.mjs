import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseRoot = new URL("../releases/0.1.0/", import.meta.url);

test("release 0.1.0 contains verified setup and portable executables", async () => {
  const manifest = await readFile(new URL("SHA256SUMS.txt", releaseRoot), "utf8");
  const expected = new Map(manifest.trim().split(/\r?\n/).map((line) => {
    const [hash, ...name] = line.trim().split(/\s+/);
    return [name.join(" "), hash];
  }));

  for (const name of ["Eyes of Odin Setup 0.1.0.exe", "Eyes of Odin Portable 0.1.0.exe"]) {
    const binary = await readFile(new URL(name, releaseRoot));
    const actual = createHash("sha256").update(binary).digest("hex").toUpperCase();
    assert.equal(actual, expected.get(name));
    assert.ok(binary.length > 1_000_000);
  }
});

test("one-command installer resolves the latest verified GitHub release", async () => {
  const installer = await readFile(new URL("../scripts/install.ps1", import.meta.url), "utf8");
  assert.match(installer, /Kitori2137\/EyesOfOdin/);
  assert.match(installer, /SHA256/);
  assert.match(installer, /releases\/latest/);
  assert.match(installer, /EyesOfOdin-Updater/);
  assert.match(installer, /'\/S'/);
});

test("GitHub tags build and publish all Windows release assets", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const packager = await readFile(new URL("../scripts/package-release.ps1", import.meta.url), "utf8");
  assert.match(workflow, /tags: \["v\*"\]/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(packager, /Get-FileHash/);
  assert.match(packager, /Eyes of Odin Portable/);
});
