import {
  defaultInterval,
  resourceCapacity,
  type CvnArcKind,
  type NetKind,
  type PetriEdge,
  type PetriNode,
  type PlaceData,
  type TimeInterval,
  type TransitionData,
} from "./types";
import { applyUpdate, collectVars, evalGuard, type VarStore } from "./expr";

export type Marking = Record<string, number>;

export type SimState = {
  marking: Marking;
  time: number;
  clocks: Record<string, number>;
  vars: VarStore;
};

export function initialMarking(nodes: PetriNode[]): Marking {
  const m: Marking = {};
  for (const n of nodes) {
    if (n.type === "place") m[n.id] = (n.data as PlaceData).tokens;
  }
  return m;
}

function transitionIds(nodes: PetriNode[]): string[] {
  return nodes.filter((n) => n.type === "transition").map((n) => n.id);
}

function transitionData(nodes: PetriNode[], id: string): TransitionData | undefined {
  const n = nodes.find((node) => node.id === id);
  return n?.type === "transition" ? (n.data as TransitionData) : undefined;
}

function placeData(nodes: PetriNode[], id: string): PlaceData | undefined {
  const n = nodes.find((node) => node.id === id);
  return n?.type === "place" ? (n.data as PlaceData) : undefined;
}

function intervalOf(nodes: PetriNode[], id: string): TimeInterval {
  return transitionData(nodes, id)?.interval ?? defaultInterval();
}

function effectiveEarliest(interval: TimeInterval): number {
  return interval.leftOpen ? interval.earliest + 1 : interval.earliest;
}

function effectiveLatest(interval: TimeInterval): number {
  if (interval.latest == null) return Number.POSITIVE_INFINITY;
  return interval.rightOpen ? interval.latest - 1 : interval.latest;
}

function intervalContains(interval: TimeInterval, clock: number): boolean {
  return clock >= effectiveEarliest(interval) && clock <= effectiveLatest(interval);
}

function inputsEnabled(
  edges: PetriEdge[],
  marking: Marking,
  transitionId: string,
): boolean {
  for (const e of edges) {
    if (e.target !== transitionId) continue;
    const w = e.data?.weight ?? 1;
    const arcType = e.data?.arcType ?? "normal";
    const tokens = marking[e.source] ?? 0;
    if (arcType === "inhibitor") {
      if (tokens >= w) return false;
    } else if (arcType === "normal") {
      if (tokens < w) return false;
    }
  }
  return true;
}

function outputCapacityOk(
  nodes: PetriNode[],
  edges: PetriEdge[],
  marking: Marking,
  transitionId: string,
  netKind: NetKind,
): boolean {
  if (netKind === "timed") return true;
  for (const e of edges) {
    if (e.source !== transitionId) continue;
    const place = placeData(nodes, e.target);
    if (!place) continue;
    const w = e.data?.weight ?? 1;
    const next = (marking[e.target] ?? 0) + w;
    if (netKind === "pt") {
      if (place.capacity != null && place.capacityMode !== "saturate" && next > place.capacity) {
        return false;
      }
    } else {
      const cap = resourceCapacity(place.cvnPlace);
      if (cap != null && next > cap) return false;
    }
  }
  return true;
}

function guardsOk(edges: PetriEdge[], vars: VarStore, transitionId: string): boolean {
  for (const e of edges) {
    if (e.target !== transitionId) continue;
    const kind = e.data?.cvnArc;
    if (kind?.type === "guard" && !evalGuard(kind.guard, vars)) return false;
  }
  return true;
}

export function isStructurallyEnabled(
  nodes: PetriNode[],
  edges: PetriEdge[],
  marking: Marking,
  transitionId: string,
  netKind: NetKind,
): boolean {
  if (!inputsEnabled(edges, marking, transitionId)) return false;
  if (!outputCapacityOk(nodes, edges, marking, transitionId, netKind)) return false;
  return true;
}

export function isEnabled(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  transitionId: string,
  netKind: NetKind,
): boolean {
  if (!isStructurallyEnabled(nodes, edges, state.marking, transitionId, netKind)) {
    return false;
  }
  if (netKind === "cvn" && !guardsOk(edges, state.vars, transitionId)) return false;
  if (netKind === "timed") {
    const clock = state.clocks[transitionId] ?? 0;
    if (!intervalContains(intervalOf(nodes, transitionId), clock)) return false;
  }
  return true;
}

