import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useStore,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { Translator } from "../i18n";
import { type AnalysisResult } from "../simulation";
import { computeConcentricLayout } from "../layout";
import { flowToSemantic } from "../model";
import type { NetKind, PetriEdge, PetriNode, PlaceData, TransitionData } from "../types";
import { invoke } from "@tauri-apps/api/core";

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

type ReachEdgeData = {
  color: string;
  label: string;
  lane: number;
  dimmed: boolean;
};

function reachAnchor(
  cx: number,
  cy: number,
  w: number,
  h: number,
  ex: number,
  ey: number,
  lane: number,
): [number, number] {
  const dx = ex - cx;
  const dy = ey - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  let ax: number;
  let ay: number;
  let tangentX: number;
  let tangentY: number;
  if (Math.abs(dx) >= Math.abs(dy)) {
    ax = cx + Math.sign(dx) * (w / 2);
    ay = cy + (dy / Math.abs(dx)) * (w / 2);
    tangentX = 0;
    tangentY = 1;
  } else {
    ay = cy + Math.sign(dy) * (h / 2);
    ax = cx + (dx / Math.abs(dy)) * (h / 2);
    tangentX = 1;
    tangentY = 0;
  }
  return [ax + tangentX * lane, ay + tangentY * lane];
}

function ReachEdge({ source, target, data }: EdgeProps<Edge<ReachEdgeData>>) {
  const sourceNode = useStore((s) => s.nodeLookup.get(source) ?? null);
  const targetNode = useStore((s) => s.nodeLookup.get(target) ?? null);

  if (!sourceNode || !targetNode) return null;

  const so = sourceNode.internals.positionAbsolute;
  const to = targetNode.internals.positionAbsolute;
  const sw = sourceNode.measured?.width ?? sourceNode.width ?? 80;
  const sh = sourceNode.measured?.height ?? sourceNode.height ?? 20;
  const tw = targetNode.measured?.width ?? targetNode.width ?? 80;
  const th = targetNode.measured?.height ?? targetNode.height ?? 20;

  const lane = data?.lane ?? 0;
  const [ax, ay] = reachAnchor(so.x + sw / 2, so.y + sh / 2, sw, sh, to.x + tw / 2, to.y + th / 2, lane);
  const [bx, by] = reachAnchor(to.x + tw / 2, to.y + th / 2, tw, th, so.x + sw / 2, so.y + sh / 2, lane);

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ah = 11;
  const aw = 5;
  const tip = [bx, by] as const;
  const base = [bx - ux * ah, by - uy * ah] as const;
  const wing1 = [base[0] - uy * aw, base[1] + ux * aw] as const;
  const wing2 = [base[0] + uy * aw, base[1] - ux * aw] as const;

  const color = data?.color ?? "#64748b";
  const dimmed = data?.dimmed ?? false;
  const path = `M${ax},${ay} L${bx},${by}`;
  const labelX = (ax + bx) / 2;
  const labelY = (ay + by) / 2;

  return (
    <>
      <BaseEdge
        path={path}
        style={{ stroke: color, strokeWidth: 2.5, opacity: dimmed ? 0.12 : 1 }}
      />
      <polygon
        points={`${tip[0]},${tip[1]} ${wing1[0]},${wing1[1]} ${wing2[0]},${wing2[1]}`}
        fill={color}
        opacity={dimmed ? 0.12 : 1}
      />
      <EdgeLabelRenderer>
        {data?.label && (
          <div
            className="reach-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: color,
              opacity: dimmed ? 0 : 1,
            }}
          >
            {data.label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

const reachEdgeTypes = { reach: ReachEdge };

const EDGE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#dc2626",
  "#4f46e5",
  "#c026d3",
  "#0d9488",
  "#ea580c",
];

function assignLanes(edges: AnalysisResult["edges"]): number[] {
  const lane = new Array<number>(edges.length).fill(0);
  const groups = new Map<string, { forward: number[]; reverse: number[] }>();
  edges.forEach((e, i) => {
    const k = e.source < e.target ? `${e.source}:${e.target}` : `${e.target}:${e.source}`;
    if (!groups.has(k)) groups.set(k, { forward: [], reverse: [] });
    const g = groups.get(k)!;
    if (e.source < e.target) g.forward.push(i);
    else if (e.target < e.source) g.reverse.push(i);
    else g.forward.push(i);
  });
  for (const g of groups.values()) {
    const total = g.forward.length + g.reverse.length;
    if (total === 0) continue;
    const slot = new Array<number>(total);
    let f = 0;
    let r = 0;
    for (let t = 0; t < total; t++) {
      if (t % 2 === 0 && f < g.forward.length) slot[t] = g.forward[f++];
      else if (r < g.reverse.length) slot[t] = g.reverse[r++];
      else if (f < g.forward.length) slot[t] = g.forward[f++];
    }
    for (let t = 0; t < total; t++) {
      const idx = slot[t];
      if (idx !== undefined) lane[idx] = (t - (total - 1) / 2) * 14;
    }
  }
  return lane;
}

const BFS_LAYOUT_LIMIT = 600;

function bfsLayout(states: AnalysisResult["states"]): Record<string, { x: number; y: number }> {
  const levels = new Map<number, number[]>();
  states.forEach((s, i) => {
    const arr = levels.get(s.level) ?? [];
    arr.push(i);
    levels.set(s.level, arr);
  });
  let maxCol = 0;
  for (const arr of levels.values()) maxCol = Math.max(maxCol, arr.length);
  const W = 250;
  const H = 110;
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [level, arr] of levels) {
    const startY = ((maxCol - arr.length) * H) / 2;
    arr.forEach((idx, j) => {
      pos[String(idx)] = { x: level * W, y: startY + j * H };
    });
  }
  return pos;
}

function computeReachLayout(
  states: AnalysisResult["states"],
  edges: AnalysisResult["edges"],
): Record<string, { x: number; y: number }> {
  if (states.length > BFS_LAYOUT_LIMIT) return bfsLayout(states);
  const nodeSize = states.map((s, i) => ({
    id: String(i),
    width: 120,
    height: Math.max(40, Object.keys(s.marking).length * 16 + 16),
  }));
  const layoutEdges = edges.map((e) => ({ source: String(e.source), target: String(e.target) }));
  const level: Record<string, number> = {};
  states.forEach((s, i) => {
    level[String(i)] = s.level;
  });
  return computeConcentricLayout(nodeSize, layoutEdges, level, { ringSpacing: 150 });
}

export function AnalysisView({ t, netKind, nodes, edges, onBack }: AnalysisViewProps) {
  const [maxStates, setMaxStates] = useState(5000);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const rfRef = useRef<ReactFlowInstance<Node<ReachNodeData, "state">, Edge<ReachEdgeData>> | null>(
    null,
  );
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
  const transitionColors = useMemo(() => {
    const m: Record<string, string> = {};
    nodes
      .filter((n) => n.type === "transition")
      .forEach((n, i) => {
        m[n.id] = EDGE_COLORS[i % EDGE_COLORS.length];
      });
    return m;
  }, [nodes]);
  const transitionsInGraph = useMemo(() => {
    if (!result) return [];
    const seen: string[] = [];
    result.edges.forEach((e) => {
      if (!seen.includes(e.transitionId)) seen.push(e.transitionId);
    });
    return seen;
  }, [result]);

  const run = useCallback(() => {
    setLoading(true);
    setSelected(null);
    setHighlight(null);
    setError(null);
    const id = ++runIdRef.current;
    setTimeout(async () => {
      if (id !== runIdRef.current) return;
      try {
        const res = await invoke<AnalysisResult>("analyze_net", {
          semantic: flowToSemantic(nodes, edges, netKind),
          maxStates,
        });
        if (id !== runIdRef.current) return;
        setResult(res);
      } catch (e) {
        if (id !== runIdRef.current) return;
        setError(String(e));
      } finally {
        if (id === runIdRef.current) setLoading(false);
      }
    }, 30);
  }, [nodes, edges, netKind, maxStates]);

  useEffect(() => {
    run();
  }, []);

  const rfData = useMemo(() => {
    if (!result) return { nodes: [], edges: [] };
    const pos = computeReachLayout(result.states, result.edges);
    const rn: Node<ReachNodeData, "state">[] = result.states.map((s, i) => ({
      id: String(i),
      type: "state",
      position: pos[String(i)] ?? { x: 0, y: 0 },
      data: {
        marking: placeOrder.map((pid) => [placeLabels[pid] ?? pid, s.marking[pid] ?? 0]),
        deadlock: s.deadlock,
      },
    }));
    const lanes = assignLanes(result.edges);
    const re: Edge<ReachEdgeData>[] = result.edges.map((e, i) => {
      const color = transitionColors[e.transitionId] ?? "#64748b";
      return {
        id: `e-${i}`,
        source: String(e.source),
        target: String(e.target),
        type: "reach",
        data: {
          color,
          label: transitionLabels[e.transitionId] ?? e.transitionId,
          lane: lanes[i],
          dimmed: highlight !== null && highlight !== e.transitionId,
        },
      };
    });
    return { nodes: rn, edges: re };
  }, [result, placeOrder, placeLabels, transitionLabels, transitionColors, highlight]);

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<Node<ReachNodeData, "state">>(
    rfData.nodes,
  );
  const [rfEdges, setRfEdges, onRfEdgesChange] = useEdgesState<Edge<ReachEdgeData>>(rfData.edges);

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
      ) : error ? (
        <div className="analysis-empty analysis-error">{t("generationFailed", { error })}</div>
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
            {result.advanced.boundness && (
              <section>
                <h3>{t("analyzeBoundness")}</h3>
                <ul className="analysis-stats">
                  <li>
                    {result.advanced.boundness.bounded
                      ? t("analyzeBounded")
                      : t("analyzeUnbounded")}
                  </li>
                  {!result.advanced.boundness.bounded &&
                    result.advanced.boundness.unboundedPlaces.length > 0 && (
                      <li className="analysis-warn">
                        {t("analyzeUnboundedPlaces", {
                          places: result.advanced.boundness.unboundedPlaces.join(", "),
                        })}
                      </li>
                    )}
                  {result.advanced.boundness.note && (
                    <li className="analysis-warn">{result.advanced.boundness.note}</li>
                  )}
                </ul>
              </section>
            )}
            {result.advanced.deadTransitions && (
              <section>
                <h3>{t("analyzeDeadTransitions")}</h3>
                <ul className="analysis-transitions">
                  {result.advanced.deadTransitions.length === 0 ? (
                    <li className="hint">—</li>
                  ) : (
                    result.advanced.deadTransitions.map((id) => (
                      <li key={id} className="analysis-dead-trans">
                        {transitionLabels[id] ?? id}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            )}
            {result.advanced.timed && (
              <section>
                <h3>{t("analyzeTimed")}</h3>
                <ul className="analysis-stats">
                  <li>{t("analyzeStateClasses", { count: result.advanced.timed.stateClassCount })}</li>
                  <li>
                    {t("analyzeReachableMarkings", {
                      count: result.advanced.timed.reachableMarkingCount,
                    })}
                  </li>
                  {result.advanced.timed.truncated && (
                    <li className="analysis-warn">{t("simUnbounded")}</li>
                  )}
                </ul>
              </section>
            )}
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
              <h3>{t("analyzeTransitions")}</h3>
              <ul className="analysis-transitions">
                {transitionsInGraph.map((id) => (
                  <li key={id}>
                    <button
                      className={`analysis-trans${highlight === id ? " active" : ""}`}
                      onClick={() => setHighlight(highlight === id ? null : id)}
                      title={t("analyzeHighlightHint")}
                    >
                      <span
                        className="analysis-color"
                        style={{ background: transitionColors[id] ?? "#64748b" }}
                      />
                      <span>{transitionLabels[id] ?? id}</span>
                      {highlight === id && <span className="analysis-clear">✕</span>}
                    </button>
                  </li>
                ))}
              </ul>
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
              edgeTypes={reachEdgeTypes}
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
