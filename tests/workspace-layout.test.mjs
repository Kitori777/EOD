import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCanvasPan,
  clampWorkspacePanelSize,
  DEFAULT_WORKSPACE_SIZES,
} from "../src/app/layout/workspace-layout.ts";

test("workspace panel sizes stay inside usable desktop bounds", () => {
  assert.equal(clampWorkspacePanelSize("explorer", 40), 180);
  assert.equal(clampWorkspacePanelSize("explorer", 800), 420);
  assert.equal(clampWorkspacePanelSize("inspector", 40), 220);
  assert.equal(clampWorkspacePanelSize("inspector", 800), 460);
  assert.equal(clampWorkspacePanelSize("results", 900, 1000), 600);
  assert.equal(clampWorkspacePanelSize("results", 20, 1000), 100);
  assert.deepEqual(DEFAULT_WORKSPACE_SIZES, { explorerWidth: 238, inspectorWidth: 272, resultsHeight: 170 });
});

test("canvas pan follows the left-button pointer delta", () => {
  assert.deepEqual(
    calculateCanvasPan({ x: 25, y: -15 }, { x: 200, y: 100 }, { x: 245, y: 70 }),
    { x: 70, y: -45 },
  );
});