export function enabledTransitions(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  netKind: NetKind,
): string[] {
  return transitionIds(nodes).filter((id) => isEnabled(nodes, edges, state, id, netKind));
}

export function waitingTransitions(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  netKind: NetKind,
): string[] {
  if (netKind !== "timed") return [];
  return transitionIds(nodes).filter((id) => {
    if (!isStructurallyEnabled(nodes, edges, state.marking, id, netKind)) return false;
    const clock = state.clocks[id] ?? 0;
    return clock < effectiveEarliest(intervalOf(nodes, id));
  });
}

function syncClocks(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  netKind: NetKind,
): Record<string, number> {
  if (netKind !== "timed") return {};
  const clocks: Record<string, number> = {};
  for (const id of transitionIds(nodes)) {
    if (isStructurallyEnabled(nodes, edges, state.marking, id, netKind)) {
      clocks[id] = state.clocks[id] ?? 0;
    }
  }
  return clocks;
}

function applyTokenFire(
  nodes: PetriNode[],
  edges: PetriEdge[],
  marking: Marking,
  transitionId: string,
  netKind: NetKind,
): Marking {
  const next: Marking = { ...marking };
  for (const e of edges) {
    if (e.source === transitionId) {
      const w = e.data?.weight ?? 1;
      let produced = (next[e.target] ?? 0) + w;
      const place = placeData(nodes, e.target);
      if (place) {
        if (netKind === "timed" && place.capacity != null && produced > place.capacity) {
          produced = place.capacity;
        } else if (
          netKind === "pt" &&
          place.capacity != null &&
          place.capacityMode === "saturate" &&
          produced > place.capacity
        ) {
          produced = place.capacity;
        }
      }
      next[e.target] = produced;
    } else if (e.target === transitionId) {
      const arcType = e.data?.arcType ?? "normal";
      if (arcType === "normal") {
        next[e.source] = (next[e.source] ?? 0) - (e.data?.weight ?? 1);
      } else if (arcType === "reset") {
        next[e.source] = 0;
      }
    }
  }
  return next;
}

function applyCvnUpdates(
  edges: PetriEdge[],
  vars: VarStore,
  transitionId: string,
): VarStore {
  let next = vars;
  for (const e of edges) {
    if (e.source !== transitionId) continue;
    const kind: CvnArcKind | undefined = e.data?.cvnArc;
    if (kind?.type === "update") next = applyUpdate(kind.update, next);
  }
  return next;
}

export function fireTransition(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  transitionId: string,
  netKind: NetKind,
): SimState {
  const next: SimState = {
    marking: applyTokenFire(nodes, edges, state.marking, transitionId, netKind),
    time: state.time,
    clocks: state.clocks,
    vars: netKind === "cvn" ? applyCvnUpdates(edges, state.vars, transitionId) : state.vars,
  };
  next.clocks = syncClocks(nodes, edges, next, netKind);
  return next;
}

export function advanceTime(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  netKind: NetKind,
): SimState | null {
  if (netKind !== "timed") return null;
  let delta = Number.POSITIVE_INFINITY;
  for (const id of transitionIds(nodes)) {
    if (!isStructurallyEnabled(nodes, edges, state.marking, id, netKind)) continue;
    const wait = effectiveEarliest(intervalOf(nodes, id)) - (state.clocks[id] ?? 0);
    if (wait > 0 && wait < delta) delta = wait;
  }
  if (!Number.isFinite(delta) || delta <= 0) return null;
  const clocks: Record<string, number> = {};
  for (const [id, clock] of Object.entries(state.clocks)) {
    clocks[id] = clock + delta;
  }
  return { ...state, time: state.time + delta, clocks };
}

export function canAdvanceTime(
  nodes: PetriNode[],
  edges: PetriEdge[],
  state: SimState,
  netKind: NetKind,
): boolean {
  return advanceTime(nodes, edges, state, netKind) != null;
}

