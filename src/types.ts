import type { Node, Edge } from "@xyflow/react";

export type PlaceData = {
  kind: "place";
  label: string;
  tokens: number;
};

export type TransitionData = {
  kind: "transition";
  label: string;
};

export type ArcType = "normal" | "reset" | "inhibitor";

export type ArcData = {
  weight: number;
  arcType: ArcType;
};

export type PetriNode = Node<PlaceData | TransitionData, "place" | "transition">;
export type PetriEdge = Edge<ArcData, "arc">;

export type PetriNet = {
  nodes: PetriNode[];
  edges: PetriEdge[];
};

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createPlace(x: number, y: number): Node<PlaceData, "place"> {
  return {
    id: nextId("p"),
    type: "place",
    position: { x, y },
    data: { kind: "place", label: `P${idCounter}`, tokens: 0 },
  };
}

export function createTransition(x: number, y: number): Node<TransitionData, "transition"> {
  return {
    id: nextId("t"),
    type: "transition",
    position: { x, y },
    data: { kind: "transition", label: `T${idCounter}` },
  };
}

export function createArc(
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string | null,
  weight = 1,
  arcType: ArcType = "normal",
): PetriEdge {
  return {
    id: nextId("a"),
    type: "arc",
    source,
    target,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
    data: { weight, arcType },
  };
}
