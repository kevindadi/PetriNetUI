import { useCallback, useRef, useState } from "react";
import type { PetriEdge, PetriNet, PetriNode, NetKind, Selection } from "../types";

export function useNetHistory(
  netKind: NetKind,
  nodes: PetriNode[],
  edges: PetriEdge[],
  setNetKind: (kind: NetKind) => void,
  setNodes: (nodes: PetriNode[] | ((prev: PetriNode[]) => PetriNode[])) => void,
  setEdges: (edges: PetriEdge[] | ((prev: PetriEdge[]) => PetriEdge[])) => void,
  setSelection: (selection: Selection) => void,
) {
  const pastRef = useRef<PetriNet[]>([]);
  const futureRef = useRef<PetriNet[]>([]);
  const pendingCommitRef = useRef<PetriNet | null>(null);
  const [, setHistoryVersion] = useState(0);

  const scheduleCommit = useCallback(() => {
    if (pendingCommitRef.current) return;
    pendingCommitRef.current = { netKind, nodes, edges };
    queueMicrotask(() => {
      const snapshot = pendingCommitRef.current;
      if (!snapshot) return;
      pendingCommitRef.current = null;
      pastRef.current.push(snapshot);
      if (pastRef.current.length > 50) pastRef.current.shift();
      futureRef.current = [];
      setHistoryVersion((v) => v + 1);
    });
  }, [netKind, nodes, edges]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ netKind, nodes, edges });
    setNetKind(prev.netKind);
    setNodes(prev.nodes.map((n) => ({ ...n, selected: false })));
    setEdges(prev.edges.map((e) => ({ ...e, selected: false })));
    setSelection(null);
    setHistoryVersion((v) => v + 1);
  }, [netKind, nodes, edges, setNetKind, setNodes, setEdges, setSelection]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ netKind, nodes, edges });
    setNetKind(next.netKind);
    setNodes(next.nodes.map((n) => ({ ...n, selected: false })));
    setEdges(next.edges.map((e) => ({ ...e, selected: false })));
    setSelection(null);
    setHistoryVersion((v) => v + 1);
  }, [netKind, nodes, edges, setNetKind, setNodes, setEdges, setSelection]);

  return {
    scheduleCommit,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
