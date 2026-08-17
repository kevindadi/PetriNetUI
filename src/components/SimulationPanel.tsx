import type { Translator } from "../i18n";
import type { SimState } from "../simulation";
import type { NetKind, PetriNode, PlaceData, TransitionData } from "../types";
import { formatTimeInterval } from "../types";

type SimulationPanelProps = {
  t: Translator;
  netKind: NetKind;
  nodes: PetriNode[];
  simulating: boolean;
  autoPlay: boolean;
  stepCount: number;
  simState: SimState;
  enabled: string[];
  waiting: string[];
  canAdvance: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onStart: () => void;
  onStep: () => void;
  onAdvanceTime: () => void;
  onToggleAuto: () => void;
  onReset: () => void;
  onStop: () => void;
  onFire: (id: string) => void;
  onAnalyze: () => void;
};

function labelOf(nodes: PetriNode[], id: string): string {
  const n = nodes.find((node) => node.id === id);
  return (n?.data as TransitionData | PlaceData | undefined)?.label ?? id;
}

export function SimulationPanel({
  t,
  netKind,
  nodes,
  simulating,
  autoPlay,
  stepCount,
  simState,
  enabled,
  waiting,
  canAdvance,
  collapsed,
  onToggleCollapsed,
  onStart,
  onStep,
  onAdvanceTime,
  onToggleAuto,
  onReset,
  onStop,
  onFire,
  onAnalyze,
}: SimulationPanelProps) {
  return (
    <div className="sim-panel">
      <div className="sim-header">
        <button
          className="sim-toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? t("simExpand") : t("simCollapse")}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <span className="sim-title">{t("tabSimulation")}</span>
        {simulating && (
          <span className="sim-badges">
            <span className="sim-badge">{t("simSteps", { count: stepCount })}</span>
            {netKind === "timed" && (
              <span className="sim-badge">{t("simTime", { time: simState.time })}</span>
            )}
          </span>
        )}
        <span className="spacer" />
        <span className="sim-controls">
          {!simulating ? (
            <button className="primary" onClick={onStart}>
              {t("simStart")}
            </button>
          ) : (
            <>
              <button onClick={onStep} disabled={enabled.length === 0 && !canAdvance}>
                {t("simStep")}
              </button>
              {netKind === "timed" && (
                <button onClick={onAdvanceTime} disabled={!canAdvance}>
                  {t("simAdvanceTime")}
                </button>
              )}
              <button onClick={onToggleAuto}>{autoPlay ? t("simPause") : t("simAuto")}</button>
              <button onClick={onReset}>{t("simReset")}</button>
              <button onClick={onStop}>{t("simStop")}</button>
            </>
          )}
          <button className="sim-analyze-btn" onClick={onAnalyze}>
            {t("simAnalyze")}
          </button>
        </span>
      </div>

      {!collapsed && (
        <div className="sim-body">
          <p className="hint">
            {netKind === "timed" ? t("simKindTimed") : netKind === "cvn" ? t("simKindCvn") : t("simKindPt")}
          </p>

          {simulating && (
            <div className="sim-status">
              <h3>{t("simMarking")}</h3>
              <div className="sim-marking">
                {nodes
                  .filter((n) => n.type === "place")
                  .map((p) => (
                    <div key={p.id} className="sim-marking-row">
                      <span>{(p.data as PlaceData).label}</span>
                      <span>{simState.marking[p.id] ?? 0}</span>
                    </div>
                  ))}
              </div>
              {netKind === "timed" && (
                <>
                  <h3>{t("simClocks")}</h3>
                  <div className="sim-marking">
                    {nodes
                      .filter((n) => n.type === "transition")
                      .map((tr) => {
                        const d = tr.data as TransitionData;
                        const interval = d.interval;
                        return (
                          <div key={tr.id} className="sim-marking-row">
                            <span>
                              {d.label}
                              {interval ? ` ${formatTimeInterval(interval)}` : ""}
                            </span>
                            <span>{simState.clocks[tr.id] ?? "—"}</span>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
              {netKind === "cvn" && Object.keys(simState.vars).length > 0 && (
                <>
                  <h3>{t("simVars")}</h3>
                  <div className="sim-marking">
                    {Object.entries(simState.vars)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, value]) => (
                        <div key={name} className="sim-marking-row">
                          <span>{name}</span>
                          <span>{value}</span>
                        </div>
                      ))}
                  </div>
                </>
              )}
              <h3>{t("simEnabled")}</h3>
              <div className="sim-enabled">
                {enabled.length === 0 ? (
                  <p className="hint">{t("simNoEnabled")}</p>
                ) : (
                  enabled.map((id) => (
                    <button key={id} onClick={() => onFire(id)}>
                      {labelOf(nodes, id)}
                    </button>
                  ))
                )}
              </div>
              {waiting.length > 0 && (
                <>
                  <h3>{t("simWaiting")}</h3>
                  <div className="sim-enabled">
                    {waiting.map((id) => (
                      <span key={id} className="sim-waiting-item">
                        {labelOf(nodes, id)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
