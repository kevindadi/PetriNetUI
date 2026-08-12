export type Language = "en" | "zh";

const en = {
  undo: "Undo",
  redo: "Redo",
  addPlace: "+ Place",
  addTransition: "+ Transition",
  addArc: "+ Arc",
  arcNormal: "Normal",
  arcReset: "Reset",
  arcInhibit: "Inhibit",
  select: "Select",
  snap: "Snap",
  clear: "Clear",
  open: "Open",
  save: "Save",
  undoTitle: "Undo (Ctrl/Cmd+Z)",
  redoTitle: "Redo (Ctrl/Cmd+Shift+Z)",
  selectTitle: "Box selection mode (left-drag to select, middle/right-drag to pan)",
  snapTitle: "Snap to grid",
  arcSourceHint: "Click a source node",
  arcTargetHint: "Click target node to create arc",
  tabChat: "AI Chat",
  tabProps: "Properties",
  chatHint:
    'Describe the Petri net you want to build, e.g. "a producer-consumer system with two places and one transition".',
  chatPlaceholder: "Describe a Petri net...",
  send: "Send",
  generating: "Generating...",
  aiNetResult: "Net: {places} places, {transitions} transitions, {arcs} arcs.",
  generationFailed: "Generation failed: {error}",
  name: "Name",
  tokens: "Tokens",
  weight: "Weight",
  type: "Type",
  propsHint:
    "Click a place, transition or arc to edit it. Drag from a node's edge to another node to create an arc. Press Delete to remove.",
  netType: "Net type",
  netTypePt: "P/T",
  netTypeTimed: "Timed",
  netTypeCvn: "CVN",
  capacity: "Capacity",
  capacityMode: "Capacity mode",
  capacityReject: "Reject",
  capacitySaturate: "Saturate",
  priority: "Priority",
  unbounded: "Unbounded",
  tabSimulation: "Simulation",
  simStart: "Start",
  simStep: "Step",
  simAuto: "Auto Play",
  simPause: "Pause",
  simReset: "Reset",
  simStop: "Stop",
  simMarking: "Current marking",
  simEnabled: "Enabled transitions",
  simNoEnabled: "No enabled transitions (deadlock)",
  simAnalyze: "Analyze",
  simStates: "Reachable states: {count}",
  simBounded: "Bounded",
  simUnbounded: "State space exceeded limit (possibly unbounded)",
  simDeadlocks: "Deadlock states: {count}",
  simMaxTokens: "Max tokens",
  simSteps: "Steps: {count}",
} as const;

export type TranslationKey = keyof typeof en;

const zh: Record<TranslationKey, string> = {
  undo: "撤销",
  redo: "重做",
  addPlace: "+ 库所",
  addTransition: "+ 变迁",
  addArc: "+ 弧",
  arcNormal: "普通",
  arcReset: "重置",
  arcInhibit: "禁止",
  select: "框选",
  snap: "吸附",
  clear: "清空",
  open: "打开",
  save: "保存",
  undoTitle: "撤销 (Ctrl/Cmd+Z)",
  redoTitle: "重做 (Ctrl/Cmd+Shift+Z)",
  selectTitle: "框选模式（左键拖拽框选，中键/右键平移）",
  snapTitle: "网格吸附",
  arcSourceHint: "点击起点节点",
  arcTargetHint: "点击目标节点以创建弧",
  tabChat: "AI 对话",
  tabProps: "属性",
  chatHint: "描述你想建立的 Petri 网，例如：“一个生产者-消费者系统，包含两个库所和一个变迁”。",
  chatPlaceholder: "描述 Petri 网…",
  send: "发送",
  generating: "正在生成…",
  aiNetResult: "网：{places} 个库所、{transitions} 个变迁、{arcs} 条弧。",
  generationFailed: "生成失败：{error}",
  name: "名称",
  tokens: "Token 数",
  weight: "权重",
  type: "类型",
  propsHint: "点击库所、变迁或弧进行编辑。从节点边缘拖拽到另一节点创建弧。按 Delete 删除。",
  netType: "网类型",
  netTypePt: "P/T",
  netTypeTimed: "时间网",
  netTypeCvn: "着色验证网",
  capacity: "容量",
  capacityMode: "容量模式",
  capacityReject: "拒绝",
  capacitySaturate: "饱和",
  priority: "优先级",
  unbounded: "无限",
  tabSimulation: "仿真",
  simStart: "开始",
  simStep: "单步",
  simAuto: "自动运行",
  simPause: "暂停",
  simReset: "重置",
  simStop: "停止",
  simMarking: "当前标记",
  simEnabled: "使能的变迁",
  simNoEnabled: "无使能变迁（死锁）",
  simAnalyze: "分析",
  simStates: "可达状态数：{count}",
  simBounded: "有界",
  simUnbounded: "状态空间超限（可能无界）",
  simDeadlocks: "死锁状态数：{count}",
  simMaxTokens: "最大 token 数",
  simSteps: "步数：{count}",
};

const translations: Record<Language, Record<TranslationKey, string>> = { en, zh };

export const languages: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

export type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function makeTranslator(lang: Language): Translator {
  const dict = translations[lang] ?? translations.en;
  return (key, params) => {
    let s: string = dict[key] ?? translations.en[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.split(`{${k}}`).join(String(v));
      }
    }
    return s;
  };
}
