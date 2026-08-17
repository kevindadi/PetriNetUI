import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Edge,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import "@xyflow/react/dist/style.css";
import "./App.css";
import { PlaceNode } from "./nodes/PlaceNode";
import { TransitionNode } from "./nodes/TransitionNode";
import { ArcEdge } from "./edges/ArcEdge";
import { MenuBar, type MenuDef } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { ChatPanel } from "./components/ChatPanel";
import { PropsPanel } from "./components/PropsPanel";
import { NetOverview } from "./components/NetOverview";
import { SimulationPanel } from "./components/SimulationPanel";
import { StatusBar } from "./components/StatusBar";
import { NetKindModal } from "./components/NetKindModal";
import { CanvasLegend } from "./components/CanvasLegend";
import { AnalysisView } from "./components/AnalysisView";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { useNetHistory } from "./hooks/useNetHistory";
import {
  createPlace,
  createTransition,
  createArc,
  aiNetToPetriNet,
  nextId,
  netToSummary,
  extractNet,
  stripNetAttrs,
  patchArcData,
  type PetriNode,
  type PetriEdge,
  type PetriNet,
  type PlaceData,
  type TransitionData,
  type ArcType,
  type ArcData,
  type NetKind,
  type CvnArcKind,
  type Selection,
  type ChatMessage,
} from "./types";
import { makeTranslator, type Language } from "./i18n";
import { NET_EXAMPLES } from "./examples";
import { computeLayout } from "./layout";
import {
  bumpIdCounterForIds,
  flowToSemantic,
  positionsFromFlow,
  semanticToFlow,
} from "./model";
import { parseXml, serializeXml } from "./xml";
import {
  summarizeAnalysis,
  pickTransition,
  type SimState,
  type AnalysisResult,
} from "./simulation";

const nodeTypes = { place: PlaceNode, transition: TransitionNode };
const edgeTypes = { arc: ArcEdge };

const defaultEdgeOptions = {
  type: "arc",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#1f2937" },
};

