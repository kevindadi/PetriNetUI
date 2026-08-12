import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
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
  type PetriNode,
  type PetriEdge,
  type PetriNet,
  type PlaceData,
  type TransitionData,
  type ArcType,
  type ArcData,
  type AIPetriNet,
} from "./types";

const nodeTypes = { place: PlaceNode, transition: TransitionNode };
const edgeTypes = { arc: ArcEdge };

const defaultEdgeOptions = {
  type: "arc",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#1f2937" },
};

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
  const [activePanel, setActivePanel] = useState<"chat" | "props">("chat");
  const rfInstance = useRef<ReactFlowInstance<PetriNode, PetriEdge> | null>(null);

  const onNodesChangeWrapped = useCallback(
    (changes: NodeChange<PetriNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onEdgesChangeWrapped = useCallback(
    (changes: EdgeChange<PetriEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
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
      setEdges((eds) =>
        addEdge(
          createArc(conn.source, conn.target, conn.sourceHandle, conn.targetHandle, 1, arcType),
          eds,
        ),
      );
    },
    [arcType, setEdges],
  );

  const toggleArcMode = useCallback(() => {
    setArcMode((m) => !m);
    setPendingSource(null);
  }, []);

  const onNodeClick = useCallback(
    (_event: MouseEvent, node: PetriNode) => {
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
      setEdges((eds) =>
        addEdge(createArc(source.id, node.id, "out", "in", 1, arcType), eds),
      );
      setPendingSource(null);
    },
    [arcMode, pendingSource, nodes, edges, arcType, setEdges],
  );

  const onPaneClick = useCallback(() => {
    if (arcMode) setPendingSource(null);
  }, [arcMode]);

  const displayNodes = useMemo(() => {
    if (!pendingSource) return nodes;
    return nodes.map((n) =>
      n.id === pendingSource ? { ...n, className: "pending-source" } : n,
    );
  }, [nodes, pendingSource]);

  const onNodesDelete = useCallback(
    (deleted: PetriNode[]) => {
      const ids = new Set(deleted.map((n) => n.id));
      setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    },
    [setEdges],
  );

  const addPlace = useCallback(() => {
    const offset = nodes.length * 24;
    setNodes((nds) => [...nds, createPlace(160 + offset, 120 + offset)]);
  }, [nodes.length, setNodes]);

  const addTransition = useCallback(() => {
    const offset = nodes.length * 24;
    setNodes((nds) => [...nds, createTransition(160 + offset, 120 + offset)]);
  }, [nodes.length, setNodes]);

  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

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

  const handleSave = useCallback(async () => {
    const net: PetriNet = { nodes, edges };
    const path = await save({
      filters: [{ name: "Petri Net", extensions: ["json"] }],
      defaultPath: "untitled.pn.json",
    });
    if (!path) return;
    await writeTextFile(path, JSON.stringify(net, null, 2));
  }, [nodes, edges]);

  const handleOpen = useCallback(async () => {
    const path = await open({
      filters: [{ name: "Petri Net", extensions: ["json"] }],
      multiple: false,
    });
    if (!path) return;
    const text = await readTextFile(path as string);
    const net = JSON.parse(text) as PetriNet;
    setNodes(net.nodes ?? []);
    setEdges(net.edges ?? []);
  }, [setNodes, setEdges]);

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: prompt }]);
    setChatLoading(true);
    try {
      const raw = await invoke<string>("generate_petri_net", { prompt });
      const net = aiNetToPetriNet(JSON.parse(raw) as AIPetriNet);
      setNodes(net.nodes);
      setEdges(net.edges);
      setSelection(null);
      const placeCount = net.nodes.filter((n) => n.type === "place").length;
      const transitionCount = net.nodes.length - placeCount;
      setChatMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `已生成：${placeCount} 个库所、${transitionCount} 个变迁、${net.edges.length} 条弧。`,
        },
      ]);
      setTimeout(() => rfInstance.current?.fitView({ padding: 0.2 }), 80);
    } catch (e) {
      setChatMessages((m) => [
        ...m,
        { role: "assistant", content: `生成失败：${String(e)}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, setNodes, setEdges]);

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

  return (
    <div className="app">
      <div className="toolbar">
        <button onClick={addPlace}>+ Place</button>
        <button onClick={addTransition}>+ Transition</button>
        <button className={arcMode ? "active" : ""} onClick={toggleArcMode}>
          + Arc
        </button>
        <span className="arc-types">
          <button
            className={arcType === "normal" ? "active" : ""}
            onClick={() => setArcType("normal")}
          >
            Normal
          </button>
          <button
            className={arcType === "reset" ? "active" : ""}
            onClick={() => setArcType("reset")}
          >
            Reset
          </button>
          <button
            className={arcType === "inhibitor" ? "active" : ""}
            onClick={() => setArcType("inhibitor")}
          >
            Inhibit
          </button>
        </span>
        {arcMode && (
          <span className="arc-mode-hint">
            {pendingSource ? "点击目标节点以创建弧" : "点击起点节点"}
          </span>
        )}
        <span className="spacer" />
        <button onClick={clearAll}>Clear</button>
        <button onClick={handleOpen}>Open</button>
        <button onClick={handleSave}>Save</button>
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
            isValidConnection={isValidConnection}
            onNodesDelete={onNodesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={["Backspace", "Delete"]}
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
              AI Chat
            </button>
            <button
              className={activePanel === "props" ? "active" : ""}
              onClick={() => setActivePanel("props")}
            >
              Properties
            </button>
          </div>

          {activePanel === "chat" ? (
            <div className="chat-panel">
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <p className="hint">
                    描述你想建立的 Petri 网，例如：“一个生产者-消费者系统，包含两个库所和一个变迁”。
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`chat-msg ${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {chatLoading && <div className="chat-msg assistant">正在生成…</div>}
              </div>
              <div className="chat-input">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="描述 Petri 网…"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  发送
                </button>
              </div>
            </div>
          ) : (
            <div className="props-panel">
              <h2>Properties</h2>
              {!selection && (
                <p className="hint">
                  Click a place, transition or arc to edit it. Drag from a node's edge to
                  another node to create an arc. Press Delete to remove.
                </p>
              )}
              {placeNode && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    Name
                    <input
                      value={placeNode.data.label}
                      onChange={(e) => updateNodeData(placeNode.id, { label: e.target.value })}
                    />
                  </label>
                  <label>
                    Tokens
                    <input
                      type="number"
                      min={0}
                      value={placeNode.data.tokens}
                      onChange={(e) =>
                        updateNodeData(placeNode.id, {
                          tokens: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                </form>
              )}
              {transitionNode && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    Name
                    <input
                      value={transitionNode.data.label}
                      onChange={(e) => updateNodeData(transitionNode.id, { label: e.target.value })}
                    />
                  </label>
                </form>
              )}
              {selectedEdge && (
                <form className="props" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    Weight
                    <input
                      type="number"
                      min={1}
                      value={selectedEdge.data?.weight ?? 1}
                      onChange={(e) =>
                        updateEdgeWeight(selectedEdge.id, Math.max(1, Number(e.target.value)))
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={selectedEdge.data?.arcType ?? "normal"}
                      onChange={(e) =>
                        updateEdgeType(selectedEdge.id, e.target.value as ArcType)
                      }
                    >
                      <option value="normal">Normal</option>
                      <option value="reset">Reset</option>
                      <option value="inhibitor">Inhibitor</option>
                    </select>
                  </label>
                </form>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
