import type { ModelEdge, ModelNode } from "../types/model-types";

export type ModelConnectionPlan =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: string };

function pathExists(edges: ModelEdge[], start: string, target: string): boolean {
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    edges.filter((edge) => edge.from === current).forEach((edge) => pending.push(edge.to));
  }
  return false;
}

export function resolveModelConnection(fromId: string, toId: string, nodes: ModelNode[], edges: ModelEdge[]): ModelConnectionPlan {
  if (!fromId || !toId) return { ok: false, reason: "Wybierz dwa bloki do połączenia." };
  if (fromId === toId) return { ok: false, reason: "Blok nie może być połączony sam ze sobą." };
  let from = nodes.find((node) => node.id === fromId);
  let to = nodes.find((node) => node.id === toId);
  if (!from || !to) return { ok: false, reason: "Nie znaleziono jednego z wybranych bloków." };

  // Źródło zawsze rozpoczyna przepływ, a wynik zawsze go kończy — kolejność kliknięć nie ma znaczenia.
  if (from.kind === "result" || to.kind === "source") [from, to] = [to, from];
  if (from.kind === "result") return { ok: false, reason: "Blok Wynik nie może przekazywać danych dalej." };
  if (to.kind === "source") return { ok: false, reason: "Blok Źródło nie może przyjmować połączeń." };
  if (edges.some((edge) => edge.from === from.id && edge.to === to.id)) return { ok: false, reason: "Takie połączenie już istnieje." };
  if (pathExists(edges, to.id, from.id)) return { ok: false, reason: "To połączenie utworzyłoby zamkniętą pętlę w modelu." };
  return { ok: true, from: from.id, to: to.id };
}

export function reverseModelConnection(edge: ModelEdge, nodes: ModelNode[], edges: ModelEdge[]): ModelConnectionPlan {
  const plan = resolveModelConnection(edge.to, edge.from, nodes, edges.filter((candidate) => candidate.id !== edge.id));
  if (plan.ok && plan.from === edge.from && plan.to === edge.to) return { ok: false, reason: "Tej relacji nie można odwrócić ze względu na rolę Źródła lub Wyniku." };
  return plan;
}
