import type {
  NetPosition,
  SemanticNet,
} from "./model";
import type {
  CapacityMode,
  ControlSub,
  CvnArcKind,
  NetKind,
  PlaceData,
  ResourceType,
  TimeInterval,
  TransitionData,
} from "./types";
import { defaultInterval } from "./types";

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function graphicsTag(id: string, positions: Record<string, NetPosition>): string {
  const pos = positions[id];
  return pos ? `<graphics x="${pos.x}" y="${pos.y}"/>` : "";
}

export function serializeXml(
  sem: SemanticNet,
  positions: Record<string, NetPosition>,
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<petrinet kind="${sem.netKind}">`,
  ];

  for (const p of sem.places) {
    const d = p.data;
    let attrs = `id="${esc(p.id)}" label="${esc(d.label)}" tokens="${d.tokens}"`;
    if (d.capacity != null) attrs += ` capacity="${d.capacity}"`;
    if (d.capacityMode) attrs += ` capacityMode="${d.capacityMode}"`;
    if (d.saturate) attrs += ` saturate="true"`;
    if (d.cvnPlace) {
      if (d.cvnPlace.class === "control") {
        attrs += ` cvnClass="control" cvnSub="${d.cvnPlace.sub}"`;
      } else {
        attrs += ` cvnClass="resource" cvnResource="${d.cvnPlace.resource}"`;
        if (d.cvnPlace.param != null) attrs += ` cvnParam="${d.cvnPlace.param}"`;
      }
    }
    lines.push(`  <place ${attrs}>${graphicsTag(p.id, positions)}</place>`);
  }

  for (const t of sem.transitions) {
    const d = t.data;
    let attrs = `id="${esc(t.id)}" label="${esc(d.label)}"`;
    if (d.priority != null) attrs += ` priority="${d.priority}"`;
    if (d.interval) {
      attrs += ` intervalEarliest="${d.interval.earliest}"`;
      attrs += ` intervalLatest="${d.interval.latest ?? ""}"`;
      attrs += ` intervalLeft="${d.interval.leftOpen ? 1 : 0}"`;
      attrs += ` intervalRight="${d.interval.rightOpen ? 1 : 0}"`;
    }
    if (d.core != null) attrs += ` core="${d.core}"`;
    if (d.suspendable) attrs += ` suspendable="true"`;
    if (d.cvnKind) attrs += ` cvnKind="${d.cvnKind}"`;
    if (d.scope) attrs += ` scope="${esc(d.scope)}"`;
    if (d.anchors) attrs += ` anchors="${esc(d.anchors)}"`;
    if (d.family) attrs += ` family="${esc(d.family)}"`;
    lines.push(`  <transition ${attrs}>${graphicsTag(t.id, positions)}</transition>`);
  }

  for (const a of sem.arcs) {
    let attrs = `id="${esc(a.id)}" source="${esc(a.source)}" target="${esc(a.target)}" weight="${a.data.weight}" type="${a.data.arcType}"`;
    const cvn = a.data.cvnArc;
    if (cvn) {
      if (cvn.type === "guard") attrs += ` guard="${esc(cvn.guard)}"`;
      else if (cvn.type === "update") attrs += ` update="${esc(cvn.update)}"`;
      else attrs += ` cvnArc="plain"`;
    }
    lines.push(`  <arc ${attrs}/>`);
  }

  lines.push("</petrinet>");
  return lines.join("\n");
}

function intAttr(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  return v === null ? fallback : Number(v);
}

function readPlace(el: Element, id: string): PlaceData {
  const data: PlaceData = {
    kind: "place",
    label: el.getAttribute("label") ?? id,
    tokens: intAttr(el, "tokens"),
  };
  const cap = el.getAttribute("capacity");
  if (cap !== null) data.capacity = Number(cap);
  const cm = el.getAttribute("capacityMode");
  if (cm) data.capacityMode = cm as CapacityMode;
  if (el.getAttribute("saturate") === "true") data.saturate = true;
  const cls = el.getAttribute("cvnClass");
  if (cls === "control") {
    data.cvnPlace = {
      class: "control",
      sub: (el.getAttribute("cvnSub") as ControlSub) ?? "Statement",
    };
  } else if (cls === "resource") {
    data.cvnPlace = {
      class: "resource",
      resource: (el.getAttribute("cvnResource") as ResourceType) ?? "Mutex",
      param: el.getAttribute("cvnParam") !== null ? intAttr(el, "cvnParam", 1) : undefined,
    };
  }
  return data;
}

function readTransition(el: Element, id: string): TransitionData {
  const data: TransitionData = { kind: "transition", label: el.getAttribute("label") ?? id };
  if (el.getAttribute("priority") !== null) data.priority = intAttr(el, "priority");
  if (el.getAttribute("intervalEarliest") !== null) {
    const interval: TimeInterval = {
      ...defaultInterval(),
      earliest: intAttr(el, "intervalEarliest"),
      latest: el.getAttribute("intervalLatest") ? Number(el.getAttribute("intervalLatest")) : null,
      leftOpen: el.getAttribute("intervalLeft") === "1",
      rightOpen: el.getAttribute("intervalRight") === "1",
    };
    data.interval = interval;
  }
  if (el.getAttribute("core") !== null) data.core = intAttr(el, "core");
  if (el.getAttribute("suspendable") === "true") data.suspendable = true;
  const kind = el.getAttribute("cvnKind");
  if (kind) data.cvnKind = kind as TransitionData["cvnKind"];
  const scope = el.getAttribute("scope");
  if (scope !== null) data.scope = scope || null;
  const anchors = el.getAttribute("anchors");
  if (anchors !== null) data.anchors = anchors;
  const family = el.getAttribute("family");
  if (family !== null) data.family = family || null;
  return data;
}

function readArc(el: Element): { source: string; target: string; data: SemanticNet["arcs"][number]["data"] } {
  const weight = intAttr(el, "weight", 1);
  const arcType = (el.getAttribute("type") as "normal" | "reset" | "inhibitor") ?? "normal";
  const guard = el.getAttribute("guard");
  const update = el.getAttribute("update");
  const cvnArc: CvnArcKind | undefined = guard !== null
    ? { type: "guard", guard }
    : update !== null
      ? { type: "update", update }
      : el.getAttribute("cvnArc") === "plain"
        ? { type: "plain" }
        : undefined;
  const data = { weight, arcType, ...(cvnArc ? { cvnArc } : {}) };
  return {
    source: el.getAttribute("source") ?? "",
    target: el.getAttribute("target") ?? "",
    data,
  };
}

export function parseXml(
  text: string,
): { sem: SemanticNet; positions: Record<string, NetPosition> } {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const root = doc.documentElement;
  const kind = (root.getAttribute("kind") as NetKind) || "pt";
  const positions: Record<string, NetPosition> = {};
  const sem: SemanticNet = { netKind: kind, places: [], transitions: [], arcs: [] };

  for (const el of Array.from(root.children)) {
    const id = el.getAttribute("id") ?? "";
    if (el.tagName === "place") {
      sem.places.push({ id, data: readPlace(el, id) });
    } else if (el.tagName === "transition") {
      sem.transitions.push({ id, data: readTransition(el, id) });
    } else if (el.tagName === "arc") {
      const { source, target, data } = readArc(el);
      sem.arcs.push({ id, source, target, data });
    }
    const g = el.getElementsByTagName("graphics")[0];
    if (g) {
      positions[id] = { x: Number(g.getAttribute("x") ?? 0), y: Number(g.getAttribute("y") ?? 0) };
    }
  }

  return { sem, positions };
}