import type { Node, Edge } from "@xyflow/react";

export type NetKind = "pt" | "timed" | "cvn";

export type CapacityMode = "reject" | "saturate";

export type TimeInterval = {
  earliest: number;
  latest: number | null;
  leftOpen: boolean;
  rightOpen: boolean;
};

export type ControlSub =
  | "Statement"
  | "BasicBlock"
  | "FunctionStart"
  | "FunctionEnd"
  | "Return"
  | "ThreadEnd"
  | "CallWait"
  | "WaitPoint"
  | "Reacquire"
  | "SpawnBridge"
  | "TestPoint";

export type ResourceType = "Mutex" | "RwLock" | "Semaphore" | "Channel" | "Condvar";

export type CvnPlace =
  | { class: "control"; sub: ControlSub }
  | { class: "resource"; resource: ResourceType; param?: number };

export type TransitionKind =
  | "Sequential"
  | "Goto"
  | "FunctionEnter"
  | "FunctionExit"
  | "Return"
  | "Drop"
  | "BranchTrue"
  | "BranchFalse"
  | "Switch"
  | "Lock"
  | "Unlock"
  | "ReadLock"
  | "ReadUnlock"
  | "Acquire"
  | "Release"
  | "Send"
  | "Recv"
  | "VarRead"
  | "VarWrite"
  | "AtomicLoad"
  | "AtomicStore"
  | "AtomicCmpXchg"
  | "CasSuccess"
  | "CasFailure"
  | "UnsafeRead"
  | "UnsafeWrite"
  | "UnsafeAccess"
  | "Spawn"
  | "Join"
  | "Call"
  | "CondvarWaitEnter"
  | "CondvarWakeByNotify"
  | "CondvarWakeByNotifyAll"
  | "CondvarReacquire"
  | "CondvarNotify"
  | "CondvarNotifyLost"
  | "CondvarNotifyAll"
  | "CondvarNotifyAllLost"
  | "TestBarrier"
  | "TestInject"
  | "TestPoint"
  | "Other";

export type CvnArcKind =
  | { type: "plain" }
  | { type: "guard"; guard: string }
  | { type: "update"; update: string };

export type PlaceData = {
  kind: "place";
  label: string;
  tokens: number;
  capacity?: number | null;
  capacityMode?: CapacityMode;
  saturate?: boolean;
  cvnPlace?: CvnPlace;
};

export type TransitionData = {
  kind: "transition";
  label: string;
  priority?: number | null;
  interval?: TimeInterval;
  core?: number;
  suspendable?: boolean;
  cvnKind?: TransitionKind;
  scope?: string | null;
  anchors?: string;
  family?: string | null;
};

export type ArcType = "normal" | "reset" | "inhibitor";

export type ArcData = {
  weight: number;
  arcType: ArcType;
  cvnArc?: CvnArcKind;
};

export const TRANSITION_KINDS: TransitionKind[] = [
  "Sequential", "Goto", "FunctionEnter", "FunctionExit", "Return", "Drop",
  "BranchTrue", "BranchFalse", "Switch", "Lock", "Unlock", "ReadLock",
  "ReadUnlock", "Acquire", "Release", "Send", "Recv", "VarRead", "VarWrite",
  "AtomicLoad", "AtomicStore", "AtomicCmpXchg", "CasSuccess", "CasFailure",
  "UnsafeRead", "UnsafeWrite", "UnsafeAccess", "Spawn", "Join", "Call",
  "CondvarWaitEnter", "CondvarWakeByNotify", "CondvarWakeByNotifyAll",
  "CondvarReacquire", "CondvarNotify", "CondvarNotifyLost", "CondvarNotifyAll",
  "CondvarNotifyAllLost", "TestBarrier", "TestInject", "TestPoint", "Other",
];

export const CONTROL_SUBS: ControlSub[] = [
  "Statement", "BasicBlock", "FunctionStart", "FunctionEnd", "Return",
  "ThreadEnd", "CallWait", "WaitPoint", "Reacquire", "SpawnBridge", "TestPoint",
];

