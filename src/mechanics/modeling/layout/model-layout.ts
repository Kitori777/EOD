import type { ModelEdge, ModelNode } from "../types/model-types";

export const MODEL_NODE_WIDTH = 184;
export const MODEL_NODE_HEIGHT = 70;
export const MODEL_GRID_SIZE = 20;

const COLUMN_GAP = 86;
const ROW_GAP = 42;

export type GraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export function snapModelCoordinate(value: number, grid = MODEL_GRID_SIZE) {
  return Math.max(0, Math.round(value / grid) * grid);
}

export function nodesOverlap(first: ModelNode, second: ModelNode, padding = 18) {
  return first.x < second.x + MODEL_NODE_WIDTH + padding
    && first.x + MODEL_NODE_WIDTH + padding > second.x
    && first.y < second.y + MODEL_NODE_HEIGHT + padding
    && first.y + MODEL_NODE_HEIGHT + padding > second.y;
}

export function hasNodeCollisions(nodes: ModelNode[]) {
  return nodes.some((node, index) => nodes.slice(index + 1).some((other) => nodesOverlap(node, other)));
}

export function findVacantNodePosition(nodes: ModelNode[], anchor: ModelNode, snapToGrid = true) {
  const stepX = MODEL_NODE_WIDTH + COLUMN_GAP;
  const stepY = MODEL_NODE_HEIGHT + ROW_GAP;
  const candidates: Array<{ x: number; y: number }> = [];

  for (let column = 1; column <= Math.max(4, nodes.length + 1); column += 1) {
    for (let row = 0; row <= nodes.length + 2; row += 1) {
      const offsets = row === 0 ? [0] : [row * stepY, -row * stepY];
      for (const offset of offsets) {
        candidates.push({ x: anchor.x + column * stepX, y: Math.max(30, anchor.y + offset) });
      }
    }
  }

  const candidate = candidates.find((position) => {
    const probe: ModelNode = { ...anchor, id: "__probe__", x: position.x, y: position.y };
    return nodes.every((node) => !nodesOverlap(probe, node));
  }) ?? { x: anchor.x + stepX, y: anchor.y + (nodes.length + 1) * stepY };

  return {
    x: snapToGrid ? snapModelCoordinate(candidate.x) : candidate.x,
    y: snapToGrid ? snapModelCoordinate(candidate.y) : candidate.y,
  };
}

export function layoutModelGraph(nodes: ModelNode[], edges: ModelEdge[]) {
  if (nodes.length < 2) return nodes.map((node) => ({ ...node }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const level = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const target of outgoing.get(current) ?? []) {
      level.set(target, Math.max(level.get(target) ?? 0, (level.get(current) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if ((indegree.get(target) ?? 0) === 0) queue.push(target);
    }
  }

  let fallbackLevel = Math.max(0, ...level.values());
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      fallbackLevel += 1;
      level.set(node.id, fallbackLevel);
    }
  }

  const columns = new Map<number, ModelNode[]>();
  for (const node of nodes) {
    const nodeLevel = level.get(node.id) ?? 0;
    columns.set(nodeLevel, [...(columns.get(nodeLevel) ?? []), node]);
  }

  const maxRows = Math.max(...[...columns.values()].map((column) => column.length));
  const layout = new Map<string, { x: number; y: number }>();
  for (const [columnIndex, column] of [...columns.entries()].sort(([a], [b]) => a - b)) {
    const startY = 50 + ((maxRows - column.length) * (MODEL_NODE_HEIGHT + ROW_GAP)) / 2;
    column.forEach((node, rowIndex) => {
      layout.set(node.id, {
        x: snapModelCoordinate(60 + columnIndex * (MODEL_NODE_WIDTH + COLUMN_GAP)),
        y: snapModelCoordinate(startY + rowIndex * (MODEL_NODE_HEIGHT + ROW_GAP)),
      });
    });
  }

  return nodes.map((node) => ({ ...node, ...(layout.get(node.id) ?? {}) }));
}

export function getGraphBounds(nodes: ModelNode[]): GraphBounds {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 1120, maxY: 600, width: 1120, height: 600 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + MODEL_NODE_WIDTH));
  const maxY = Math.max(...nodes.map((node) => node.y + MODEL_NODE_HEIGHT));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
