import {
  bumpIdCounter,
  patchArcData,
  stripNetAttrs,
  type ArcData,
  type NetKind,
  type PetriEdge,
  type PetriNode,
  type PlaceData,
  type TransitionData,
} from "./types";

/** Semantic model — carries structure and marking only, no layout. */
export type SemanticPlace = { id: string; data: PlaceData };
export type SemanticTransition = { id: string; data: TransitionData };
export type SemanticArc = { id: string; source: string; target: string; data: ArcData };

export type SemanticNet = {
  netKind: NetKind;
  places: SemanticPlace[];
  transitions: SemanticTransition[];
  arcs: SemanticArc[];
};

export type NetPosition = { x: number; y: number };
export type NetGraphics = { positions: Record<string, NetPosition> };

export function flowToSemantic(
  nodes: PetriNode[],
  edges: PetriEdge[],
  netKind: NetKind,
): SemanticNet {
  return {
    netKind,
    places: nodes
      .filter((n) => n.type === "place")
      .map((n) => ({ id: n.id, data: n.data as PlaceData })),
    transitions: nodes
      .filter((n) => n.type === "transition")
      .map((n) => ({ id: n.id, data: n.data as TransitionData })),
    arcs: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: e.data as ArcData,
    })),
  };
}

export function positionsFromFlow(nodes: PetriNode[]): Record<string, NetPosition> {
  const positions: Record<string, NetPosition> = {};
  for (const n of nodes) positions[n.id] = { x: n.position.x, y: n.position.y };
  return positions;
}

export function semanticToFlow(
  sem: SemanticNet,
  positions: Record<string, NetPosition> = {},
): { nodes: PetriNode[]; edges: PetriEdge[] } {
  const nodes: PetriNode[] = [];
  for (const p of sem.places) {
    nodes.push({
      id: p.id,
      type: "place",
      position: positions[p.id] ?? { x: 0, y: 0 },
      data: stripNetAttrs(sem.netKind, p.data) as PlaceData,
    });
  }
  for (const t of sem.transitions) {
    nodes.push({
      id: t.id,
      type: "transition",
      position: positions[t.id] ?? { x: 0, y: 0 },
      data: stripNetAttrs(sem.netKind, t.data) as TransitionData,
    });
  }
  const edges: PetriEdge[] = sem.arcs.map((a) => ({
    id: a.id,
    type: "arc",
    source: a.source,
    target: a.target,
    sourceHandle: "out",
    targetHandle: "in",
    data: patchArcData(a.data, {}),
  }));
  return { nodes, edges };
}

export function bumpIdCounterForIds(ids: string[]): void {
  let max = 0;
  for (const id of ids) {
    const m = id.match(/_(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max > 0) bumpIdCounter(max);
}