function App() {
  const initialNet = useMemo<PetriNet>(() => {
    const p1 = createPlace(150, 150);
    p1.data = { ...p1.data, label: "P1", tokens: 1 };
    const t1 = createTransition(330, 150);
    const p2 = createPlace(510, 150);
    p2.data = { ...p2.data, label: "P2", tokens: 0 };
    return {
      netKind: "pt",
      nodes: [p1, t1, p2],
      edges: [
        createArc(p1.id, t1.id, "out", "in", 1),
        createArc(t1.id, p2.id, "out", "in", 1),
      ],
    };
  }, []);

  const [nodes, setNodes] = useNodesState<PetriNode>(initialNet.nodes);
  const [edges, setEdges] = useEdgesState<PetriEdge>(initialNet.edges);
  const [selection, setSelection] = useState<Selection>(null);
  const [arcMode, setArcMode] = useState(false);
  const [arcType, setArcType] = useState<ArcType>("normal");
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simCollapsed, setSimCollapsed] = useState(false);
  const [showNetKind, setShowNetKind] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [netKind, setNetKind] = useState<NetKind>("pt");
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("pn-lang");
    return saved === "zh" || saved === "en" ? saved : "en";
  });
  const t = useMemo(() => makeTranslator(lang), [lang]);
  const [simState, setSimState] = useState<SimState | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [canAdvance, setCanAdvance] = useState(false);
  const [idleEnabled, setIdleEnabled] = useState<string[]>([]);
  const [idleWaiting, setIdleWaiting] = useState<string[]>([]);
  const simBusyRef = useRef(false);
  const [simulating, setSimulating] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const rfInstance = useRef<ReactFlowInstance<PetriNode, PetriEdge> | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const clipboardRef = useRef<{ nodes: PetriNode[]; edges: PetriEdge[] } | null>(null);

  const { scheduleCommit, undo, redo, canUndo, canRedo } = useNetHistory(
    netKind,
    nodes,
    edges,
    setNetKind,
    setNodes,
    setEdges,
    setSelection,
  );

  const copySelection = useCallback(() => {
    const selNodes = nodes.filter((n) => n.selected);
    if (selNodes.length === 0) return;
    const selIds = new Set(selNodes.map((n) => n.id));
    clipboardRef.current = {
      nodes: selNodes,
      edges: edges.filter((e) => selIds.has(e.source) && selIds.has(e.target)),
    };
  }, [nodes, edges]);

  const pasteSelection = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    scheduleCommit();
    const idMap: Record<string, string> = {};
    const newNodes: PetriNode[] = clip.nodes.map((n) => {
      const newId = nextId(n.type === "place" ? "p" : "t");
      idMap[n.id] = newId;
      return {
        ...n,
        id: newId,
        selected: false,
        position: { x: n.position.x + 24, y: n.position.y + 24 },
        data: stripNetAttrs(netKind, n.data) as PlaceData | TransitionData,
      };
    });
    const newEdges: PetriEdge[] = clip.edges
      .filter((e) => idMap[e.source] && idMap[e.target])
      .map((e) => ({
        ...e,
        id: nextId("a"),
        source: idMap[e.source],
        target: idMap[e.target],
        selected: false,
        data: e.data ? ({ ...e.data } as ArcData) : undefined,
      }));
    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
  }, [netKind, scheduleCommit, setNodes, setEdges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "c") {
        copySelection();
      } else if (key === "v") {
        e.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, copySelection, pasteSelection]);

  const onNodesChangeWrapped = useCallback(
    (changes: NodeChange<PetriNode>[]) => {
      if (changes.some((c) => c.type === "remove")) scheduleCommit();
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes, scheduleCommit],
  );

  const onEdgesChangeWrapped = useCallback(
    (changes: EdgeChange<PetriEdge>[]) => {
      if (changes.some((c) => c.type === "remove")) scheduleCommit();
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges, scheduleCommit],
  );

  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
    if (selNodes.length === 1) setSelection({ kind: "node", id: selNodes[0].id });
    else if (selEdges.length === 1) setSelection({ kind: "edge", id: selEdges[0].id });
    else setSelection(null);
  }, []);

  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      if (conn.source === conn.target) return false;
      const s = nodes.find((n) => n.id === conn.source);
      const t = nodes.find((n) => n.id === conn.target);
      if (!s || !t || s.type === t.type) return false;
      return !edges.some((e) => e.source === conn.source && e.target === conn.target);
    },
    [nodes, edges],
  );

  const makeArc = useCallback(
    (
      source: string,
      target: string,
      sourceHandle: string | null,
      targetHandle: string | null,
    ) =>
      createArc(
        source,
        target,
        sourceHandle,
        targetHandle,
        1,
        arcType,
        netKind === "cvn" ? { type: "plain" } : undefined,
      ),
    [arcType, netKind],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      scheduleCommit();
      setEdges((eds) => addEdge(makeArc(conn.source, conn.target, conn.sourceHandle, conn.targetHandle), eds));
    },
    [makeArc, setEdges, scheduleCommit],
  );

  type SimResult = {
    state: SimState;
    enabled: string[];
    waiting: string[];
    canAdvance: boolean;
  };

  const applySimResult = useCallback((r: SimResult) => {
    setSimState(r.state);
    setEnabled(r.enabled);
    setWaiting(r.waiting);
    setCanAdvance(r.canAdvance);
  }, []);

  const refreshIdle = useCallback(async () => {
    try {
      const r = await invoke<SimResult>("sim_initial", {
        semantic: flowToSemantic(nodes, edges, netKind),
      });
      setIdleEnabled(r.enabled);
      setIdleWaiting(r.waiting);
    } catch {
      /* keep previous highlight */
    }
  }, [nodes, edges, netKind]);

  useEffect(() => {
    if (simulating) return;
    const timer = setTimeout(() => {
      void refreshIdle();
    }, 120);
    return () => clearTimeout(timer);
  }, [refreshIdle, simulating]);

  const fireTransitionById = useCallback(
    async (id: string) => {
      if (!simState) return;
      try {
        const r = await invoke<SimResult | null>("sim_fire", {
          semantic: flowToSemantic(nodes, edges, netKind),
          state: simState,
          transitionId: id,
        });
        if (r) {
          applySimResult(r);
          setStepCount((c) => c + 1);
        }
      } catch {
        /* ignore */
      }
    },
    [simState, nodes, edges, netKind, applySimResult],
  );

  const onNodeClick = useCallback(
    (_event: MouseEvent, node: PetriNode) => {
      if (simulating && node.type === "transition" && enabled.includes(node.id)) {
        void fireTransitionById(node.id);
        return;
      }
      if (!arcMode) return;
      if (!pendingSource) {
        setPendingSource(node.id);
        return;
      }
      if (node.id === pendingSource) {
        setPendingSource(null);
        return;
      }
      const source = nodes.find((n) => n.id === pendingSource);
      if (!source || source.type === node.type) {
        setPendingSource(null);
        return;
      }
      if (edges.some((e) => e.source === source.id && e.target === node.id)) {
        setPendingSource(null);
        return;
      }
      scheduleCommit();
      setEdges((eds) => addEdge(makeArc(source.id, node.id, "out", "in"), eds));
      setPendingSource(null);
    },
    [simulating, enabled, fireTransitionById, arcMode, pendingSource, nodes, edges, makeArc, setEdges, scheduleCommit],
  );

  const startSimulation = useCallback(async () => {
    setSimulating(true);
    setStepCount(0);
    setAutoPlay(false);
    setSimCollapsed(false);
    setSimOpen(true);
    try {
      const r = await invoke<SimResult>("sim_initial", {
        semantic: flowToSemantic(nodes, edges, netKind),
      });
      applySimResult(r);
    } catch {
      setSimulating(false);
    }
  }, [nodes, edges, netKind, applySimResult]);

  const resetSimulation = useCallback(async () => {
    setStepCount(0);
    try {
      const r = await invoke<SimResult>("sim_initial", {
        semantic: flowToSemantic(nodes, edges, netKind),
      });
      applySimResult(r);
    } catch {
      /* ignore */
    }
  }, [nodes, edges, netKind, applySimResult]);

  const stopSimulation = useCallback(() => {
    setSimulating(false);
    setAutoPlay(false);
  }, []);

  const advanceSimTime = useCallback(async () => {
    if (!simState) return;
    try {
      const r = await invoke<SimResult | null>("sim_advance_time", {
        semantic: flowToSemantic(nodes, edges, netKind),
        state: simState,
      });
      if (r) applySimResult(r);
    } catch {
      /* ignore */
    }
  }, [simState, nodes, edges, netKind, applySimResult]);

  const fireStep = useCallback(async () => {
    if (!simState) return;
    if (enabled.length > 0) {
      const id = pickTransition(enabled, nodes);
      if (id) {
        await fireTransitionById(id);
        return;
      }
    }
    if (canAdvance) {
      await advanceSimTime();
      return;
    }
    setAutoPlay(false);
  }, [simState, enabled, canAdvance, nodes, fireTransitionById, advanceSimTime]);

  const runAnalysis = useCallback(() => {
    setShowAnalysis(true);
  }, []);

  useEffect(() => {
    if (!autoPlay || !simulating) return;
    const id = setInterval(() => {
      if (simBusyRef.current) return;
      simBusyRef.current = true;
      void fireStep().finally(() => {
        simBusyRef.current = false;
      });
    }, 600);
    return () => clearInterval(id);
  }, [autoPlay, simulating, fireStep]);

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      let className = n.className;
      if (pendingSource && n.id === pendingSource) {
        className = className ? `${className} pending-source` : "pending-source";
      }
      let data = n.data;
      if (n.type === "place" && simulating) {
        data = { ...data, tokens: simState?.marking[n.id] ?? 0 } as PlaceData;
      }
      const activeEnabled = simulating ? enabled : idleEnabled;
      const activeWaiting = simulating ? waiting : idleWaiting;
      if (n.type === "transition" && activeEnabled.includes(n.id)) {
        const cls = simulating ? "enabled-transition" : "enabled-idle";
        className = className ? `${className} ${cls}` : cls;
      } else if (n.type === "transition" && activeWaiting.includes(n.id)) {
        const cls = simulating ? "waiting-transition" : "waiting-idle";
        className = className ? `${className} ${cls}` : cls;
      }
      if (className === n.className && data === n.data) return n;
      return { ...n, className, data };
    });
  }, [nodes, pendingSource, simulating, simState, enabled, waiting, idleEnabled, idleWaiting]);

  const onNodesDelete = useCallback(
    (deleted: PetriNode[]) => {
      const ids = new Set(deleted.map((n) => n.id));
      setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    },
    [setEdges],
  );

  const addPlace = useCallback(() => {
    const offset = nodes.length * 24;
    scheduleCommit();
    setNodes((nds) => [...nds, createPlace(160 + offset, 120 + offset, netKind)]);
  }, [nodes.length, netKind, setNodes, scheduleCommit]);

  const addTransition = useCallback(() => {
    const offset = nodes.length * 24;
    scheduleCommit();
    setNodes((nds) => [...nds, createTransition(160 + offset, 120 + offset, netKind)]);
  }, [nodes.length, netKind, setNodes, scheduleCommit]);

  const clearAll = useCallback(() => {
    scheduleCommit();
    setNodes([]);
    setEdges([]);
    setSelection(null);
  }, [setNodes, setEdges, scheduleCommit]);

  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  const deleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;
    scheduleCommit();
    const nodeIds = new Set(selectedNodes.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) =>
      eds.filter((e) => !e.selected && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    );
    setSelection(null);
  }, [nodes, edges, scheduleCommit, setNodes, setEdges]);

  const changeNetKind = useCallback(
    (next: NetKind) => {
      if (next === netKind) return;
      scheduleCommit();
      setNetKind(next);
      setNodes((nds) => nds.map((n) => ({ ...n, data: stripNetAttrs(next, n.data) })));
      setEdges((eds) =>
        eds.map((e) => {
          const base = patchArcData(e.data, {});
          return next === "cvn"
            ? { ...e, data: { ...base, cvnArc: e.data?.cvnArc ?? { type: "plain" } } }
            : { ...e, data: { weight: base.weight, arcType: base.arcType } };
        }),
      );
      setSimulating(false);
    },
    [netKind, scheduleCommit, setNodes, setEdges],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<PlaceData | TransitionData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } as PlaceData | TransitionData } : n,
        ),
      );
    },
    [setNodes],
  );

  const updateEdgeWeight = useCallback(
    (id: string, weight: number) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, data: patchArcData(e.data, { weight }) } : e)),
      );
    },
    [setEdges],
  );

  const updateEdgeType = useCallback(
    (id: string, nextType: ArcType) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, data: patchArcData(e.data, { arcType: nextType }) } : e)),
      );
    },
    [setEdges],
  );

  const updateEdgeCvn = useCallback(
    (id: string, cvnArc: CvnArcKind) => {
      setEdges((eds) =>
        eds.map((e) => (e.id === id ? { ...e, data: patchArcData(e.data, { cvnArc }) } : e)),
      );
    },
    [setEdges],
  );

  const handleSave = useCallback(async () => {
    const path = await save({
      filters: [{ name: "Petri Net (XML)", extensions: ["xml"] }],
      defaultPath: "untitled.pn.xml",
    });
    if (!path) return;
    const xml = serializeXml(flowToSemantic(nodes, edges, netKind), positionsFromFlow(nodes));
    await writeTextFile(path, xml);
  }, [nodes, edges, netKind]);

  const handleExportSemantic = useCallback(async () => {
    const path = await save({
      filters: [{ name: "Semantic JSON", extensions: ["json"] }],
      defaultPath: "net.semantic.json",
    });
    if (!path) return;
    await writeTextFile(
      path,
      JSON.stringify(flowToSemantic(nodes, edges, netKind), null, 2),
    );
  }, [nodes, edges, netKind]);

  const handleOpen = useCallback(async () => {
    const path = await open({
      filters: [
        { name: "Petri Net", extensions: ["xml", "json"] },
      ],
      multiple: false,
    });
    if (!path) return;
    const text = await readTextFile(path as string);
    scheduleCommit();
    if (text.trimStart().startsWith("<")) {
      const { sem, positions } = parseXml(text);
      bumpIdCounterForIds([
        ...sem.places.map((p) => p.id),
        ...sem.transitions.map((t) => t.id),
        ...sem.arcs.map((a) => a.id),
      ]);
      const net = semanticToFlow(sem, positions);
      setNetKind(sem.netKind);
      setNodes(net.nodes);
      setEdges(net.edges);
    } else {
      const net = JSON.parse(text) as PetriNet;
      bumpIdCounterForIds([...net.nodes.map((n) => n.id), ...net.edges.map((e) => e.id)]);
      setNetKind(net.netKind ?? "pt");
      setNodes(net.nodes ?? []);
      setEdges(net.edges ?? []);
    }
    setSelection(null);
  }, [setNodes, setEdges, scheduleCommit]);

  const applyLayout = useCallback(
    (net: PetriNet): PetriNet => {
      const positions = computeLayout(
        net.nodes.map((n) => ({ id: n.id, width: 84, height: 64 })),
        net.edges,
      );
      return {
        ...net,
        nodes: net.nodes.map((n) => ({
          ...n,
          position: positions[n.id] ?? n.position,
        })),
      };
    },
    [],
  );

  const autoLayout = useCallback(() => {
    scheduleCommit();
    const positions = computeLayout(
      nodes.map((n) => ({ id: n.id, width: 84, height: 64 })),
      edges,
    );
    setNodes((nds) => nds.map((n) => ({ ...n, position: positions[n.id] ?? n.position })));
    setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 60);
  }, [nodes, edges, scheduleCommit, setNodes]);

  const loadExample = useCallback(
    (build: () => PetriNet) => {
      const net = applyLayout(build());
      scheduleCommit();
      setNetKind(net.netKind);
      setNodes(net.nodes);
      setEdges(net.edges);
      setSelection(null);
      setSimulating(false);
      setAutoPlay(false);
      setSimOpen(false);
      setShowAnalysis(false);
      setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 80);
    },
    [applyLayout, scheduleCommit, setNetKind, setNodes, setEdges],
  );

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: prompt }]);
    setChatLoading(true);
    try {
      let analysisSummary = "";
      try {
        const ar = await invoke<AnalysisResult>("analyze_net", {
          semantic: flowToSemantic(nodes, edges, netKind),
          maxStates: 2000,
        });
        analysisSummary = summarizeAnalysis(ar);
      } catch {
        analysisSummary = "analysis unavailable";
      }
      const raw = await invoke<string>("generate_petri_net", {
        prompt,
        netSummary: netToSummary(nodes, edges, netKind),
        analysisSummary,
        history: chatMessages.slice(-10),
        netKind,
      });
      const aiNet = extractNet(raw);
      if (aiNet) {
        const net = applyLayout(aiNetToPetriNet(aiNet, netKind));
        scheduleCommit();
        setNodes(net.nodes);
        setEdges(net.edges);
        setSelection(null);
        const placeCount = net.nodes.filter((n) => n.type === "place").length;
        setChatMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: t("aiNetResult", {
              places: placeCount,
              transitions: net.nodes.length - placeCount,
              arcs: net.edges.length,
            }),
          },
        ]);
        setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 80);
      } else {
        setChatMessages((m) => [...m, { role: "assistant", content: raw.trim() }]);
      }
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: t("generationFailed", { error: String(e) }) },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, nodes, edges, netKind, setNodes, setEdges, scheduleCommit, t]);

  const selectedNode = selection?.kind === "node" ? nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? edges.find((e) => e.id === selection.id) : undefined;

  const menus: MenuDef[] = [
    {
      label: t("menuFile"),
      items: [
        { type: "action", label: t("menuOpen"), onClick: handleOpen },
        { type: "action", label: t("menuSave"), onClick: handleSave },
        { type: "action", label: t("menuExportSemantic"), onClick: handleExportSemantic },
        { type: "separator" },
        { type: "action", label: t("menuClear"), onClick: clearAll },
      ],
    },
    {
      label: t("menuEdit"),
      items: [
        { type: "action", label: t("menuUndo"), disabled: !canUndo, onClick: undo },
        { type: "action", label: t("menuRedo"), disabled: !canRedo, onClick: redo },
        { type: "separator" },
        { type: "action", label: t("menuCopy"), onClick: copySelection },
        { type: "action", label: t("menuPaste"), onClick: pasteSelection },
        { type: "separator" },
        { type: "action", label: t("menuDelete"), disabled: !hasSelection, onClick: deleteSelected },
      ],
    },
    {
      label: t("menuView"),
      items: [
        { type: "action", label: t("menuSelect"), checked: selectMode, onClick: () => setSelectMode((s) => !s) },
        { type: "action", label: t("menuSnap"), checked: snapEnabled, onClick: () => setSnapEnabled((s) => !s) },
        { type: "separator" },
        { type: "action", label: t("menuShowSim"), checked: simOpen, onClick: () => setSimOpen((s) => !s) },
        { type: "action", label: t("menuShowChat"), checked: chatOpen, onClick: () => setChatOpen((s) => !s) },
      ],
    },
    {
      label: t("menuExamples"),
      items: NET_EXAMPLES.map((ex) => ({
        type: "action",
        label: t(ex.key),
        onClick: () => loadExample(ex.build),
      })),
    },
    {
      label: t("menuHelp"),
      items: [{ type: "action", label: t("menuShortcuts"), onClick: () => setShowShortcuts(true) }],
    },
  ];

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <Toolbar
        t={t}
        canUndo={canUndo}
        canRedo={canRedo}
        arcMode={arcMode}
        arcType={arcType}
        pendingSource={pendingSource}
        netKind={netKind}
        lang={lang}
        onUndo={undo}
        onRedo={redo}
        onAddPlace={addPlace}
        onAddTransition={addTransition}
        onToggleArcMode={() => {
          setArcMode((m) => !m);
          setPendingSource(null);
        }}
        onArcType={setArcType}
        canDelete={hasSelection}
        onDelete={deleteSelected}
        onClear={clearAll}
        chatOpen={chatOpen}
        simOpen={simOpen}
        onChooseNetKind={() => setShowNetKind(true)}
        onToggleChat={() => setChatOpen((o) => !o)}
        onToggleSim={() => setSimOpen((o) => !o)}
        onAutoLayout={autoLayout}
        onLang={(next) => {
          setLang(next);
          localStorage.setItem("pn-lang", next);
        }}
      />

      <div className="workspace">
        <div className="canvas">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChangeWrapped}
            onEdgesChange={onEdgesChangeWrapped}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeClick={onNodeClick}
            onPaneClick={() => {
              if (arcMode) setPendingSource(null);
            }}
            onNodeDragStart={scheduleCommit}
            isValidConnection={isValidConnection}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={["Backspace", "Delete"]}
            selectionOnDrag={selectMode}
            panOnDrag={selectMode ? [1, 2] : true}
            snapToGrid={snapEnabled}
            snapGrid={[16, 16]}
            fitView
            onInit={(inst) => {
              rfInstance.current = inst;
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => (n.type === "place" ? "#dbeafe" : "#fef3c7")}
            />
          </ReactFlow>

          <CanvasLegend t={t} />

          {chatOpen && (
            <div className="chat-float">
              <div className="chat-float-header">
                <span>{t("tabChat")}</span>
                <button
                  className="chat-float-close"
                  onClick={() => setChatOpen(false)}
                  title={t("chatClose")}
                >
                  ✕
                </button>
              </div>
              <ChatPanel
                t={t}
                netKind={netKind}
                messages={chatMessages}
                input={chatInput}
                loading={chatLoading}
                onInput={setChatInput}
                onSend={sendChat}
              />
            </div>
          )}
        </div>

        <aside className="inspector">
          {selectedNode || selectedEdge ? (
            <PropsPanel
              t={t}
              netKind={netKind}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onCommit={scheduleCommit}
              onUpdateNode={updateNodeData}
              onUpdateEdgeWeight={updateEdgeWeight}
              onUpdateEdgeType={updateEdgeType}
              onUpdateEdgeCvn={updateEdgeCvn}
            />
          ) : (
            <NetOverview
              t={t}
              netKind={netKind}
              places={nodes.filter((n) => n.type === "place").length}
              transitions={nodes.filter((n) => n.type === "transition").length}
              arcs={edges.length}
              onAddPlace={addPlace}
              onAddTransition={addTransition}
              onChangeKind={() => setShowNetKind(true)}
              onStartSim={startSimulation}
              onAnalyze={runAnalysis}
            />
          )}
        </aside>
      </div>

      {simOpen && simState && (
        <SimulationPanel
          t={t}
          netKind={netKind}
          nodes={nodes}
          simulating={simulating}
          autoPlay={autoPlay}
          stepCount={stepCount}
          simState={simState}
          enabled={enabled}
          waiting={waiting}
          canAdvance={canAdvance}
          collapsed={simCollapsed}
          onToggleCollapsed={() => setSimCollapsed((c) => !c)}
          onStart={startSimulation}
          onStep={fireStep}
          onAdvanceTime={advanceSimTime}
          onToggleAuto={() => setAutoPlay((a) => !a)}
          onReset={resetSimulation}
          onStop={stopSimulation}
          onFire={fireTransitionById}
          onAnalyze={runAnalysis}
        />
      )}

      <StatusBar
        t={t}
        netKind={netKind}
        places={nodes.filter((n) => n.type === "place").length}
        transitions={nodes.filter((n) => n.type === "transition").length}
        arcs={edges.length}
        arcMode={arcMode}
        pendingSource={pendingSource !== null}
        selectMode={selectMode}
        snapEnabled={snapEnabled}
      />

      {showNetKind && (
        <NetKindModal
          t={t}
          current={netKind}
          onSelect={(kind) => {
            changeNetKind(kind);
            setShowNetKind(false);
          }}
          onClose={() => setShowNetKind(false)}
        />
      )}
      {showShortcuts && <ShortcutsModal t={t} onClose={() => setShowShortcuts(false)} />}

      {showAnalysis && (
        <div className="analysis-overlay">
          <AnalysisView
            t={t}
            netKind={netKind}
            nodes={nodes}
            edges={edges}
            onBack={() => setShowAnalysis(false)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
