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
  type Node,
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
import {
  createPlace,
  createTransition,
  createArc,
  aiNetToPetriNet,
  nextId,
  netToSummary,
  extractNet,
  stripNetAttrs,
  type PetriNode,
  type PetriEdge,
  type PetriNet,
  type PlaceData,
  type TransitionData,
  type ArcType,
  type ArcData,
  type NetKind,
  type CapacityMode,
  type CvnPlace,
  type ControlSub,
  type ResourceType,
  type TransitionKind,
  type CvnArcKind,
  type TimeInterval,
  TRANSITION_KINDS,
  CONTROL_SUBS,
  RESOURCE_TYPES,
} from "./types";
import { makeTranslator, languages, type Language } from "./i18n";
import {
  initialMarking,
  enabledTransitions,
  fireTransition,
  analyze,
  summarizeAnalysis,
  type Marking,
  type AnalysisResult,
} from "./simulation";

const nodeTypes = { place: PlaceNode, transition: TransitionNode };
const edgeTypes = { arc: ArcEdge };

const defaultEdgeOptions = {
  type: "arc",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#1f2937" },
};

type MenuAction = {
  type: "action";
  label: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
};
type MenuSeparator = { type: "separator" };
type MenuItem = MenuAction | MenuSeparator;
type MenuDef = { label: string; items: MenuItem[] };

