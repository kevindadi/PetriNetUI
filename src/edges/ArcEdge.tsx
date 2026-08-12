import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { PetriEdge } from "../types";

export function ArcEdge(props: EdgeProps<PetriEdge>) {
  const {
    id,
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

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const arcType = data?.arcType ?? "normal";
  const weight = data?.weight ?? 1;
  const markerId = `inhibitor-marker-${id}`;

  const finalMarkerEnd = arcType === "inhibitor" ? `url(#${markerId})` : markerEnd;
  const isDashed = arcType === "reset";

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
        <div
          className="arc-label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {weight}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
