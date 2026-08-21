import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from "@xyflow/react";
import { patchArcData, type PetriEdge, type PetriNode } from "../types";

/**
 * Pick the point on a node's boundary that faces the other node (the nearest
 * connection point), together with that face so the curve leaves perpendicular
 * to it.
 */
function facingAnchor(
  cx: number,
  cy: number,
  w: number,
  h: number,
  ex: number,
  ey: number,
): { x: number; y: number; position: Position } {
  const dx = ex - cx;
  const dy = ey - cy;
  if (dx === 0 && dy === 0) return { x: cx + w / 2, y: cy, position: Position.Right };
  if (Math.abs(dx) >= Math.abs(dy)) {
    const dir = dx >= 0 ? 1 : -1;
    const x = cx + dir * (w / 2);
    const y = cy + (dy / Math.abs(dx)) * (w / 2);
    return { x, y, position: dir > 0 ? Position.Right : Position.Left };
  }
  const dir = dy >= 0 ? 1 : -1;
  const y = cy + dir * (h / 2);
  const x = cx + (dx / Math.abs(dy)) * (h / 2);
  return { x, y, position: dir > 0 ? Position.Bottom : Position.Top };
}

export function ArcEdge({ id, source, target, markerEnd, data, selected }: EdgeProps<PetriEdge>) {
  const sourceNode = useStore((s) => s.nodeLookup.get(source) ?? null);
  const targetNode = useStore((s) => s.nodeLookup.get(target) ?? null);
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

  let path = "";
  let labelX = 0;
  let labelY = 0;
  if (sourceNode && targetNode) {
    const so = sourceNode.internals.positionAbsolute;
    const to = targetNode.internals.positionAbsolute;
    const sw = sourceNode.measured?.width ?? sourceNode.width ?? 44;
    const sh = sourceNode.measured?.height ?? sourceNode.height ?? 44;
    const tw = targetNode.measured?.width ?? targetNode.width ?? 44;
    const th = targetNode.measured?.height ?? targetNode.height ?? 44;

    const sa = facingAnchor(
      so.x + sw / 2,
      so.y + sh / 2,
      sw,
      sh,
      to.x + tw / 2,
      to.y + th / 2,
    );
    const ta = facingAnchor(
      to.x + tw / 2,
      to.y + th / 2,
      tw,
      th,
      so.x + sw / 2,
      so.y + sh / 2,
    );

    [path, labelX, labelY] = getBezierPath({
      sourceX: sa.x,
      sourceY: sa.y,
      sourcePosition: sa.position,
      targetX: ta.x,
      targetY: ta.y,
      targetPosition: ta.position,
      curvature,
    });
  }

  const markerId = `inhibitor-marker-${id}`;
  const finalMarkerEnd = arcType === "inhibitor" ? `url(#${markerId})` : markerEnd;
  const isDashed = arcType === "reset";

  const commitWeight = () => {
    const w = Math.max(1, Math.floor(Number(draft) || 1));
    setEdges((eds) =>
      eds.map((e) => (e.id === id ? { ...e, data: patchArcData(e.data, { weight: w }) } : e)),
    );
    setEditing(false);
  };

  const extra =
    data?.cvnArc?.type === "guard"
      ? data.cvnArc.guard
        ? `[${data.cvnArc.guard}]`
        : "[g]"
      : data?.cvnArc?.type === "update"
        ? data.cvnArc.update
          ? `{${data.cvnArc.update}}`
          : "{u}"
        : "";

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
            {extra ? ` ${extra}` : ""}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}