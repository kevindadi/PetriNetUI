import type { Translator } from "../i18n";
import type { ChatMessage, NetKind } from "../types";

type ChatPanelProps = {
  t: Translator;
  netKind: NetKind;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
};

export function ChatPanel({
  t,
  netKind,
  messages,
  input,
  loading,
  onInput,
  onSend,
}: ChatPanelProps) {
  const hint =
    netKind === "timed" ? t("chatHintTimed") : netKind === "cvn" ? t("chatHintCvn") : t("chatHint");

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && <p className="hint">{hint}</p>}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {loading && <div className="chat-msg assistant">{t("generating")}</div>}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder={t("chatPlaceholder")}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button onClick={onSend} disabled={loading || !input.trim()}>
          {t("send")}
        </button>
      </div>
    </div>
  );
}
