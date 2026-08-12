import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { TransitionData } from "../types";

export function TransitionNode({ data, selected }: NodeProps<Node<TransitionData, "transition">>) {
  return (
    <div className={`petri-node transition-node${selected ? " selected" : ""}`}>
      <div className="transition-box">
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
