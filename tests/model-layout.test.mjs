import assert from "node:assert/strict";
import test from "node:test";

import { findVacantNodePosition, hasNodeCollisions, layoutModelGraph, nodesOverlap } from "../src/mechanics/modeling/layout/model-layout.ts";

function node(id, x = 0, y = 0) {
  return { id, kind: "transform", title: id, subtitle: "", x, y };
}

test("finds a free position without clamping new nodes onto one point", () => {
  const nodes = Array.from({ length: 16 }, (_, index) => node(`n${index}`, 100 + (index % 4) * 270, 100 + Math.floor(index / 4) * 112));
  const position = findVacantNodePosition(nodes, nodes[5]);
  const probe = node("probe", position.x, position.y);
  assert.equal(nodes.some((current) => nodesOverlap(current, probe)), false);
});

test("lays out a 25-node model deterministically without collisions", () => {
  const nodes = Array.from({ length: 25 }, (_, index) => node(`n${index}`, 930, 500));
  const edges = nodes.slice(1).map((current, index) => ({ id: `e${index}`, from: `n${Math.floor(index / 2)}`, to: current.id }));
  const first = layoutModelGraph(nodes, edges);
  const second = layoutModelGraph(nodes, edges);
  assert.deepEqual(first, second);
  assert.equal(hasNodeCollisions(first), false);
});