function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as globalThis.Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className="menubar" ref={barRef}>
      {menus.map((menu) => {
        const open = openMenu === menu.label;
        return (
          <div key={menu.label} className="menu-root">
            <button
              className={open ? "menu-title active" : "menu-title"}
              onClick={() => setOpenMenu(open ? null : menu.label)}
            >
              {menu.label}
            </button>
            {open && (
              <div className="menu-dropdown">
                {menu.items.map((item, i) =>
                  item.type === "separator" ? (
                    <div key={i} className="menu-separator" />
                  ) : (
                    <button
                      key={i}
                      className="menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        item.onClick();
                        setOpenMenu(null);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.checked && <span className="menu-check">✓</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | null;

type ChatMessage = { role: "user" | "assistant"; content: string };

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
  const [activePanel, setActivePanel] = useState<"chat" | "props" | "simulation">("chat");
  const [selectMode, setSelectMode] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [netKind, setNetKind] = useState<NetKind>("pt");
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("pn-lang");
    return saved === "zh" || saved === "en" ? (saved as Language) : "en";
  });
  const t = useMemo(() => makeTranslator(lang), [lang]);
  const [marking, setMarking] = useState<Marking>({});
  const [simulating, setSimulating] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const rfInstance = useRef<ReactFlowInstance<PetriNode, PetriEdge> | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const pastRef = useRef<PetriNet[]>([]);
  const futureRef = useRef<PetriNet[]>([]);
  const pendingCommitRef = useRef<PetriNet | null>(null);
  const [, setHistoryVersion] = useState(0);
  const clipboardRef = useRef<{ nodes: PetriNode[]; edges: PetriEdge[] } | null>(null);

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
  }, [netKind, nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ netKind, nodes, edges });
    setNetKind(next.netKind);
    setNodes(next.nodes.map((n) => ({ ...n, selected: false })));
    setEdges(next.edges.map((e) => ({ ...e, selected: false })));
    setSelection(null);
    setHistoryVersion((v) => v + 1);
  }, [netKind, nodes, edges, setNodes, setEdges]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const copySelection = useCallback(() => {
    const selNodes = nodes.filter((n) => n.selected);
    if (selNodes.length === 0) return;
    const selIds = new Set(selNodes.map((n) => n.id));
    const selEdges = edges.filter((e) => selIds.has(e.source) && selIds.has(e.target));
    clipboardRef.current = { nodes: selNodes, edges: selEdges };
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
    if (selNodes.length === 1) {
      setSelection({ kind: "node", id: selNodes[0].id });
    } else if (selEdges.length === 1) {
      setSelection({ kind: "edge", id: selEdges[0].id });
    } else {
      setSelection(null);
    }
  }, []);

  const isValidConnection = useCallback(
    (conn: Edge | Connection) => {
      if (conn.source === conn.target) return false;
      const s = nodes.find((n) => n.id === conn.source);
      const t = nodes.find((n) => n.id === conn.target);
      if (!s || !t) return false;
      if (s.type === t.type) return false;
      const exists = edges.some(
        (e) => e.source === conn.source && e.target === conn.target,
      );
      return !exists;
    },
    [nodes, edges],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      scheduleCommit();
      setEdges((eds) =>
        addEdge(
          createArc(conn.source, conn.target, conn.sourceHandle, conn.targetHandle, 1, arcType),
          eds,
        ),
      );
    },
    [arcType, setEdges, scheduleCommit],
  );

  const toggleArcMode = useCallback(() => {
    setArcMode((m) => !m);
    setPendingSource(null);
  }, []);

  const enabled = useMemo(
    () => (simulating ? enabledTransitions(nodes, edges, marking) : []),
    [simulating, nodes, edges, marking],
  );

  const fireTransitionById = useCallback(
    (id: string) => {
      setMarking((m) => fireTransition(nodes, edges, m, id));
      setStepCount((c) => c + 1);
    },
    [nodes, edges],
  );

  const onNodeClick = useCallback(
    (_event: MouseEvent, node: PetriNode) => {
      if (simulating && node.type === "transition" && enabled.includes(node.id)) {
        fireTransitionById(node.id);
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
      if (!source) {
        setPendingSource(null);
        return;
      }
      if (source.type === node.type) {
        setPendingSource(null);
        return;
      }
      const exists = edges.some((e) => e.source === source.id && e.target === node.id);
      if (exists) {
        setPendingSource(null);
        return;
      }
      scheduleCommit();
      setEdges((eds) =>
        addEdge(createArc(source.id, node.id, "out", "in", 1, arcType), eds),
      );
      setPendingSource(null);
    },
    [
      simulating,
      enabled,
      fireTransitionById,
      arcMode,
      pendingSource,
      nodes,
      edges,
      arcType,
      setEdges,
      scheduleCommit,
    ],
  );

  const onPaneClick = useCallback(() => {
    if (arcMode) setPendingSource(null);
  }, [arcMode]);

  const startSimulation = useCallback(() => {
    setMarking(initialMarking(nodes));
    setStepCount(0);
    setAnalysis(null);
    setAutoPlay(false);
    setSimulating(true);
  }, [nodes]);

  const resetSimulation = useCallback(() => {
    setMarking(initialMarking(nodes));
    setStepCount(0);
  }, [nodes]);

  const stopSimulation = useCallback(() => {
    setSimulating(false);
    setAutoPlay(false);
  }, []);

  const fireStep = useCallback(() => {
    const list = enabledTransitions(nodes, edges, marking);
    if (list.length === 0) {
      setAutoPlay(false);
      return;
    }
    const id = list[Math.floor(Math.random() * list.length)];
    fireTransitionById(id);
  }, [nodes, edges, marking, fireTransitionById]);

  const runAnalysis = useCallback(() => {
    const init = simulating ? marking : initialMarking(nodes);
    setAnalysis(analyze(nodes, edges, init));
  }, [nodes, edges, simulating, marking]);

  useEffect(() => {
    if (!autoPlay || !simulating) return;
    const id = setInterval(fireStep, 600);
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
        data = { ...data, tokens: marking[n.id] ?? 0 } as PlaceData;
      }
      if (n.type === "transition" && enabled.includes(n.id)) {
        className = className
          ? `${className} enabled-transition`
          : "enabled-transition";
      }
      if (className === n.className && data === n.data) return n;
      return { ...n, className, data };
    });
  }, [nodes, pendingSource, simulating, marking, enabled]);

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
  }, [setNodes, setEdges, scheduleCommit]);

  const changeNetKind = useCallback(
    (next: NetKind) => {
      if (next === netKind) return;
      scheduleCommit();
      setNetKind(next);
      setNodes((nds) => nds.map((n) => ({ ...n, data: stripNetAttrs(next, n.data) })));
      setEdges((eds) =>
        eds.map((e) => {
          const base = {
            weight: e.data?.weight ?? 1,
            arcType: e.data?.arcType ?? "normal",
          };
          return next === "cvn"
            ? { ...e, data: { ...base, cvnArc: e.data?.cvnArc ?? { type: "plain" } } }
            : { ...e, data: base };
        }),
      );
      setSimulating(false);
      setAnalysis(null);
    },
    [netKind, scheduleCommit, setNodes, setEdges],
  );

  const onNodeDragStart = useCallback(() => {
    scheduleCommit();
  }, [scheduleCommit]);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<PlaceData | TransitionData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, data: { ...n.data, ...patch } as PlaceData | TransitionData }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const updateEdgeWeight = useCallback(
    (id: string, weight: number) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? { ...e, data: { weight, arcType: e.data?.arcType ?? "normal" } as ArcData }
            : e,
        ),
      );
    },
    [setEdges],
  );

  const updateEdgeType = useCallback(
    (id: string, arcType: ArcType) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? { ...e, data: { weight: e.data?.weight ?? 1, arcType } as ArcData }
            : e,
        ),
      );
    },
    [setEdges],
  );

  const updateEdgeCvn = useCallback(
    (id: string, cvnArc: CvnArcKind) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === id
            ? {
                ...e,
                data: {
                  weight: e.data?.weight ?? 1,
                  arcType: e.data?.arcType ?? "normal",
                  cvnArc,
                } as ArcData,
              }
            : e,
        ),
      );
    },
    [setEdges],
  );

  const handleSave = useCallback(async () => {
    const net: PetriNet = { netKind, nodes, edges };
    const path = await save({
      filters: [{ name: "Petri Net", extensions: ["json"] }],
      defaultPath: "untitled.pn.json",
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(net, null, 2));
  }, [nodes, edges, netKind]);

  const handleOpen = useCallback(async () => {
    const path = await open({
      filters: [{ name: "Petri Net", extensions: ["json"] }],
      multiple: false,
    });
    if (!path) return;
    const text = await readTextFile(path as string);
    const net = JSON.parse(text) as PetriNet;
    scheduleCommit();
    setNetKind(net.netKind ?? "pt");
    setNodes(net.nodes ?? []);
    setEdges(net.edges ?? []);
  }, [setNodes, setEdges, scheduleCommit]);

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: prompt }]);
    setChatLoading(true);
    try {
      const netSummary = netToSummary(nodes, edges);
      const analysisSummary = summarizeAnalysis(
        analyze(nodes, edges, initialMarking(nodes)),
      );
      const history = chatMessages.slice(-10);
      const raw = await invoke<string>("generate_petri_net", {
        prompt,
        netSummary,
        analysisSummary,
        history,
      });
      const aiNet = extractNet(raw);
      if (aiNet) {
        const net = aiNetToPetriNet(aiNet, netKind);
        scheduleCommit();
        setNodes(net.nodes);
        setEdges(net.edges);
        setSelection(null);
        const placeCount = net.nodes.filter((n) => n.type === "place").length;
        const transitionCount = net.nodes.length - placeCount;
        setChatMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: t("aiNetResult", {
              places: placeCount,
              transitions: transitionCount,
              arcs: net.edges.length,
            }),
          },
        ]);
        setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 80);
      } else {
        setChatMessages((m) => [
          ...m,
          { role: "assistant", content: raw.trim() },
        ]);
      }
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: t("generationFailed", { error: String(e) }) },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [
    chatInput,
    chatLoading,
    chatMessages,
    nodes,
    edges,
    netKind,
    setNodes,
    setEdges,
    scheduleCommit,
    t,
  ]);

  const selectedNode = selection?.kind === "node" ? nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? edges.find((e) => e.id === selection.id) : undefined;
  const placeNode =
    selectedNode?.type === "place"
      ? (selectedNode as Node<PlaceData, "place">)
      : undefined;
  const transitionNode =
    selectedNode?.type === "transition"
      ? (selectedNode as Node<TransitionData, "transition">)
      : undefined;

  const placeCvn: CvnPlace =
    placeNode?.data.cvnPlace ?? { class: "control", sub: "Statement" };
  const transInterval: TimeInterval =
    transitionNode?.data.interval ?? {
      earliest: 0,
      latest: null,
      leftOpen: false,
      rightOpen: false,
    };
  const edgeCvn: CvnArcKind = selectedEdge?.data?.cvnArc ?? { type: "plain" };

  const menus: MenuDef[] = [
    {
      label: t("menuFile"),
      items: [
        { type: "action", label: t("menuOpen"), onClick: handleOpen },
        { type: "action", label: t("menuSave"), onClick: handleSave },
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
      ],
    },
    {
      label: t("menuView"),
      items: [
        {
          type: "action",
          label: t("menuSelect"),
          checked: selectMode,
          onClick: () => setSelectMode((s) => !s),
        },
        {
          type: "action",
          label: t("menuSnap"),
          checked: snapEnabled,
          onClick: () => setSnapEnabled((s) => !s),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("menuPanelChat"),
          checked: activePanel === "chat",
          onClick: () => setActivePanel("chat"),
        },
        {
          type: "action",
          label: t("menuPanelProps"),
          checked: activePanel === "props",
          onClick: () => setActivePanel("props"),
        },
        {
          type: "action",
          label: t("menuPanelSimulation"),
          checked: activePanel === "simulation",
          onClick: () => setActivePanel("simulation"),
        },
      ],
    },
    {
      label: t("menuHelp"),
      items: [
        { type: "action", label: t("menuShortcuts"), onClick: () => setShowShortcuts(true) },
      ],
    },
  ];

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="toolbar">
        <button onClick={undo} disabled={!canUndo} title={t("undoTitle")}>
          {t("undo")}
        </button>
        <button onClick={redo} disabled={!canRedo} title={t("redoTitle")}>
          {t("redo")}
        </button>
        <button onClick={addPlace}>{t("addPlace")}</button>
        <button onClick={addTransition}>{t("addTransition")}</button>
        <button className={arcMode ? "active" : ""} onClick={toggleArcMode}>
          {t("addArc")}
        </button>
        <span className="arc-types">
          <button
            className={arcType === "normal" ? "active" : ""}
            onClick={() => setArcType("normal")}
          >
            {t("arcNormal")}
          </button>
          <button
            className={arcType === "reset" ? "active" : ""}
            onClick={() => setArcType("reset")}
          >
            {t("arcReset")}
          </button>
          <button
            className={arcType === "inhibitor" ? "active" : ""}
            onClick={() => setArcType("inhibitor")}
          >
            {t("arcInhibit")}
          </button>
        </span>
        {arcMode && (
          <span className="arc-mode-hint">
            {pendingSource ? t("arcTargetHint") : t("arcSourceHint")}
          </span>
        )}
        <span className="spacer" />
        <button
          className={selectMode ? "active" : ""}
          onClick={() => setSelectMode((s) => !s)}
          title={t("selectTitle")}
        >
          {t("select")}
        </button>
        <button
          className={snapEnabled ? "active" : ""}
          onClick={() => setSnapEnabled((s) => !s)}
          title={t("snapTitle")}
        >
          {t("snap")}
        </button>
        <button onClick={clearAll}>{t("clear")}</button>
        <button onClick={handleOpen}>{t("open")}</button>
        <button onClick={handleSave}>{t("save")}</button>
        <select
          className="lang-select"
          value={netKind}
          onChange={(e) => changeNetKind(e.target.value as NetKind)}
          title={t("netType")}
        >
          <option value="pt">{t("netTypePt")}</option>
          <option value="timed">{t("netTypeTimed")}</option>
          <option value="cvn">{t("netTypeCvn")}</option>
        </select>
        <select
          className="lang-select"
          value={lang}
          onChange={(e) => {
            const next = e.target.value as Language;
            setLang(next);
            localStorage.setItem("pn-lang", next);
          }}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

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
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
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
        </div>

        <aside className="inspector">
          <div className="panel-tabs">
            <button
              className={activePanel === "chat" ? "active" : ""}
              onClick={() => setActivePanel("chat")}
            >
              {t("tabChat")}
            </button>
            <button
              className={activePanel === "props" ? "active" : ""}
              onClick={() => setActivePanel("props")}
            >
              {t("tabProps")}
            </button>
            <button
              className={activePanel === "simulation" ? "active" : ""}
              onClick={() => setActivePanel("simulation")}
            >
              {t("tabSimulation")}
            </button>
          </div>

          {activePanel === "chat" ? (
            <div className="chat-panel">
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <p className="hint">{t("chatHint")}</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`chat-msg ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-msg assistant">{t("generating")}</div>
                )}
              </div>
              <div className="chat-input">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t("chatPlaceholder")}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  {t("send")}
                </button>
              </div>
            </div>
          ) : activePanel === "simulation" ? (
            <div className="sim-panel">
              <div className="sim-controls">
                {!simulating ? (
                  <button onClick={startSimulation}>{t("simStart")}</button>
                ) : (
                  <>
                    <button onClick={fireStep} disabled={enabled.length === 0}>
                      {t("simStep")}
                    </button>
                    <button onClick={() => setAutoPlay((a) => !a)}>
                      {autoPlay ? t("simPause") : t("simAuto")}
                    </button>
                    <button onClick={resetSimulation}>{t("simReset")}</button>
                    <button onClick={stopSimulation}>{t("simStop")}</button>
                  </>
                )}
              </div>

              {simulating && (
                <div className="sim-status">
                  <p className="sim-steps">{t("simSteps", { count: stepCount })}</p>
                  <h3>{t("simMarking")}</h3>
                  <div className="sim-marking">
                    {nodes
                      .filter((n) => n.type === "place")
                      .map((p) => (
                        <div key={p.id} className="sim-marking-row">
                          <span>{(p.data as PlaceData).label}</span>
                          <span>{marking[p.id] ?? 0}</span>
                        </div>
                      ))}
                  </div>
                  <h3>{t("simEnabled")}</h3>
                  <div className="sim-enabled">
                    {enabled.length === 0 ? (
                      <p className="hint">{t("simNoEnabled")}</p>
                    ) : (
                      enabled.map((id) => {
                        const tn = nodes.find((n) => n.id === id);
                        return (
                          <button key={id} onClick={() => fireTransitionById(id)}>
                            {(tn?.data as TransitionData).label ?? id}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <button className="sim-analyze-btn" onClick={runAnalysis}>
                {t("simAnalyze")}
              </button>

              {analysis && (
                <div className="sim-analysis">
                  <p>{t("simStates", { count: analysis.stateCount })}</p>
                  <p>{analysis.truncated ? t("simUnbounded") : t("simBounded")}</p>
                  <p>{t("simDeadlocks", { count: analysis.deadlockCount })}</p>
                  <h3>{t("simMaxTokens")}</h3>
                  <div className="sim-marking">
                    {nodes
                      .filter((n) => n.type === "place")
                      .map((p) => (
                        <div key={p.id} className="sim-marking-row">
                          <span>{(p.data as PlaceData).label}</span>
                          <span>{analysis.maxTokens[p.id] ?? 0}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="props-panel">
              <h2>{t("tabProps")}</h2>
              {!selection && <p className="hint">{t("propsHint")}</p>}
              {placeNode && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    {t("name")}
                    <input
                      value={placeNode.data.label}
                      onFocus={scheduleCommit}
                      onChange={(e) => updateNodeData(placeNode.id, { label: e.target.value })}
                    />
                  </label>
                  <label>
                    {t("tokens")}
                    <input
                      type="number"
                      min={0}
                      value={placeNode.data.tokens}
                      onFocus={scheduleCommit}
                      onChange={(e) =>
                        updateNodeData(placeNode.id, {
                          tokens: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                  {(netKind === "pt" || netKind === "timed") && (
                    <label>
                      {t("capacity")}
                      <input
                        type="number"
                        min={0}
                        value={placeNode.data.capacity ?? ""}
                        placeholder={t("unbounded")}
                        onFocus={scheduleCommit}
                        onChange={(e) =>
                          updateNodeData(placeNode.id, {
                            capacity:
                              e.target.value === ""
                                ? null
                                : Math.max(0, Number(e.target.value)),
                          })
                        }
                      />
                    </label>
                  )}
                  {netKind === "pt" && (
                    <label>
                      {t("capacityMode")}
                      <select
                        value={placeNode.data.capacityMode ?? "reject"}
                        onFocus={scheduleCommit}
                        onChange={(e) =>
                          updateNodeData(placeNode.id, {
                            capacityMode: e.target.value as CapacityMode,
                          })
                        }
                      >
                        <option value="reject">{t("capacityReject")}</option>
                        <option value="saturate">{t("capacitySaturate")}</option>
                      </select>
                    </label>
                  )}
                  {netKind === "timed" && (
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={placeNode.data.saturate ?? false}
                        onFocus={scheduleCommit}
                        onChange={(e) =>
                          updateNodeData(placeNode.id, { saturate: e.target.checked })
                        }
                      />
                      {t("saturate")}
                    </label>
                  )}
                  {netKind === "cvn" && (
                    <>
                      <label>
                        {t("placeClass")}
                        <select
                          value={placeCvn.class}
                          onFocus={scheduleCommit}
                          onChange={(e) => {
                            const cls = e.target.value as "control" | "resource";
                            updateNodeData(placeNode.id, {
                              cvnPlace:
                                cls === "control"
                                  ? { class: "control", sub: "Statement" }
                                  : { class: "resource", resource: "Mutex", param: 1 },
                            });
                          }}
                        >
                          <option value="control">{t("controlFlow")}</option>
                          <option value="resource">{t("resource")}</option>
                        </select>
                      </label>
                      {placeCvn.class === "control" ? (
                        <label>
                          {t("controlSub")}
                          <select
                            value={placeCvn.sub}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateNodeData(placeNode.id, {
                                cvnPlace: {
                                  class: "control",
                                  sub: e.target.value as ControlSub,
                                },
                              })
                            }
                          >
                            {CONTROL_SUBS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <>
                          <label>
                            {t("resourceType")}
                            <select
                              value={placeCvn.resource}
                              onFocus={scheduleCommit}
                              onChange={(e) =>
                                updateNodeData(placeNode.id, {
                                  cvnPlace: {
                                    class: "resource",
                                    resource: e.target.value as ResourceType,
                                    param: 1,
                                  },
                                })
                              }
                            >
                              {RESOURCE_TYPES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </label>
                          {(placeCvn.resource === "RwLock" ||
                            placeCvn.resource === "Semaphore") && (
                            <label>
                              {t("resourceParam")}
                              <input
                                type="number"
                                min={1}
                                value={placeCvn.param ?? 1}
                                onFocus={scheduleCommit}
                                onChange={(e) =>
                                  updateNodeData(placeNode.id, {
                                    cvnPlace: {
                                      class: "resource",
                                      resource: placeCvn.resource,
                                      param: Math.max(1, Number(e.target.value)),
                                    },
                                  })
                                }
                              />
                            </label>
                          )}
                        </>
                      )}
                    </>
                  )}
                </form>
              )}
              {transitionNode && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    {t("name")}
                    <input
                      value={transitionNode.data.label}
                      onFocus={scheduleCommit}
                      onChange={(e) => updateNodeData(transitionNode.id, { label: e.target.value })}
                    />
                  </label>
                  {(netKind === "pt" || netKind === "timed") && (
                    <label>
                      {t("priority")}
                      <input
                        type="number"
                        value={transitionNode.data.priority ?? ""}
                        placeholder="—"
                        onFocus={scheduleCommit}
                        onChange={(e) =>
                          updateNodeData(transitionNode.id, {
                            priority:
                              e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  {netKind === "timed" && (
                    <>
                      <fieldset className="props-fieldset">
                        <legend>{t("timeInterval")}</legend>
                        <label>
                          {t("earliest")}
                          <input
                            type="number"
                            min={0}
                            value={transInterval.earliest}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateNodeData(transitionNode.id, {
                                interval: {
                                  ...transInterval,
                                  earliest: Math.max(0, Number(e.target.value)),
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          {t("latest")}
                          <input
                            type="number"
                            min={0}
                            value={transInterval.latest ?? ""}
                            placeholder="∞"
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateNodeData(transitionNode.id, {
                                interval: {
                                  ...transInterval,
                                  latest:
                                    e.target.value === "" ? null : Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={transInterval.leftOpen}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateNodeData(transitionNode.id, {
                                interval: { ...transInterval, leftOpen: e.target.checked },
                              })
                            }
                          />
                          {t("leftOpen")}
                        </label>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={transInterval.rightOpen}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateNodeData(transitionNode.id, {
                                interval: { ...transInterval, rightOpen: e.target.checked },
                              })
                            }
                          />
                          {t("rightOpen")}
                        </label>
                      </fieldset>
                      <label>
                        {t("core")}
                        <input
                          type="number"
                          value={transitionNode.data.core ?? 0}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, { core: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={transitionNode.data.suspendable ?? false}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, {
                              suspendable: e.target.checked,
                            })
                          }
                        />
                        {t("suspendable")}
                      </label>
                    </>
                  )}
                  {netKind === "cvn" && (
                    <>
                      <label>
                        {t("transitionKind")}
                        <select
                          value={transitionNode.data.cvnKind ?? "Sequential"}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, {
                              cvnKind: e.target.value as TransitionKind,
                            })
                          }
                        >
                          {TRANSITION_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("scope")}
                        <input
                          value={transitionNode.data.scope ?? ""}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, {
                              scope: e.target.value === "" ? null : e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        {t("family")}
                        <input
                          value={transitionNode.data.family ?? ""}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, {
                              family: e.target.value === "" ? null : e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        {t("anchors")}
                        <input
                          value={transitionNode.data.anchors ?? ""}
                          onFocus={scheduleCommit}
                          onChange={(e) =>
                            updateNodeData(transitionNode.id, { anchors: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </form>
              )}
              {selectedEdge && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    {t("weight")}
                    <input
                      type="number"
                      min={1}
                      value={selectedEdge.data?.weight ?? 1}
                      onFocus={scheduleCommit}
                      onChange={(e) =>
                        updateEdgeWeight(selectedEdge.id, Math.max(1, Number(e.target.value)))
                      }
                    />
                  </label>
                  <label>
                    {t("type")}
                    <select
                      value={selectedEdge.data?.arcType ?? "normal"}
                      onFocus={scheduleCommit}
                      onChange={(e) =>
                        updateEdgeType(selectedEdge.id, e.target.value as ArcType)
                      }
                    >
                      <option value="normal">{t("arcNormal")}</option>
                      <option value="reset">{t("arcReset")}</option>
                      <option value="inhibitor">{t("arcInhibit")}</option>
                    </select>
                  </label>
                  {netKind === "cvn" && (
                    <>
                      <label>
                        {t("arcKind")}
                        <select
                          value={edgeCvn.type}
                          onFocus={scheduleCommit}
                          onChange={(e) => {
                            const ty = e.target.value as "plain" | "guard" | "update";
                            updateEdgeCvn(
                              selectedEdge.id,
                              ty === "plain"
                                ? { type: "plain" }
                                : ty === "guard"
                                  ? { type: "guard", guard: "" }
                                  : { type: "update", update: "" },
                            );
                          }}
                        >
                          <option value="plain">{t("plain")}</option>
                          <option value="guard">{t("guard")}</option>
                          <option value="update">{t("update")}</option>
                        </select>
                      </label>
                      {edgeCvn.type === "guard" && (
                        <label>
                          {t("guard")}
                          <input
                            value={edgeCvn.guard}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateEdgeCvn(selectedEdge.id, {
                                type: "guard",
                                guard: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      {edgeCvn.type === "update" && (
                        <label>
                          {t("update")}
                          <input
                            value={edgeCvn.update}
                            onFocus={scheduleCommit}
                            onChange={(e) =>
                              updateEdgeCvn(selectedEdge.id, {
                                type: "update",
                                update: e.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                </form>
              )}
            </div>
          )}
        </aside>
      </div>

      {showShortcuts && (
        <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t("shortcutsTitle")}</h2>
            <ul>
              <li>{t("shortcutUndo")}</li>
              <li>{t("shortcutRedo")}</li>
              <li>{t("shortcutCopy")}</li>
              <li>{t("shortcutPaste")}</li>
              <li>{t("shortcutDelete")}</li>
              <li>{t("shortcutSend")}</li>
            </ul>
            <button className="modal-close" onClick={() => setShowShortcuts(false)}>
              {t("shortcutsClose")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
