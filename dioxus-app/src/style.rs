pub const CSS: &str = r#"
* { box-sizing: border-box; }
:root { font-family: Inter, Avenir, Helvetica, Arial, sans-serif; font-size: 15px; color: #1f2937; }
html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }

.app { display: flex; flex-direction: column; height: 100vh; width: 100vw; background: #f3f4f6; }

/* ── Menubar ── */
.menubar {
  display: flex; align-items: center; background: #f9fafb;
  border-bottom: 1px solid #e5e7eb; padding: 2px 8px; user-select: none; flex-shrink: 0;
}
.menubar .menu { padding: 5px 10px; font-size: 0.9em; cursor: pointer; border-radius: 6px; }
.menubar .menu:hover { background: #e5e7eb; }
.menu-spacer { flex: 1; }
.menubar select { font-size: 0.85em; padding: 3px 6px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.menu-title { padding: 5px 10px; font-size: 0.9em; cursor: pointer; border-radius: 6px; }
.menu-title:hover, .menu-title.active { background: #e5e7eb; }
.menu-dropdown {
  position: absolute; top: 26px; left: 8px; z-index: 300; min-width: 220px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.15); padding: 4px; display: flex; flex-direction: column;
}
.menu-item {
  text-align: left; border: none; background: transparent; padding: 6px 10px;
  font-size: 0.88em; cursor: pointer; border-radius: 6px;
  display: flex; align-items: center; gap: 8px;
}
.menu-item:hover:not(:disabled) { background: #eef2ff; }
.menu-item:disabled { opacity: 0.4; cursor: default; }
.menu-check { color: #2563eb; font-weight: 700; width: 14px; }
.menu-sep { height: 1px; background: #e5e7eb; margin: 4px 8px; }

/* ── Toolbar ── */
.toolbar {
  display: flex; align-items: center; gap: 8px; background: #fff;
  border-bottom: 1px solid #e5e7eb; padding: 6px 10px; flex-shrink: 0; flex-wrap: wrap;
}
.tb-group { display: flex; align-items: center; gap: 4px; padding-right: 8px; border-right: 1px solid #e5e7eb; }
.tb-group:last-child { border-right: none; }
.toolbar button {
  border: 1px solid #d1d5db; background: #f9fafb; color: #1f2937;
  padding: 5px 10px; border-radius: 6px; font-size: 0.85em; cursor: pointer;
}
.toolbar button:hover:not(:disabled) { background: #eef2ff; }
.toolbar button.active { background: #dbeafe; border-color: #3b82f6; color: #1d4ed8; }
.toolbar button:disabled { opacity: 0.4; cursor: default; }

/* ── Workspace ── */
.workspace { display: flex; flex: 1; min-height: 0; }
.canvas { position: relative; flex: 1; background: #fbfcfe; }
.canvas-svg { width: 100%; height: 100%; display: block; touch-action: none; }
.inspector {
  width: 280px; background: #fff; border-left: 1px solid #e5e7eb;
  overflow-y: auto; flex-shrink: 0; padding: 12px;
}

.panel { display: flex; flex-direction: column; gap: 10px; }
.panel h3 { margin: 0 0 4px; font-size: 1.05em; color: #111827; }
.prop-row { display: flex; align-items: center; gap: 8px; }
.prop-label { width: 90px; color: #4b5563; font-size: 0.85em; flex-shrink: 0; }
.prop-input {
  flex: 1; min-width: 0; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 5px 8px; font-size: 0.9em; background: #fff; color: #111827;
}
.prop-input:focus { outline: 2px solid #93c5fd; border-color: #3b82f6; }

button.small { font-size: 0.78em; padding: 2px 8px; border: 1px solid #d1d5db; background: #f9fafb; border-radius: 6px; cursor: pointer; }
button.small:hover { background: #eef2ff; }

/* ── Overview ── */
.ov-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.9em; }
.ov-counts { font-size: 0.9em; color: #4b5563; }
.ov-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.ov-actions button { border: 1px solid #d1d5db; background: #f9fafb; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em; }
.ov-actions button:hover { background: #eef2ff; }
.ov-tip { font-size: 0.8em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }

/* ── Chat ── */
.chat-panel {
  position: absolute; top: 12px; right: 12px; width: 340px; max-height: 70%;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14); display: flex; flex-direction: column; z-index: 50;
}
.chat-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 120px; }
.chat-msg { padding: 7px 10px; border-radius: 8px; font-size: 0.88em; white-space: pre-wrap; word-break: break-word; max-width: 90%; }
.chat-msg.user { align-self: flex-end; background: #dbeafe; }
.chat-msg.assistant { align-self: flex-start; background: #f3f4f6; }
.chat-input-row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #e5e7eb; }
.chat-input { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
.chat-input-row button { border: 1px solid #3b82f6; background: #3b82f6; color: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.chat-input-row button:disabled { opacity: 0.5; }

/* ── Simulation panel ── */
.sim-panel {
  position: absolute; left: 12px; bottom: 40px; width: 360px; max-height: 55%;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.14); display: flex; flex-direction: column; z-index: 50;
}
.sim-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
.sim-body { overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.sim-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.sim-actions button { border: 1px solid #d1d5db; background: #f9fafb; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85em; }
.sim-actions button:hover { background: #eef2ff; }
.sim-info { font-size: 0.85em; color: #4b5563; }
.sim-section-title { font-size: 0.85em; font-weight: 600; color: #374151; margin: 4px 0; }
.marking-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.marking-cell { background: #f3f4f6; border-radius: 6px; padding: 2px 8px; font-size: 0.82em; font-family: ui-monospace, monospace; }
.trans-btn.enabled { background: #dcfce7; border: 1px solid #16a34a; color: #15803d; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.85em; margin: 2px; }
.sim-deadlock { color: #dc2626; font-size: 0.85em; }
.waiting-chip { background: #fef9c3; border-radius: 6px; padding: 2px 8px; font-size: 0.82em; margin: 2px; }
.sim-hint { font-size: 0.78em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }

/* ── Legend ── */
.canvas-legend {
  position: absolute; top: 12px; left: 12px; background: #fff; border: 1px solid #e5e7eb;
  border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; z-index: 5;
  font-size: 0.78em; color: #374151; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-line { display: inline-block; width: 24px; height: 0; border-top: 2px solid #1f2937; }
.legend-line.reset { border-top-style: dashed; }
.legend-line.inhibit { border-top: 2px solid transparent; position: relative; }
.legend-line.inhibit::after { content: ""; position: absolute; left: 8px; top: -6px; width: 8px; height: 8px; border: 2px solid #1f2937; border-radius: 50%; }

/* ── Status bar ── */
.statusbar {
  display: flex; align-items: center; justify-content: space-between;
  background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 3px 10px;
  font-size: 0.78em; color: #4b5563; flex-shrink: 0;
}
.status-right { display: flex; gap: 12px; align-items: center; }
.status-chip { background: #e0e7ff; color: #3730a3; padding: 1px 8px; border-radius: 999px; font-weight: 600; }

/* ── Modals ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(17, 24, 39, 0.45); display: flex;
  align-items: center; justify-content: center; z-index: 200;
}
.modal { background: #fff; border-radius: 12px; padding: 18px; min-width: 420px; max-width: 90vw; box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
.modal h3 { margin: 0 0 12px; }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.modal-actions button { border: 1px solid #d1d5db; background: #f9fafb; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.nk-options { display: flex; flex-direction: column; gap: 8px; }
.nk-option { text-align: left; border: 1px solid #e5e7eb; background: #f9fafb; padding: 10px 12px; border-radius: 8px; cursor: pointer; }
.nk-option:hover { background: #eef2ff; border-color: #93c5fd; }
.nk-option b { display: block; margin-bottom: 4px; }
.nk-desc { font-size: 0.82em; color: #4b5563; }
.sc-row { padding: 6px 4px; border-bottom: 1px solid #f3f4f6; font-size: 0.9em; }

/* ── Analysis ── */
.analysis-overlay {
  position: fixed; inset: 0; background: #f3f4f6; z-index: 150; overflow-y: auto;
}
.analysis-view { max-width: 1100px; margin: 0 auto; padding: 16px; }
.analysis-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.analysis-header h2 { margin: 0; }
.analysis-header button { border: 1px solid #d1d5db; background: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
.analysis-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.as-row { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 12px; font-size: 0.85em; }
.analysis-graph-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
.analysis-graph { display: block; margin: 0 auto; }
.analysis-state-info { margin-top: 8px; font-size: 0.9em; font-weight: 600; }
.analysis-marking { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }

.ticker { color: #16a34a; font-weight: 700; }
"#;