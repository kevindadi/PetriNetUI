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
  onUndo: () => void;
  onRedo: () => void;
  onAddPlace: () => void;
  onAddTransition: () => void;
  onToggleArcMode: () => void;
  onArcType: (type: ArcType) => void;
  canDelete: boolean;
  onDelete: () => void;
  onClear: () => void;
  onNetKind: (kind: NetKind) => void;
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
  onUndo,
  onRedo,
  onAddPlace,
  onAddTransition,
  onToggleArcMode,
  onArcType,
  canDelete,
  onDelete,
  onClear,
  onNetKind,
  onLang,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button onClick={onUndo} disabled={!canUndo} title={t("undoTitle")}>
        {t("undo")}
      </button>
      <button onClick={onRedo} disabled={!canRedo} title={t("redoTitle")}>
        {t("redo")}
      </button>
      <button onClick={onAddPlace}>{t("addPlace")}</button>
      <button onClick={onAddTransition}>{t("addTransition")}</button>
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
      {arcMode && (
        <span className="arc-mode-hint">
          {pendingSource ? t("arcTargetHint") : t("arcSourceHint")}
        </span>
      )}
      <span className="spacer" />
      <button onClick={onDelete} disabled={!canDelete} title={t("deleteTitle")}>
        {t("delete")}
      </button>
      <button onClick={onClear}>{t("clear")}</button>
      <select
        className="lang-select"
        value={netKind}
        onChange={(e) => onNetKind(e.target.value as NetKind)}
        title={t("netType")}
      >
        <option value="pt">{t("netTypePt")}</option>
        <option value="timed">{t("netTypeTimed")}</option>
        <option value="cvn">{t("netTypeCvn")}</option>
      </select>
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
    </div>
  );
}
