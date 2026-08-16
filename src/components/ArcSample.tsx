export function ArcSample({ type }: { type: "normal" | "reset" | "inhibitor" }) {
  return (
    <svg className="ov-arc-sample" width="46" height="14" viewBox="0 0 46 14" aria-hidden>
      <line
        x1="2"
        y1="7"
        x2="33"
        y2="7"
        stroke="#1f2937"
        strokeWidth="2"
        strokeDasharray={type === "reset" ? "4 3" : undefined}
      />
      {type === "inhibitor" ? (
        <circle cx="37" cy="7" r="4" fill="#fff" stroke="#1f2937" strokeWidth="1.5" />
      ) : (
        <path d="M33,7 L29,4 L29,10 Z" fill="#1f2937" />
      )}
    </svg>
  );
}
