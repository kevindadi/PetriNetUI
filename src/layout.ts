import cytoscape from "cytoscape";
import type { NetPosition } from "./model";

export type LayoutNode = { id: string; width: number; height: number };
export type LayoutEdge = { source: string; target: string };

export type LayoutOptions = {
  /** Force-directed repulsion strength (cose). */
  nodeRepulsion?: number;
  /** Force-directed ideal edge length (cose). */
  idealEdgeLength?: number;
  /** Concentric ring spacing (concentric). */
  ringSpacing?: number;
};

/**
 * Scale force-directed coordinates so the minimum node gap reaches `gap` (small
 * graphs), or fit the bounding box to a target area (large graphs).
 */
function normalizeToGap(
  centers: Record<string, { x: number; y: number }>,
  gap: number,
): Record<string, { x: number; y: number }> {
  const ids = Object.keys(centers);
  if (ids.length === 0) return centers;
  let minX = Infinity;
  let minY = Infinity;
  for (const id of ids) {
    minX = Math.min(minX, centers[id].x);
    minY = Math.min(minY, centers[id].y);
  }
  const pts = ids.map((id) => ({ id, x: centers[id].x - minX, y: centers[id].y - minY }));
  let scale = 1;
  if (pts.length <= 150) {
    let minGap = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > 0 && d < minGap) minGap = d;
      }
    }
    if (minGap > 0 && minGap < gap) scale = gap / minGap;
  } else {
    let maxX = 0;
    let maxY = 0;
    for (const p of pts) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    scale = Math.min(1600 / (maxX || 1), 1200 / (maxY || 1));
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (const p of pts) out[p.id] = { x: p.x * scale, y: p.y * scale };
  return out;
}

function toTopLeft(
  centers: Record<string, { x: number; y: number }>,
  nodes: LayoutNode[],
): Record<string, NetPosition> {
  const out: Record<string, NetPosition> = {};
  for (const n of nodes) {
    const c = centers[n.id];
    if (c) out[n.id] = { x: c.x - n.width / 2, y: c.y - n.height / 2 };
  }
  return out;
}

function cyElements(nodes: LayoutNode[], edges: LayoutEdge[]) {
  return [
    ...nodes.map((n) => ({ data: { id: n.id } })),
    ...edges.map((e, i) => ({ data: { id: `le${i}`, source: e.source, target: e.target } })),
  ];
}

/**
 * Force-directed layout (Cytoscape `cose`). Keeps connected nodes close, so
 * arcs stay short even for cyclic nets — unlike layered (dagre) layouts that
 * stretch back-edges across the whole canvas.
 */
export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions = {},
): Record<string, NetPosition> {
  if (nodes.length === 0) return {};
  const cy = cytoscape({
    headless: true,
    elements: cyElements(nodes, edges),
  });
  cy.layout({
    name: "cose",
    animate: false,
    nodeRepulsion: () => opts.nodeRepulsion ?? 60000,
    idealEdgeLength: () => opts.idealEdgeLength ?? 260,
    nodeOverlap: 40,
    edgeElasticity: () => 60,
  }).run();
  const centers: Record<string, { x: number; y: number }> = {};
  cy.nodes().forEach((n) => {
    const p = n.position();
    centers[n.id()] = { x: p.x, y: p.y };
  });
  return toTopLeft(normalizeToGap(centers, 130), nodes);
}

/**
 * Concentric layout by a per-node level (e.g. BFS distance from the initial
 * state). The level-0 node sits at the center and rings grow outward, so
 * back-edges between adjacent rings stay short.
 */
export function computeConcentricLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  level: Record<string, number>,
  opts: LayoutOptions = {},
): Record<string, NetPosition> {
  if (nodes.length === 0) return {};
  const cy = cytoscape({
    headless: true,
    elements: cyElements(nodes, edges),
  });
  cy.layout({
    name: "concentric",
    animate: false,
    concentric: (n) => level[n.id()] ?? 0,
    levelWidth: () => opts.ringSpacing ?? 120,
    minNodeSpacing: opts.ringSpacing ?? 120,
    startAngle: -Math.PI / 2,
    clockwise: true,
    equidistant: true,
  }).run();
  const centers: Record<string, { x: number; y: number }> = {};
  cy.nodes().forEach((n) => {
    const p = n.position();
    centers[n.id()] = { x: p.x, y: p.y };
  });
  return toTopLeft(normalizeToGap(centers, 130), nodes);
}
