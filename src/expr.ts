export type VarStore = Record<string, number>;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GUARD_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=|<=|>=|<|>)\s*(-?\d+)$/;
const UPDATE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;
const BIN_RE =
  /^([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*([+\-*/])\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)$/;
const IDENT_GLOBAL = /[A-Za-z_][A-Za-z0-9_]*/g;
const KEYWORDS = new Set(["true", "false", "True", "False"]);

function readValue(token: string, vars: VarStore): number {
  if (IDENT.test(token)) return vars[token] ?? 0;
  const n = Number(token);
  return Number.isFinite(n) ? n : 0;
}

export function evalGuard(expr: string, vars: VarStore): boolean {
  const s = expr.trim();
  if (!s || s === "true" || s === "True") return true;
  if (s === "false" || s === "False") return false;
  const m = s.match(GUARD_RE);
  if (!m) return false;
  const left = vars[m[1]] ?? 0;
  const right = Number(m[3]);
  switch (m[2]) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return false;
  }
}

export function applyUpdate(expr: string, vars: VarStore): VarStore {
  const s = expr.trim();
  const m = s.match(UPDATE_RE);
  if (!m) return vars;
  const name = m[1];
  const rhs = m[2].trim();
  const bin = rhs.match(BIN_RE);
  let value: number;
  if (bin) {
    const a = readValue(bin[1], vars);
    const b = readValue(bin[3], vars);
    switch (bin[2]) {
      case "+":
        value = a + b;
        break;
      case "-":
        value = a - b;
        break;
      case "*":
        value = a * b;
        break;
      case "/":
        value = b === 0 ? 0 : Math.trunc(a / b);
        break;
      default:
        return vars;
    }
  } else {
    value = readValue(rhs, vars);
  }
  return { ...vars, [name]: value };
}

export function collectVars(texts: string[]): VarStore {
  const vars: VarStore = {};
  for (const text of texts) {
    const matches = text.match(IDENT_GLOBAL) ?? [];
    for (const name of matches) {
      if (!KEYWORDS.has(name)) vars[name] = vars[name] ?? 0;
    }
  }
  return vars;
}
