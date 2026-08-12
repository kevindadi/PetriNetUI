import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from "@xyflow/react";
import type { PetriEdge, PetriNode, ArcData } from "../types";

export function ArcEdge(props: EdgeProps<PetriEdge>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
    selected,
  } = props;

  const edges = useStore((s) => s.edges);
  const { setEdges } = useReactFlow<PetriNode, PetriEdge>();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const arcType = data?.arcType ?? "normal";
  const weight = data?.weight ?? 1;

  const hasReverse = edges.some(
    (e) => e.id !== id && e.source === target && e.target === source,
  );
  const curvature = hasReverse ? (source < target ? 0.25 : -0.25) : 0.25;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  const markerId = `inhibitor-marker-${id}`;
  const finalMarkerEnd = arcType === "inhibitor" ? `url(#${markerId})` : markerEnd;
  const isDashed = arcType === "reset";

  const commitWeight = () => {
    const w = Math.max(1, Math.floor(Number(draft) || 1));
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id
          ? { ...e, data: { weight: w, arcType: e.data?.arcType ?? "normal" } as ArcData }
          : e,
      ),
    );
    setEditing(false);
  };

  return (
    <>
      {arcType === "inhibitor" && (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 16 16"
            markerWidth="16"
            markerHeight="16"
            refX="13"
            refY="8"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <circle cx="8" cy="8" r="5" fill="#ffffff" stroke="#1f2937" strokeWidth="1.5" />
          </marker>
        </defs>
      )}
      <BaseEdge
        path={path}
        markerEnd={finalMarkerEnd}
        style={isDashed ? { strokeDasharray: "6 4" } : undefined}
        className={selected ? "selected" : undefined}
      />
      <EdgeLabelRenderer>
        {editing ? (
          <input
            className="arc-label-input nodrag nopan"
            type="number"
            min={1}
            autoFocus
            value={draft}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitWeight}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitWeight();
              if (e.key === "Escape") setEditing(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="arc-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(String(weight));
              setEditing(true);
            }}
          >
            {weight}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
