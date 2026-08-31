import assert from "node:assert/strict";
import test from "node:test";

import { resolveModelConnection, reverseModelConnection } from "../src/mechanics/modeling/engine/model-graph-editor.ts";

const nodes = [
  { id: "source", kind: "source", title: "Dane", subtitle: "", x: 0, y: 0 },
  { id: "transform", kind: "transform", title: "Zmiana", subtitle: "", x: 200, y: 0 },
  { id: "metric", kind: "metric", title: "Metryka", subtitle: "", x: 400, y: 0 },
  { id: "result", kind: "result", title: "Wynik", subtitle: "", x: 600, y: 0 },
];

test("creates a directed relation between two model blocks", () => {
  assert.deepEqual(resolveModelConnection("transform", "metric", nodes, []), { ok: true, from: "transform", to: "metric" });
});

test("normalizes source and result direction regardless of click order", () => {
  assert.deepEqual(resolveModelConnection("transform", "source", nodes, []), { ok: true, from: "source", to: "transform" });
  assert.deepEqual(resolveModelConnection("result", "metric", nodes, []), { ok: true, from: "metric", to: "result" });
});

test("rejects duplicate relations and cycles", () => {
  const edges = [
    { id: "e1", from: "source", to: "transform" },
    { id: "e2", from: "transform", to: "metric" },
  ];
  assert.equal(resolveModelConnection("source", "transform", nodes, edges).ok, false);
  assert.equal(resolveModelConnection("metric", "transform", nodes, edges).ok, false);
});

test("reverses a relation only when the resulting graph remains valid", () => {
  const edge = { id: "e1", from: "transform", to: "metric" };
  assert.deepEqual(reverseModelConnection(edge, nodes, [edge]), { ok: true, from: "metric", to: "transform" });
  const sourceEdge = { id: "e2", from: "source", to: "transform" };
  assert.equal(reverseModelConnection(sourceEdge, nodes, [sourceEdge]).ok, false);
});
