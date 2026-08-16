import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { Translator } from "../i18n";
import { analyze, initialSimState, type AnalysisResult } from "../simulation";
import type { NetKind, PetriEdge, PetriNode, PlaceData, TransitionData } from "../types";

type AnalysisViewProps = {
  t: Translator;
  netKind: NetKind;
  nodes: PetriNode[];
  edges: PetriEdge[];
  onBack: () => void;
};

type ReachNodeData = {
  marking: [string, number][];
  deadlock: boolean;
};

function ReachNode({ data }: NodeProps<Node<ReachNodeData, "state">>) {
  return (
    <div className={`reach-node${data.deadlock ? " deadlock" : ""}`}>
      <Handle type="source" id="out" position={Position.Right} className="reach-handle" />
      <Handle type="target" id="in" position={Position.Left} className="reach-handle" />
      {data.marking.map(([label, value]) => (
        <div key={label} className="reach-mark">
          <span className="reach-mark-label">{label}</span>
          <span className="reach-mark-value">{value}</span>
        </div>
      ))}
    </div>
  );
}

const reachNodeTypes = { state: ReachNode };

function layoutGraph(states: AnalysisResult["states"]): { x: number; y: number }[] {
  const levels = new Map<number, number[]>();
  states.forEach((s, i) => {
    const arr = levels.get(s.level) ?? [];
    arr.push(i);
    levels.set(s.level, arr);
  });
  let maxCol = 0;
  for (const arr of levels.values()) maxCol = Math.max(maxCol, arr.length);
  const W = 210;
  const H = 88;
  const pos: { x: number; y: number }[] = new Array(states.length);
  for (const [level, arr] of levels) {
    const startY = ((maxCol - arr.length) * H) / 2;
    arr.forEach((idx, j) => {
      pos[idx] = { x: level * W, y: startY + j * H };
    });
  }
  return pos;
}

export function AnalysisView({ t, netKind, nodes, edges, onBack }: AnalysisViewProps) {
  const [maxStates, setMaxStates] = useState(5000);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const rfRef = useRef<ReactFlowInstance<Node<ReachNodeData, "state">, Edge> | null>(null);
  const runIdRef = useRef(0);

  const placeOrder = useMemo(
    () => nodes.filter((n) => n.type === "place").map((n) => n.id),
    [nodes],
  );
  const placeLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of nodes) if (n.type === "place") m[n.id] = (n.data as PlaceData).label;
    return m;
  }, [nodes]);
  const transitionLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of nodes) if (n.type === "transition") m[n.id] = (n.data as TransitionData).label;
    return m;
  }, [nodes]);

  const run = useCallback(() => {
    setLoading(true);
    setSelected(null);
    const id = ++runIdRef.current;
    setTimeout(() => {
      if (id !== runIdRef.current) return;
      setResult(
        analyze(nodes, edges, initialSimState(nodes, edges, netKind), netKind, maxStates),
      );
      setLoading(false);
    }, 30);
  }, [nodes, edges, netKind, maxStates]);

  useEffect(() => {
    run();
  }, []);

  const rfData = useMemo(() => {
    if (!result) return { nodes: [], edges: [] };
    const pos = layoutGraph(result.states);
    const rn: Node<ReachNodeData, "state">[] = result.states.map((s, i) => ({
      id: String(i),
      type: "state",
      position: pos[i],
      data: {
        marking: placeOrder.map((pid) => [placeLabels[pid] ?? pid, s.marking[pid] ?? 0]),
        deadlock: s.deadlock,
      },
    }));
    const re: Edge[] = result.edges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.source),
      target: String(e.target),
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#64748b" },
      style: { stroke: "#64748b", strokeWidth: 2 },
      label: transitionLabels[e.transitionId] ?? e.transitionId,
      labelStyle: { fontSize: 10, fill: "#475569", fontWeight: 600 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [3, 1] as [number, number],
      labelBgBorderRadius: 3,
    }));
    return { nodes: rn, edges: re };
  }, [result, placeOrder, placeLabels, transitionLabels]);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node<ReachNodeData, "state">>(
    rfData.nodes,
  );
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge>(rfData.edges);

  useEffect(() => {
    setRfNodes(rfData.nodes);
    setRfEdges(rfData.edges);
    const timer = setTimeout(() => rfRef.current?.fitView({ padding: 0.12, maxZoom: 1.4 }), 80);
    return () => clearTimeout(timer);
  }, [rfData, setRfNodes, setRfEdges]);

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    if (sel.length === 1) setSelected(Number((sel[0] as Node).id));
    else setSelected(null);
  }, []);

  return (
    <div className="analysis-view">
      <header className="analysis-header">
        <button className="analysis-back" onClick={onBack}>
          ← {t("backToEditor")}
        </button>
        <h2>{t("analyzeTitle")}</h2>
        <span className="spacer" />
        <label className="analysis-maxstates">
          {t("analyzeMaxStates")}
          <input
            type="number"
            min={100}
            max={100000}
            step={500}
            value={maxStates}
            onChange={(e) => setMaxStates(Math.max(1, Number(e.target.value)) || 1)}
          />
        </label>
        <button className="analysis-run" onClick={run}>
          {t("analyzeRun")}
        </button>
      </header>

      {loading ? (
        <div className="analysis-loading">{t("analyzeRunning")}</div>
      ) : !result || result.states.length === 0 ? (
        <div className="analysis-empty">{t("analyzeStateHint")}</div>
      ) : (
        <div className="analysis-body">
          <aside className="analysis-side">
            <p className="hint">{t("analyzeNote")}</p>
            <section>
              <h3>{t("analyzeSummary")}</h3>
              <ul className="analysis-stats">
                <li>{t("simStates", { count: result.stateCount })}</li>
                <li>{result.truncated ? t("simUnbounded") : t("simBounded")}</li>
                <li>{t("simDeadlocks", { count: result.deadlockCount })}</li>
                {result.truncated && (
                  <li className="analysis-warn">{t("analyzeTruncated", { limit: maxStates })}</li>
                )}
              </ul>
            </section>
            <section>
              <h3>{t("simMaxTokens")}</h3>
              <div className="sim-marking">
                {placeOrder.map((pid) => (
                  <div key={pid} className="sim-marking-row">
                    <span>{placeLabels[pid] ?? pid}</span>
                    <span>{result.maxTokens[pid] ?? 0}</span>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3>{t("analyzeSelectedState")}</h3>
              {selected != null ? (
                <div className="sim-marking">
                  {placeOrder.map((pid) => (
                    <div key={pid} className="sim-marking-row">
                      <span>{placeLabels[pid] ?? pid}</span>
                      <span>{result.states[selected].marking[pid] ?? 0}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">{t("analyzeStateHint")}</p>
              )}
            </section>
            <section>
              <h3>{t("analyzeLegend")}</h3>
              <ul className="analysis-legend">
                <li>
                  <span className="analysis-legend-swatch normal" />
                  {t("analyzeLegendState")}
                </li>
                <li>
                  <span className="analysis-legend-swatch deadlock" />
                  {t("analyzeLegendDeadlock")}
                </li>
              </ul>
            </section>
          </aside>
          <div className="analysis-canvas">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onRfNodesChange}
              onEdgesChange={onRfEdgesChange}
              onSelectionChange={onSelectionChange}
              nodeTypes={reachNodeTypes}
              minZoom={0.05}
              maxZoom={2}
              fitView
              onInit={(inst) => {
                rfRef.current = inst;
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) =>
                  (n.data as ReachNodeData | undefined)?.deadlock ? "#fee2e2" : "#dbeafe"
                }
              />
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
}
