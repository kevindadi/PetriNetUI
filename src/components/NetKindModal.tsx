import type { Translator, TranslationKey } from "../i18n";
import type { NetKind } from "../types";

type NetKindModalProps = {
  t: Translator;
  current: NetKind;
  onSelect: (kind: NetKind) => void;
  onClose: () => void;
};

const NET_KINDS: { kind: NetKind; labelKey: TranslationKey; descKey: TranslationKey }[] = [
  { kind: "pt", labelKey: "netTypePt", descKey: "netKindDescPt" },
  { kind: "timed", labelKey: "netTypeTimed", descKey: "netKindDescTimed" },
  { kind: "cvn", labelKey: "netTypeCvn", descKey: "netKindDescCvn" },
];

export function NetKindModal({ t, current, onSelect, onClose }: NetKindModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal netkind-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("netKindModalTitle")}</h2>
        <div className="netkind-list">
          {NET_KINDS.map(({ kind, labelKey, descKey }) => (
            <button
              key={kind}
              className={`netkind-card${current === kind ? " active" : ""}`}
              onClick={() => onSelect(kind)}
            >
              <span className="netkind-name">{t(labelKey)}</span>
              {current === kind && <span className="netkind-check">✓</span>}
              <span className="netkind-desc">{t(descKey)}</span>
            </button>
          ))}
        </div>
        <button className="modal-close" onClick={onClose}>
          {t("shortcutsClose")}
        </button>
      </div>
    </div>
  );
}
