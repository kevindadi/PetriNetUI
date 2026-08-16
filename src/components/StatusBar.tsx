import type { Translator } from "../i18n";
import type { NetKind } from "../types";

type StatusBarProps = {
  t: Translator;
  netKind: NetKind;
  places: number;
  transitions: number;
  arcs: number;
  arcMode: boolean;
  pendingSource: boolean;
  selectMode: boolean;
  snapEnabled: boolean;
};

export function StatusBar({
  t,
  netKind,
  places,
  transitions,
  arcs,
  arcMode,
  pendingSource,
  selectMode,
  snapEnabled,
}: StatusBarProps) {
  let hint = t("statusDefault");
  if (arcMode && pendingSource) hint = t("arcTargetHint");
  else if (arcMode) hint = t("arcSourceHint");
  else if (selectMode) hint = t("statusSelectMode");
  else if (snapEnabled) hint = t("statusSnapOn");

  const kindLabel =
    netKind === "pt" ? t("netTypePt") : netKind === "timed" ? t("netTypeTimed") : t("netTypeCvn");

  return (
    <footer className="statusbar">
      <span className="status-hint">{hint}</span>
      <span className="spacer" />
      <span className="status-stats">
        <span className="status-kind">{kindLabel}</span>
        <span>{t("statusPlaces", { count: places })}</span>
        <span>{t("statusTransitions", { count: transitions })}</span>
        <span>{t("statusArcs", { count: arcs })}</span>
      </span>
    </footer>
  );
}
