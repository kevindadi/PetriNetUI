// Petri-net semantics (token game, reachability, guard/update evaluation) now
// live in the Rust backend via UniPN. This module keeps only the shared type
// shapes and small helpers the UI still depends on.

import type { PetriNode, TransitionData } from "./types";

export type Marking = Record<string, number>;

export type SimState = {
  marking: Marking;
  time: number;
  clocks: Record<string, number>;
  vars: Record<string, number>;
};

export type ReachabilityState = {
  marking: Marking;
  level: number;
  deadlock: boolean;
};

export type ReachabilityEdge = {
  source: number;
  target: number;
  transitionId: string;
};

export type BoundnessResult = {
  bounded: boolean;
  unboundedPlaces: string[];
  note?: string | null;
};

export type TimedDbmResult = {
  stateClassCount: number;
  reachableMarkingCount: number;
  truncated: boolean;
};

export type AdvancedResult = {
  boundness: BoundnessResult | null;
  deadTransitions: string[] | null;
  timed: TimedDbmResult | null;
};

export type AnalysisResult = {
  stateCount: number;
  truncated: boolean;
  maxTokens: Record<string, number>;
  deadlockCount: number;
  deadlockMarkings: Marking[];
  states: ReachabilityState[];
  edges: ReachabilityEdge[];
  advanced: AdvancedResult;
};

/** Pick the next transition to auto-fire: highest priority, ties random. */
export function pickTransition(ids: string[], nodes: PetriNode[]): string | null {
  if (ids.length === 0) return null;
  let best = Number.NEGATIVE_INFINITY;
  const top: string[] = [];
  for (const id of ids) {
    const n = nodes.find((node) => node.id === id);
    const priority = (n?.data as TransitionData | undefined)?.priority ?? 0;
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

export function summarizeAnalysis(r: AnalysisResult): string {
  const bounded = r.truncated ? "possibly unbounded" : "bounded";
  return `reachable states: ${r.stateCount}, ${bounded}, deadlock states: ${r.deadlockCount}`;
}