export function initialSimState(
  nodes: PetriNode[],
  edges: PetriEdge[],
  netKind: NetKind,
): SimState {
  const texts: string[] = [];
  if (netKind === "cvn") {
    for (const e of edges) {
      const kind = e.data?.cvnArc;
      if (kind?.type === "guard") texts.push(kind.guard);
      if (kind?.type === "update") texts.push(kind.update);
    }
  }
  const state: SimState = {
    marking: initialMarking(nodes),
    time: 0,
    clocks: {},
    vars: netKind === "cvn" ? collectVars(texts) : {},
  };
  state.clocks = syncClocks(nodes, edges, state, netKind);
  return state;
}

export function pickTransition(ids: string[], nodes: PetriNode[]): string | null {
  if (ids.length === 0) return null;
  let best = Number.NEGATIVE_INFINITY;
  const top: string[] = [];
  for (const id of ids) {
    const priority = transitionData(nodes, id)?.priority ?? 0;
    if (priority > best) {
      best = priority;
      top.length = 0;
      top.push(id);
    } else if (priority === best) {
      top.push(id);
    }
  }
  return top[Math.floor(Math.random() * top.length)] ?? null;
}

export type AnalysisResult = {
  stateCount: number;
  truncated: boolean;
  maxTokens: Record<string, number>;
  deadlockCount: number;
  deadlockMarkings: Marking[];
};

function stateKey(state: SimState, places: string[], netKind: NetKind): string {
  const marking = places.map((p) => `${p}:${state.marking[p] ?? 0}`).join(",");
  if (netKind !== "cvn") return marking;
  const vars = Object.keys(state.vars)
    .sort()
    .map((k) => `${k}=${state.vars[k]}`)
    .join(",");
  return `${marking}|${vars}`;
}

export function analyze(
  nodes: PetriNode[],
  edges: PetriEdge[],
  initial: SimState,
  netKind: NetKind,
  maxStates = 5000,
): AnalysisResult {
  const places = nodes.filter((n) => n.type === "place").map((n) => n.id);
  // Timed analysis explores discrete markings; intervals only affect the token game.
  const keyKind: NetKind = netKind === "timed" ? "pt" : netKind;
  const seed: SimState =
    netKind === "timed"
      ? { marking: initial.marking, time: 0, clocks: {}, vars: {} }
      : initial;

  const visited = new Set<string>([stateKey(seed, places, keyKind)]);
  const queue: SimState[] = [seed];
  const maxTokens: Record<string, number> = {};
  const deadlockMarkings: Marking[] = [];
  let truncated = false;

  const updateMax = (m: Marking) => {
    for (const p of places) {
      const v = m[p] ?? 0;
      if (v > (maxTokens[p] ?? 0)) maxTokens[p] = v;
    }
  };

  while (queue.length > 0) {
    const current = queue.shift()!;
    updateMax(current.marking);
    const enabled =
      netKind === "timed"
        ? transitionIds(nodes).filter((id) =>
            isStructurallyEnabled(nodes, edges, current.marking, id, "timed"),
          )
        : enabledTransitions(nodes, edges, current, netKind);
    if (enabled.length === 0) deadlockMarkings.push(current.marking);
    for (const id of enabled) {
      const next =
        netKind === "timed"
          ? {
              marking: applyTokenFire(nodes, edges, current.marking, id, "timed"),
              time: 0,
              clocks: {},
              vars: {},
            }
          : fireTransition(nodes, edges, current, id, netKind);
      const key = stateKey(next, places, keyKind);
      if (!visited.has(key)) {
        if (visited.size >= maxStates) {
          truncated = true;
          break;
        }
        visited.add(key);
        queue.push(next);
      }
    }
    if (truncated) break;
  }

  return {
    stateCount: visited.size,
    truncated,
    maxTokens,
    deadlockCount: deadlockMarkings.length,
    deadlockMarkings,
  };
}

export function summarizeAnalysis(r: AnalysisResult): string {
  const bounded = r.truncated ? "possibly unbounded" : "bounded";
  return `reachable states: ${r.stateCount}, ${bounded}, deadlock states: ${r.deadlockCount}`;
}
