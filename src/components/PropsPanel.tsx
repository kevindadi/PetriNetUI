import type { Node } from "@xyflow/react";
import type { Translator } from "../i18n";
import {
  CONTROL_SUBS,
  RESOURCE_TYPES,
  TRANSITION_KINDS,
  defaultInterval,
  type ArcType,
  type CapacityMode,
  type ControlSub,
  type CvnArcKind,
  type CvnPlace,
  type NetKind,
  type PetriEdge,
  type PetriNode,
  type PlaceData,
  type ResourceType,
  type TimeInterval,
  type TransitionData,
  type TransitionKind,
} from "../types";

type PropsPanelProps = {
  t: Translator;
  netKind: NetKind;
  selectedNode?: PetriNode;
  selectedEdge?: PetriEdge;
  onCommit: () => void;
  onUpdateNode: (id: string, patch: Partial<PlaceData | TransitionData>) => void;
  onUpdateEdgeWeight: (id: string, weight: number) => void;
  onUpdateEdgeType: (id: string, arcType: ArcType) => void;
  onUpdateEdgeCvn: (id: string, cvnArc: CvnArcKind) => void;
};

export function PropsPanel({
  t,
  netKind,
  selectedNode,
  selectedEdge,
  onCommit,
  onUpdateNode,
  onUpdateEdgeWeight,
  onUpdateEdgeType,
  onUpdateEdgeCvn,
}: PropsPanelProps) {
  const placeNode =
    selectedNode?.type === "place" ? (selectedNode as Node<PlaceData, "place">) : undefined;
  const transitionNode =
    selectedNode?.type === "transition"
      ? (selectedNode as Node<TransitionData, "transition">)
      : undefined;
  const placeCvn: CvnPlace = placeNode?.data.cvnPlace ?? { class: "control", sub: "Statement" };
  const transInterval: TimeInterval = transitionNode?.data.interval ?? defaultInterval();
  const edgeCvn: CvnArcKind = selectedEdge?.data?.cvnArc ?? { type: "plain" };

  return (
    <div className="props-panel">
      <h2>{t("tabProps")}</h2>
      {!selectedNode && !selectedEdge && <p className="hint">{t("propsHint")}</p>}
      {placeNode && (
        <form className="props" onSubmit={(e) => e.preventDefault()}>
          <label>
            {t("name")}
            <input
              value={placeNode.data.label}
              onFocus={onCommit}
              onChange={(e) => onUpdateNode(placeNode.id, { label: e.target.value })}
            />
          </label>
          <label>
            {t("tokens")}
            <input
              type="number"
              min={0}
              value={placeNode.data.tokens}
              onFocus={onCommit}
              onChange={(e) =>
                onUpdateNode(placeNode.id, { tokens: Math.max(0, Number(e.target.value)) })
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
                onFocus={onCommit}
                onChange={(e) =>
                  onUpdateNode(placeNode.id, {
                    capacity: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
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
                onFocus={onCommit}
                onChange={(e) =>
                  onUpdateNode(placeNode.id, {
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
                onFocus={onCommit}
                onChange={(e) => onUpdateNode(placeNode.id, { saturate: e.target.checked })}
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
                  onFocus={onCommit}
                  onChange={(e) => {
                    const cls = e.target.value as "control" | "resource";
                    onUpdateNode(placeNode.id, {
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
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateNode(placeNode.id, {
                        cvnPlace: { class: "control", sub: e.target.value as ControlSub },
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
                      onFocus={onCommit}
                      onChange={(e) =>
                        onUpdateNode(placeNode.id, {
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
                  {(placeCvn.resource === "RwLock" || placeCvn.resource === "Semaphore") && (
                    <label>
                      {t("resourceParam")}
                      <input
                        type="number"
                        min={1}
                        value={placeCvn.param ?? 1}
                        onFocus={onCommit}
                        onChange={(e) =>
                          onUpdateNode(placeNode.id, {
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
              onFocus={onCommit}
              onChange={(e) => onUpdateNode(transitionNode.id, { label: e.target.value })}
            />
          </label>
          {(netKind === "pt" || netKind === "timed") && (
            <label>
              {t("priority")}
              <input
                type="number"
                value={transitionNode.data.priority ?? ""}
                placeholder="—"
                onFocus={onCommit}
                onChange={(e) =>
                  onUpdateNode(transitionNode.id, {
                    priority: e.target.value === "" ? null : Number(e.target.value),
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
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateNode(transitionNode.id, {
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
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateNode(transitionNode.id, {
                        interval: {
                          ...transInterval,
                          latest: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={transInterval.leftOpen}
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateNode(transitionNode.id, {
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
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateNode(transitionNode.id, {
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
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, { core: Number(e.target.value) })
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={transitionNode.data.suspendable ?? false}
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, { suspendable: e.target.checked })
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
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, {
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
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, {
                      scope: e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {t("family")}
                <input
                  value={transitionNode.data.family ?? ""}
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, {
                      family: e.target.value === "" ? null : e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {t("anchors")}
                <input
                  value={transitionNode.data.anchors ?? ""}
                  onFocus={onCommit}
                  onChange={(e) =>
                    onUpdateNode(transitionNode.id, { anchors: e.target.value })
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
              onFocus={onCommit}
              onChange={(e) =>
                onUpdateEdgeWeight(selectedEdge.id, Math.max(1, Number(e.target.value)))
              }
            />
          </label>
          <label>
            {t("type")}
            <select
              value={selectedEdge.data?.arcType ?? "normal"}
              onFocus={onCommit}
              onChange={(e) => onUpdateEdgeType(selectedEdge.id, e.target.value as ArcType)}
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
                  onFocus={onCommit}
                  onChange={(e) => {
                    const ty = e.target.value as "plain" | "guard" | "update";
                    onUpdateEdgeCvn(
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
                    placeholder="x >= 1"
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateEdgeCvn(selectedEdge.id, { type: "guard", guard: e.target.value })
                    }
                  />
                </label>
              )}
              {edgeCvn.type === "update" && (
                <label>
                  {t("update")}
                  <input
                    value={edgeCvn.update}
                    placeholder="x = x + 1"
                    onFocus={onCommit}
                    onChange={(e) =>
                      onUpdateEdgeCvn(selectedEdge.id, { type: "update", update: e.target.value })
                    }
                  />
                </label>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}
