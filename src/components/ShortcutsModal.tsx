import type { Translator } from "../i18n";

export function ShortcutsModal({
  t,
  onClose,
}: {
  t: Translator;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("shortcutsTitle")}</h2>
        <ul>
          <li>{t("shortcutUndo")}</li>
          <li>{t("shortcutRedo")}</li>
          <li>{t("shortcutCopy")}</li>
          <li>{t("shortcutPaste")}</li>
          <li>{t("shortcutDelete")}</li>
          <li>{t("shortcutSend")}</li>
        </ul>
        <button className="modal-close" onClick={onClose}>
          {t("shortcutsClose")}
        </button>
      </div>
    </div>
  );
}
