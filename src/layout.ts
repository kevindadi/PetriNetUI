import dagre from "@dagrejs/dagre";
import type { NetPosition } from "./model";

export type LayoutNode = { id: string; width: number; height: number };
export type LayoutEdge = { source: string; target: string };

export type LayoutOptions = {
  rankdir?: "LR" | "TB";
  nodesep?: number;
  ranksep?: number;
};

/**
 * Dot-style layered layout (Sugiyama algorithm via dagre).
 * Returns top-left positions keyed by node id.
 */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions = {},
): Record<string, NetPosition> {
  if (nodes.length === 0) return {};
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.rankdir ?? "LR",
    nodesep: opts.nodesep ?? 70,
    ranksep: opts.ranksep ?? 110,
    marginx: 30,
    marginy: 30,
  });
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const positions: Record<string, NetPosition> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    if (p) positions[n.id] = { x: p.x - n.width / 2, y: p.y - n.height / 2 };
  }
  return positions;
}