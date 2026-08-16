import type {
  CvnArcKind,
  NetKind,
  PetriEdge,
  PetriNode,
  PetriNet,
  TimeInterval,
} from "./types";
import { createArc, createPlace, createTransition } from "./types";

type ExampleBuilder = () => PetriNet;

export type NetExample = {
  key: "examplePt" | "exampleTimed" | "exampleCvn";
  kind: NetKind;
  build: ExampleBuilder;
};

function makeNodes(nk: NetKind) {
  const nodes: PetriNode[] = [];
  const edges: PetriEdge[] = [];
  const mkPlace = (x: number, y: number, label: string, tokens = 0) => {
    const n = createPlace(x, y, nk);
    n.data = { ...n.data, label, tokens };
    nodes.push(n);
    return n;
  };
  const mkTransition = (x: number, y: number, label: string) => {
    const n = createTransition(x, y, nk);
    n.data = { ...n.data, label };
    nodes.push(n);
    return n;
  };
  const link = (source: string, target: string, weight = 1, cvnArc?: CvnArcKind) => {
    edges.push(createArc(source, target, "out", "in", weight, "normal", cvnArc));
  };
  return { nodes, edges, mkPlace, mkTransition, link };
}

/** P/T: two processes sharing a mutex — shows conflict and concurrency. */
export function ptExample(): PetriNet {
  const nk: NetKind = "pt";
  const { nodes, edges, mkPlace, mkTransition, link } = makeNodes(nk);

  const aIdle = mkPlace(40, 60, "A idle", 1);
  const enterA = mkTransition(200, 60, "Enter A");
  const aCrit = mkPlace(360, 60, "A critical");
  const exitA = mkTransition(520, 60, "Exit A");
  const mutex = mkPlace(280, 190, "Mutex", 1);
  const bIdle = mkPlace(40, 320, "B idle", 1);
  const enterB = mkTransition(200, 320, "Enter B");
  const bCrit = mkPlace(360, 320, "B critical");
  const exitB = mkTransition(520, 320, "Exit B");

  link(aIdle.id, enterA.id);
  link(mutex.id, enterA.id);
  link(enterA.id, aCrit.id);
  link(aCrit.id, exitA.id);
  link(exitA.id, aIdle.id);
  link(exitA.id, mutex.id);

  link(bIdle.id, enterB.id);
  link(mutex.id, enterB.id);
  link(enterB.id, bCrit.id);
  link(bCrit.id, exitB.id);
  link(exitB.id, bIdle.id);
  link(exitB.id, mutex.id);

  return { netKind: nk, nodes, edges };
}

/** Timed: a job is processed ([2,5]) then reset ([1,3]) — shows clocks and urgency. */
export function timedExample(): PetriNet {
  const nk: NetKind = "timed";
  const { nodes, edges, mkPlace, mkTransition, link } = makeNodes(nk);

  const load = mkPlace(60, 150, "Job ready", 1);
  const done = mkPlace(400, 150, "Job done");

  const process = mkTransition(230, 60, "Process");
  process.data = {
    ...process.data,
    interval: { earliest: 2, latest: 5, leftOpen: false, rightOpen: false } satisfies TimeInterval,
  };

  const reset = mkTransition(230, 260, "Reset");
  reset.data = {
    ...reset.data,
    interval: { earliest: 1, latest: 3, leftOpen: false, rightOpen: false } satisfies TimeInterval,
  };

  link(load.id, process.id);
  link(process.id, done.id);
  link(done.id, reset.id);
  link(reset.id, load.id);

  return { netKind: nk, nodes, edges };
}

/** CVN: two threads compete for a mutex, with a counter guarded on lock and updated on unlock. */
export function cvnExample(): PetriNet {
  const nk: NetKind = "cvn";
  const { nodes, edges, mkPlace, mkTransition, link } = makeNodes(nk);

  const t1Ready = mkPlace(60, 60, "T1 ready", 1);
  const lock1 = mkTransition(230, 60, "Lock 1");
  const t1Crit = mkPlace(420, 60, "T1 critical");
  const unlock1 = mkTransition(590, 60, "Unlock 1");
  const t2Ready = mkPlace(60, 420, "T2 ready", 1);
  const lock2 = mkTransition(230, 420, "Lock 2");
  const t2Crit = mkPlace(420, 420, "T2 critical");
  const unlock2 = mkTransition(590, 420, "Unlock 2");
  const mutex = mkPlace(325, 240, "Mutex", 1);
  mutex.data = { ...mutex.data, cvnPlace: { class: "resource", resource: "Mutex" } };

  link(t1Ready.id, lock1.id, 1, { type: "guard", guard: "n < 2" });
  link(mutex.id, lock1.id);
  link(lock1.id, t1Crit.id);
  link(t1Crit.id, unlock1.id);
  link(unlock1.id, t1Ready.id, 1, { type: "update", update: "n = n + 1" });
  link(unlock1.id, mutex.id);

  link(t2Ready.id, lock2.id, 1, { type: "guard", guard: "n < 2" });
  link(mutex.id, lock2.id);
  link(lock2.id, t2Crit.id);
  link(t2Crit.id, unlock2.id);
  link(unlock2.id, t2Ready.id, 1, { type: "update", update: "n = n + 1" });
  link(unlock2.id, mutex.id);

  return { netKind: nk, nodes, edges };
}

export const NET_EXAMPLES: NetExample[] = [
  { key: "examplePt", kind: "pt", build: ptExample },
  { key: "exampleTimed", kind: "timed", build: timedExample },
  { key: "exampleCvn", kind: "cvn", build: cvnExample },
];
