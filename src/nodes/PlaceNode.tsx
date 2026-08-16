import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { PlaceData } from "../types";

export function PlaceNode({ data, selected }: NodeProps<Node<PlaceData, "place">>) {
  const resource = data.cvnPlace?.class === "resource";
  const meta = data.cvnPlace
    ? data.cvnPlace.class === "control"
      ? data.cvnPlace.sub
      : data.cvnPlace.resource
    : data.capacity != null
      ? `cap ${data.capacity}`
      : null;

  return (
    <div
      className={`petri-node place-node${selected ? " selected" : ""}${resource ? " resource-place" : ""}`}
    >
      <div className="place-circle">
        {data.tokens > 0 && <span className="place-tokens">{data.tokens}</span>}
        <Handle type="target" id="in" position={Position.Left} className="petri-handle" />
        <Handle type="source" id="out" position={Position.Right} className="petri-handle" />
      </div>
      <div className="node-label">
        {data.label}
        {meta && <div className="node-meta">{meta}</div>}
      </div>
    </div>
  );
}
