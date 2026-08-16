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
  cvnArc?: CvnArcKind,
): PetriEdge {
  return {
    id: nextId("a"),
    type: "arc",
    source,
    target,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
    data: patchArcData(undefined, { weight, arcType, cvnArc }),
  };
}

export function patchArcData(
  data: ArcData | undefined,
  patch: Partial<ArcData>,
): ArcData {
  const next: ArcData = {
    weight: patch.weight ?? data?.weight ?? 1,
    arcType: patch.arcType ?? data?.arcType ?? "normal",
  };
  const cvnArc = patch.cvnArc !== undefined ? patch.cvnArc : data?.cvnArc;
  if (cvnArc) next.cvnArc = cvnArc;
  return next;
}

export function defaultInterval(): TimeInterval {
  return { earliest: 0, latest: null, leftOpen: false, rightOpen: false };
}

export function formatTimeInterval(interval: TimeInterval): string {
  const left = interval.leftOpen ? "(" : "[";
  const right = interval.rightOpen ? ")" : "]";
  const latest = interval.latest == null ? "∞" : String(interval.latest);
  return `${left}${interval.earliest}, ${latest}${right}`;
}

export function resourceCapacity(place: CvnPlace | undefined): number | null {
  if (!place || place.class !== "resource") return null;
  if (place.resource === "Mutex") return 1;
  if (place.resource === "RwLock" || place.resource === "Semaphore") {
    return place.param ?? 1;
  }
  return null;
}

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ActivePanel = "chat" | "props" | "simulation";

export type AIPlace = {
  id?: string;
  label?: string;
  tokens?: number;
  x?: number;
  y?: number;
  capacity?: number | null;
  capacityMode?: CapacityMode;
  saturate?: boolean;
  cvnPlace?: CvnPlace;
};

export type AITransition = {
  id?: string;
  label?: string;
  x?: number;
  y?: number;
  priority?: number | null;
  interval?: TimeInterval;
  core?: number;
  suspendable?: boolean;
  cvnKind?: TransitionKind;
  scope?: string | null;
  anchors?: string;
  family?: string | null;
};

export type AIArc = {
  from?: string;
  to?: string;
  weight?: number;
  type?: ArcType;
  cvnArc?: CvnArcKind;
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
        capacity: p.capacity,
        capacityMode: p.capacityMode,
        saturate: p.saturate,
        cvnPlace: p.cvnPlace,
      }) as PlaceData,
    });
  }

  for (const tr of net.transitions ?? []) {
    const nodeId = tr.id && tr.id.length > 0 ? tr.id : nextId("t");
    idMap[tr.id ?? nodeId] = nodeId;
    nodes.push({
      id: nodeId,
      type: "transition",
      position: { x: tr.x ?? 100, y: tr.y ?? 100 },
      data: stripNetAttrs(nk, {
        kind: "transition",
        label: tr.label ?? nodeId,
        priority: tr.priority,
        interval: tr.interval,
        core: tr.core,
        suspendable: tr.suspendable,
        cvnKind: tr.cvnKind,
        scope: tr.scope,
        anchors: tr.anchors,
        family: tr.family,
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
        nk === "cvn" ? (a.cvnArc ?? { type: "plain" }) : undefined,
      ),
    );
  }

  return { netKind: nk, nodes, edges };
}

export function netToSummary(
  nodes: PetriNode[],
  edges: PetriEdge[],
  netKind: NetKind = "pt",
): string {
  const lines: string[] = [`netKind=${netKind}`];
  for (const n of nodes) {
    if (n.type === "place") {
      const d = n.data as PlaceData;
      const parts = [`Place ${n.id} label="${d.label}" tokens=${d.tokens}`];
      if (netKind === "pt" || netKind === "timed") {
        if (d.capacity != null) parts.push(`capacity=${d.capacity}`);
        if (netKind === "pt") parts.push(`capacityMode=${d.capacityMode ?? "reject"}`);
        if (netKind === "timed") parts.push(`saturate=${d.saturate ?? false}`);
      } else if (d.cvnPlace) {
        parts.push(
          d.cvnPlace.class === "control"
            ? `cvn=control/${d.cvnPlace.sub}`
            : `cvn=resource/${d.cvnPlace.resource}${d.cvnPlace.param != null ? `(${d.cvnPlace.param})` : ""}`,
        );
      }
      lines.push(parts.join(" "));
    } else {
      const d = n.data as TransitionData;
      const parts = [`Transition ${n.id} label="${d.label}"`];
      if (d.priority != null) parts.push(`priority=${d.priority}`);
      if (netKind === "timed" && d.interval) {
        parts.push(`interval=${formatTimeInterval(d.interval)}`);
        parts.push(`core=${d.core ?? 0}`);
        parts.push(`suspendable=${d.suspendable ?? false}`);
      }
      if (netKind === "cvn") {
        parts.push(`cvnKind=${d.cvnKind ?? "Sequential"}`);
        if (d.scope) parts.push(`scope=${d.scope}`);
        if (d.family) parts.push(`family=${d.family}`);
        if (d.anchors) parts.push(`anchors=${d.anchors}`);
      }
      lines.push(parts.join(" "));
    }
  }
  for (const e of edges) {
    const parts = [
      `Arc ${e.source} -> ${e.target} type=${e.data?.arcType ?? "normal"} weight=${e.data?.weight ?? 1}`,
    ];
    if (netKind === "cvn" && e.data?.cvnArc) {
      const kind = e.data.cvnArc;
      if (kind.type === "guard") parts.push(`guard="${kind.guard}"`);
      else if (kind.type === "update") parts.push(`update="${kind.update}"`);
      else parts.push("cvnArc=plain");
    }
    lines.push(parts.join(" "));
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