export const RESOURCE_TYPES: ResourceType[] = [
  "Mutex", "RwLock", "Semaphore", "Channel", "Condvar",
];

export type PetriNode = Node<PlaceData | TransitionData, "place" | "transition">;
export type PetriEdge = Edge<ArcData, "arc">;

export type PetriNet = {
  netKind: NetKind;
  nodes: PetriNode[];
  edges: PetriEdge[];
};

export function stripNetAttrs(
  nk: NetKind,
  data: PlaceData | TransitionData,
): PlaceData | TransitionData {
  if (data.kind === "place") {
    const base: PlaceData = { kind: "place", label: data.label, tokens: data.tokens };
    if (nk === "pt" || nk === "timed") {
      base.capacity = data.capacity ?? null;
      if (nk === "pt") base.capacityMode = data.capacityMode ?? "reject";
      if (nk === "timed") base.saturate = data.saturate ?? false;
    } else {
      base.cvnPlace = data.cvnPlace ?? { class: "control", sub: "Statement" };
    }
    return base;
  }
  const base: TransitionData = { kind: "transition", label: data.label };
  if (nk === "pt" || nk === "timed") {
    base.priority = data.priority ?? null;
    if (nk === "timed") {
      base.interval =
        data.interval ?? { earliest: 0, latest: null, leftOpen: false, rightOpen: false };
      base.core = data.core ?? 0;
      base.suspendable = data.suspendable ?? false;
    }
  } else {
    base.cvnKind = data.cvnKind ?? "Sequential";
    base.scope = data.scope ?? null;
    base.anchors = data.anchors ?? "";
    base.family = data.family ?? null;
  }
  return base;
}

let idCounter = 0;

export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createPlace(x: number, y: number, nk: NetKind = "pt"): Node<PlaceData, "place"> {
  const node: Node<PlaceData, "place"> = {
    id: nextId("p"),
    type: "place",
    position: { x, y },
    data: { kind: "place", label: `P${idCounter}`, tokens: 0 },
  };
  return { ...node, data: stripNetAttrs(nk, node.data) as PlaceData };
}

export function createTransition(
  x: number,
  y: number,
  nk: NetKind = "pt",
): Node<TransitionData, "transition"> {
  const node: Node<TransitionData, "transition"> = {
    id: nextId("t"),
    type: "transition",
    position: { x, y },
    data: { kind: "transition", label: `T${idCounter}` },
  };
  return { ...node, data: stripNetAttrs(nk, node.data) as TransitionData };
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

export function aiNetToPetriNet(net: AIPetriNet, nk: NetKind = "pt"): PetriNet {
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
      data: stripNetAttrs(nk, {
        kind: "place",
        label: p.label ?? nodeId,
        tokens: Math.max(0, Math.floor(p.tokens ?? 0)),
      }) as PlaceData,
    });
  }

  for (const t of net.transitions ?? []) {
    const nodeId = t.id && t.id.length > 0 ? t.id : nextId("t");
    idMap[t.id ?? nodeId] = nodeId;
    nodes.push({
      id: nodeId,
      type: "transition",
      position: { x: t.x ?? 100, y: t.y ?? 100 },
      data: stripNetAttrs(nk, {
        kind: "transition",
        label: t.label ?? nodeId,
      }) as TransitionData,
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

  return { netKind: nk, nodes, edges };
}

export function netToSummary(nodes: PetriNode[], edges: PetriEdge[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.type === "place") {
      const d = n.data as PlaceData;
      const cap = d.capacity == null ? "" : ` capacity=${d.capacity}`;
      lines.push(`Place ${n.id} label="${d.label}" tokens=${d.tokens}${cap}`);
    } else {
      const d = n.data as TransitionData;
      const prio = d.priority == null ? "" : ` priority=${d.priority}`;
      lines.push(`Transition ${n.id} label="${d.label}"${prio}`);
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
