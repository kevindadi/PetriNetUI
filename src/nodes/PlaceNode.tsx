import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { PlaceData } from "../types";

export function PlaceNode({ data, selected }: NodeProps<Node<PlaceData, "place">>) {
  return (
    <div className={`petri-node place-node${selected ? " selected" : ""}`}>
      <div className="place-circle">
        {data.tokens > 0 && <span className="place-tokens">{data.tokens}</span>}
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          className="petri-handle"
        />
        <Handle
          type="source"
          id="out"
          position={Position.Right}
          className="petri-handle"
        />
      </div>
      <div className="node-label">{data.label}</div>
    </div>
  );
}
