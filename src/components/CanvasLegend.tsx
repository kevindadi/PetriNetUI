import { useState } from "react";
import type { Translator } from "../i18n";
import { ArcSample } from "./ArcSample";

export function CanvasLegend({ t }: { t: Translator }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="canvas-legend">
      <button className="legend-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="legend-caret">{open ? "▾" : "▸"}</span>
        {t("overviewLegend")}
      </button>
      {open && (
        <ul className="legend-items">
          <li>
            <ArcSample type="normal" />
            <span>{t("arcNormal")}</span>
          </li>
          <li>
            <ArcSample type="reset" />
            <span>{t("arcReset")}</span>
          </li>
          <li>
            <ArcSample type="inhibitor" />
            <span>{t("arcInhibit")}</span>
          </li>
          <li className="legend-swatch-row">
            <span className="legend-swatch enabled" />
            <span>{t("legendEnabled")}</span>
          </li>
          <li className="legend-swatch-row">
            <span className="legend-swatch waiting" />
            <span>{t("legendWaiting")}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
