import { languages, type Language, type Translator } from "../i18n";
import type { ArcType, NetKind } from "../types";

type ToolbarProps = {
  t: Translator;
  canUndo: boolean;
  canRedo: boolean;
  arcMode: boolean;
  arcType: ArcType;
  pendingSource: string | null;
  netKind: NetKind;
  lang: Language;
  chatOpen: boolean;
  simOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddPlace: () => void;
  onAddTransition: () => void;
  onToggleArcMode: () => void;
  onArcType: (type: ArcType) => void;
  canDelete: boolean;
  onDelete: () => void;
  onClear: () => void;
  onChooseNetKind: () => void;
  onToggleChat: () => void;
  onToggleSim: () => void;
  onLang: (lang: Language) => void;
};

export function Toolbar({
  t,
  canUndo,
  canRedo,
  arcMode,
  arcType,
  pendingSource,
  netKind,
  lang,
  chatOpen,
  simOpen,
  onUndo,
  onRedo,
  onAddPlace,
  onAddTransition,
  onToggleArcMode,
  onArcType,
  canDelete,
  onDelete,
  onClear,
  onChooseNetKind,
  onToggleChat,
  onToggleSim,
  onLang,
}: ToolbarProps) {
  const kindLabel =
    netKind === "pt" ? t("netTypePt") : netKind === "timed" ? t("netTypeTimed") : t("netTypeCvn");

  return (
    <div className="toolbar">
      <span className="tb-group">
        <button onClick={onUndo} disabled={!canUndo} title={t("undoTitle")}>
          {t("undo")}
        </button>
        <button onClick={onRedo} disabled={!canRedo} title={t("redoTitle")}>
          {t("redo")}
        </button>
      </span>
      <span className="tb-sep" />
      <span className="tb-group">
        <button onClick={onAddPlace}>{t("addPlace")}</button>
        <button onClick={onAddTransition}>{t("addTransition")}</button>
      </span>
      <span className="tb-sep" />
      <span className="tb-group">
        <button className={arcMode ? "active" : ""} onClick={onToggleArcMode}>
          {t("addArc")}
        </button>
        <span className="arc-types">
          <button
            className={arcType === "normal" ? "active" : ""}
            onClick={() => onArcType("normal")}
          >
            {t("arcNormal")}
          </button>
          <button
            className={arcType === "reset" ? "active" : ""}
            onClick={() => onArcType("reset")}
          >
            {t("arcReset")}
          </button>
          <button
            className={arcType === "inhibitor" ? "active" : ""}
            onClick={() => onArcType("inhibitor")}
          >
            {t("arcInhibit")}
          </button>
        </span>
      </span>
      {arcMode && (
        <span className="arc-mode-hint">
          {pendingSource ? t("arcTargetHint") : t("arcSourceHint")}
        </span>
      )}
      <span className="spacer" />
      <span className="tb-group">
        <button
          className={chatOpen ? "active" : ""}
          onClick={onToggleChat}
          title={t("menuShowChat")}
        >
          {t("chatOpen")}
        </button>
        <button className={simOpen ? "active" : ""} onClick={onToggleSim} title={t("menuShowSim")}>
          {t("simToggle")}
        </button>
      </span>
      <span className="tb-sep" />
      <span className="tb-group">
        <button onClick={onDelete} disabled={!canDelete} title={t("deleteTitle")}>
          {t("delete")}
        </button>
        <button onClick={onClear}>{t("clear")}</button>
      </span>
      <span className="tb-sep" />
      <span className="tb-group">
        <button className="kind-button" onClick={onChooseNetKind} title={t("netType")}>
          {t("kindButton", { kind: kindLabel })}
        </button>
        <select
          className="lang-select"
          value={lang}
          onChange={(e) => onLang(e.target.value as Language)}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
