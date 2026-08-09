export type WorkspacePanel = "explorer" | "inspector" | "results";

export type Point = {
  x: number;
  y: number;
};

export const DEFAULT_WORKSPACE_SIZES = {
  explorerWidth: 238,
  inspectorWidth: 272,
  resultsHeight: 170,
} as const;

export function clampWorkspacePanelSize(panel: WorkspacePanel, value: number, viewportHeight = 900) {
  if (panel === "explorer") return Math.min(420, Math.max(180, value));
  if (panel === "inspector") return Math.min(460, Math.max(220, value));
  return Math.min(Math.max(100, viewportHeight * 0.6), Math.max(100, value));
}

export function calculateCanvasPan(origin: Point, start: Point, current: Point): Point {
  return {
    x: origin.x + current.x - start.x,
    y: origin.y + current.y - start.y,
  };
}
