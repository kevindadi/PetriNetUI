import type { Translator } from "../i18n";
import type { NetKind } from "../types";
import { ArcSample } from "./ArcSample";

type NetOverviewProps = {
  t: Translator;
  netKind: NetKind;
  places: number;
  transitions: number;
  arcs: number;
  onAddPlace: () => void;
  onAddTransition: () => void;
  onChangeKind: () => void;
  onStartSim: () => void;
  onAnalyze: () => void;
};

export function NetOverview({
  t,
  netKind,
  places,
  transitions,
  arcs,
  onAddPlace,
  onAddTransition,
  onChangeKind,
  onStartSim,
  onAnalyze,
}: NetOverviewProps) {
  const kindLabel =
    netKind === "pt" ? t("netTypePt") : netKind === "timed" ? t("netTypeTimed") : t("netTypeCvn");
  const kindDesc =
    netKind === "pt"
      ? t("netKindDescPt")
      : netKind === "timed"
        ? t("netKindDescTimed")
        : t("netKindDescCvn");

  return (
    <div className="props-panel overview">
      <h2>{t("overviewTitle")}</h2>

      <section className="ov-section">
        <h3>{t("overviewKindLabel")}</h3>
        <div className="ov-kind">
          <div>
            <span className="ov-kind-name">{kindLabel}</span>
            <p className="ov-kind-desc">{kindDesc}</p>
          </div>
          <button className="ov-change" onClick={onChangeKind}>
            {t("overviewChange")}
          </button>
        </div>
      </section>

      <section className="ov-section">
        <p className="ov-counts">{t("overviewCounts", { places, transitions, arcs })}</p>
      </section>

      <section className="ov-section">
        <h3>{t("overviewLegend")}</h3>
        <ul className="ov-legend">
          <li>
            <ArcSample type="normal" />
            <span>
              {t("arcNormal")} — {t("legendNormal")}
            </span>
          </li>
          <li>
            <ArcSample type="reset" />
            <span>
              {t("arcReset")} — {t("legendReset")}
            </span>
          </li>
          <li>
            <ArcSample type="inhibitor" />
            <span>
              {t("arcInhibit")} — {t("legendInhibitor")}
            </span>
          </li>
        </ul>
      </section>

      <section className="ov-section">
        <h3>{t("overviewActions")}</h3>
        <div className="ov-actions">
          <button onClick={onAddPlace}>{t("addPlace")}</button>
          <button onClick={onAddTransition}>{t("addTransition")}</button>
          <button className="primary" onClick={onStartSim}>
            {t("simStart")}
          </button>
          <button onClick={onAnalyze}>{t("simAnalyze")}</button>
        </div>
      </section>

      <p className="hint">{t("overviewTip")}</p>
    </div>
  );
}
