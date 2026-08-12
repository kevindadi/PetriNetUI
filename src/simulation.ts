import type { PetriNode, PetriEdge, PlaceData } from "./types";

export type Marking = Record<string, number>;

export function initialMarking(nodes: PetriNode[]): Marking {
  const m: Marking = {};
  for (const n of nodes) {
    if (n.type === "place") m[n.id] = (n.data as PlaceData).tokens;
  }
  return m;
}

export function isEnabled(
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

export function enabledTransitions(
  nodes: PetriNode[],
  edges: PetriEdge[],
  marking: Marking,
): string[] {
  return nodes
    .filter((n) => n.type === "transition" && isEnabled(edges, marking, n.id))
    .map((n) => n.id);
}

export function fireTransition(
  edges: PetriEdge[],
  marking: Marking,
  transitionId: string,
): Marking {
  const next: Marking = { ...marking };
  for (const e of edges) {
    if (e.source === transitionId) {
      const w = e.data?.weight ?? 1;
      next[e.target] = (next[e.target] ?? 0) + w;
    } else if (e.target === transitionId) {
      const arcType = e.data?.arcType ?? "normal";
      if (arcType === "normal") {
        const w = e.data?.weight ?? 1;
        next[e.source] = (next[e.source] ?? 0) - w;
      } else if (arcType === "reset") {
        next[e.source] = 0;
      }
    }
  }
  return next;
}

export type AnalysisResult = {
  stateCount: number;
  truncated: boolean;
  maxTokens: Record<string, number>;
  deadlockCount: number;
  deadlockMarkings: Marking[];
};

export function analyze(
  nodes: PetriNode[],
  edges: PetriEdge[],
  initial: Marking,
  maxStates = 5000,
): AnalysisResult {
  const places = nodes.filter((n) => n.type === "place").map((n) => n.id);
  const transitions = nodes
    .filter((n) => n.type === "transition")
    .map((n) => n.id);
  const keyOf = (m: Marking) => places.map((p) => `${p}:${m[p] ?? 0}`).join(",");

  const visited = new Set<string>([keyOf(initial)]);
  const queue: Marking[] = [initial];
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
    const m = queue.shift()!;
    updateMax(m);
    const enabled = transitions.filter((t) => isEnabled(edges, m, t));
    if (enabled.length === 0) deadlockMarkings.push(m);
    for (const t of enabled) {
      const next = fireTransition(edges, m, t);
      const k = keyOf(next);
      if (!visited.has(k)) {
        if (visited.size >= maxStates) {
          truncated = true;
          break;
        }
        visited.add(k);
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
