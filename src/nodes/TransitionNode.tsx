import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { formatTimeInterval, type TransitionData } from "../types";

export function TransitionNode({ data, selected }: NodeProps<Node<TransitionData, "transition">>) {
  const meta = data.interval
    ? formatTimeInterval(data.interval)
    : data.cvnKind && data.cvnKind !== "Sequential"
      ? data.cvnKind
      : data.priority != null
        ? `prio ${data.priority}`
        : null;

  return (
    <div className={`petri-node transition-node${selected ? " selected" : ""}`}>
      <div className="transition-box">
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
