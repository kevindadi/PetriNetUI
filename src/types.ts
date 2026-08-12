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

export function nextId(prefix: string): string {
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

export type AIPlace = {
  id?: string;
  label?: string;
  tokens?: number;
  x?: number;
  y?: number;
};

export type AITransition = {
  id?: string;
  label?: string;
  x?: number;
  y?: number;
};

export type AIArc = {
  from?: string;
  to?: string;
  weight?: number;
  type?: ArcType;
};

export type AIPetriNet = {
  places?: AIPlace[];
  transitions?: AITransition[];
  arcs?: AIArc[];
};

export function aiNetToPetriNet(net: AIPetriNet): PetriNet {
  const nodes: PetriNode[] = [];
  const edges: PetriEdge[] = [];
  const idMap: Record<string, string> = {};

  for (const p of net.places ?? []) {
    const nodeId = p.id && p.id.length > 0 ? p.id : nextId("p");
    idMap[p.id ?? nodeId] = nodeId;
    nodes.push({
      id: nodeId,
      type: "place",
      position: { x: p.x ?? 100, y: p.y ?? 100 },
      data: {
        kind: "place",
        label: p.label ?? nodeId,
        tokens: Math.max(0, Math.floor(p.tokens ?? 0)),
      },
    });
  }

  for (const t of net.transitions ?? []) {
    const nodeId = t.id && t.id.length > 0 ? t.id : nextId("t");
    idMap[t.id ?? nodeId] = nodeId;
    nodes.push({
      id: nodeId,
      type: "transition",
      position: { x: t.x ?? 100, y: t.y ?? 100 },
      data: { kind: "transition", label: t.label ?? nodeId },
    });
  }

  for (const a of net.arcs ?? []) {
    const source = a.from ? idMap[a.from] : undefined;
    const target = a.to ? idMap[a.to] : undefined;
    if (!source || !target || source === target) continue;
    const sNode = nodes.find((n) => n.id === source);
    const tNode = nodes.find((n) => n.id === target);
    if (!sNode || !tNode || sNode.type === tNode.type) continue;
    edges.push(
      createArc(
        source,
        target,
        "out",
        "in",
        Math.max(1, Math.floor(a.weight ?? 1)),
        a.type ?? "normal",
      ),
    );
  }

  return { nodes, edges };
}

export function netToSummary(nodes: PetriNode[], edges: PetriEdge[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.type === "place") {
      const d = n.data as PlaceData;
      lines.push(`Place ${n.id} label="${d.label}" tokens=${d.tokens}`);
    } else {
      const d = n.data as TransitionData;
      lines.push(`Transition ${n.id} label="${d.label}"`);
    }
  }
  for (const e of edges) {
    lines.push(
      `Arc ${e.source} -> ${e.target} type=${e.data?.arcType ?? "normal"} weight=${e.data?.weight ?? 1}`,
    );
  }
  return lines.join("\n");
}

export function extractNet(text: string): AIPetriNet | null {
  const cleaned = text.replace(/```[a-zA-Z]*/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as AIPetriNet;
    if (parsed && (parsed.places || parsed.transitions || parsed.arcs)) {
      return parsed;
    }
  } catch {
    /* not a JSON object */
  }
  return null;
}
