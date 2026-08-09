import type { DashboardGrid, DashboardTemplate } from "../../mechanics/charts/templates/dashboard-templates";
import type { ChartDefinition, DataRow } from "../../mechanics/charts/types/chart-types";
import type { DatasetMeta } from "../../mechanics/data/types/data-types";
import type { ModelEdge, ModelNode, Scenario, ViewId } from "../../mechanics/modeling/types/model-types";
import type { Point } from "../layout/workspace-layout";

export const WORKSPACE_MARKER_KEY = "eyes-of-odin-workspace-v2";
export const LEGACY_WORKSPACE_KEY = "eyes-of-odin-workspace-v1";

export type WorkspaceSnapshot = {
  version: 2;
  rows: DataRow[];
  headers: string[];
  datasetName: string;
  datasetId: string;
  datasetMeta: DatasetMeta;
  charts: ChartDefinition[];
  dashboardGrid: DashboardGrid;
  templates: DashboardTemplate[];
  defaultTemplateId?: string;
  nodes: ModelNode[];
  edges: ModelEdge[];
  scenarios: Scenario[];
  scenarioId: string;
  selectedNodeId: string;
  view: ViewId;
  zoom: number;
  canvasPan: Point;
};

const DATABASE_NAME = "eyes-of-odin";
const STORE_NAME = "workspace";
const SNAPSHOT_KEY = "latest";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Nie udało się otworzyć lokalnego zapisu projektu."));
  });
}

export function hasSavedWorkspace(): boolean {
  return localStorage.getItem(WORKSPACE_MARKER_KEY) !== null || localStorage.getItem(LEGACY_WORKSPACE_KEY) !== null;
}

export async function loadWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (typeof indexedDB === "undefined") {
    const fallback = localStorage.getItem(WORKSPACE_MARKER_KEY);
    return fallback ? JSON.parse(fallback) as WorkspaceSnapshot : null;
  }
  const database = await openDatabase();
  try {
    return await new Promise<WorkspaceSnapshot | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve((request.result as WorkspaceSnapshot | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Nie udało się odczytać lokalnego projektu."));
    });
  } finally {
    database.close();
  }
}

export async function saveWorkspace(snapshot: WorkspaceSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") {
    localStorage.setItem(WORKSPACE_MARKER_KEY, JSON.stringify(snapshot));
    return;
  }
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Nie udało się zapisać lokalnego projektu."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Przerwano zapis lokalnego projektu."));
    });
    localStorage.setItem(WORKSPACE_MARKER_KEY, JSON.stringify({ version: 2, savedAt: new Date().toISOString() }));
  } finally {
    database.close();
  }
}
