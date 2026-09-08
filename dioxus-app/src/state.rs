use crate::model::*;
use dioxus::prelude::*;

pub const NODE_W: f32 = 84.0;
pub const NODE_H: f32 = 64.0;
pub const GRID: f32 = 16.0;

#[derive(Clone, Debug, PartialEq)]
pub enum Selection {
    Node(String),
    Edge(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tool {
    Select,
    Arc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    En,
    Zh,
}

impl Lang {
    pub fn key(&self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Zh => "zh",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewState {
    pub offset_x: f32,
    pub offset_y: f32,
    pub zoom: f32,
}

impl Default for ViewState {
    fn default() -> Self {
        ViewState { offset_x: 0.0, offset_y: 0.0, zoom: 1.0 }
    }
}

#[derive(Clone, Debug)]
pub struct HistoryState {
    pub undo_stack: Vec<PetriNet>,
    pub redo_stack: Vec<PetriNet>,
}

impl Default for HistoryState {
    fn default() -> Self {
        HistoryState { undo_stack: Vec::new(), redo_stack: Vec::new() }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Clipboard {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

/// All shared application state, provided via context.
#[derive(Clone, Copy)]
pub struct AppState {
    pub net: Signal<PetriNet>,
    pub selection: Signal<Option<Selection>>,
    pub history: Signal<HistoryState>,
    pub tool: Signal<Tool>,
    pub arc_type: Signal<ArcType>,
    pub pending_arc: Signal<Option<ArcDraft>>,
    pub view: Signal<ViewState>,
    pub snap: Signal<bool>,
    pub select_mode: Signal<bool>,
    pub lang: Signal<Lang>,
    pub show_net_kind: Signal<bool>,
    pub show_shortcuts: Signal<bool>,
    pub clipboard: Signal<Clipboard>,
    pub status_msg: Signal<String>,
    pub ai_input: Signal<String>,
    pub ai_messages: Signal<Vec<crate::ai::ChatTurn>>,
    pub ai_loading: Signal<bool>,
    pub sim_state: Signal<Option<crate::backend::SimStateDto>>,
    pub sim_enabled: Signal<Vec<String>>,
    pub sim_waiting: Signal<Vec<String>>,
    pub sim_can_advance: Signal<bool>,
    pub sim_open: Signal<bool>,
    pub chat_open: Signal<bool>,
    pub simulating: Signal<bool>,
    pub sim_collapsed: Signal<bool>,
    pub sim_auto: Signal<bool>,
    pub sim_steps: Signal<usize>,
    pub analysis: Signal<Option<AnalysisUi>>,
    pub show_analysis: Signal<bool>,
    pub svg_rect: Signal<Option<(f64, f64, f64, f64)>>,
    pub drag: Signal<DragState>,
    pub editing: Signal<bool>,
}

#[derive(Clone, Debug)]
pub struct AnalysisUi {
    pub result: crate::backend::AnalysisResultDto,
    pub selected_state: Option<usize>,
    pub highlight_transition: Option<String>,
}

impl AppState {
    pub fn net(self) -> PetriNet {
        (self.net)()
    }
    pub fn selection(self) -> Option<Selection> {
        (self.selection)()
    }
    pub fn tool(self) -> Tool {
        (self.tool)()
    }
    pub fn arc_type(self) -> ArcType {
        (self.arc_type)()
    }
    pub fn pending_arc(self) -> Option<ArcDraft> {
        (self.pending_arc)()
    }
    pub fn view(self) -> ViewState {
        (self.view)()
    }
    pub fn snap(self) -> bool {
        (self.snap)()
    }
    pub fn select_mode(self) -> bool {
        (self.select_mode)()
    }
    pub fn lang(self) -> Lang {
        (self.lang)()
    }
    pub fn ai_input(self) -> String {
        (self.ai_input)()
    }
    pub fn chat_open(self) -> bool {
        (self.chat_open)()
    }
    pub fn sim_open(self) -> bool {
        (self.sim_open)()
    }
    pub fn clipboard(self) -> Clipboard {
        (self.clipboard)()
    }
    pub fn status_msg(self) -> String {
        (self.status_msg)()
    }
    pub fn ai_messages(self) -> Vec<crate::ai::ChatTurn> {
        (self.ai_messages)()
    }
    pub fn ai_loading(self) -> bool {
        (self.ai_loading)()
    }
    pub fn sim_state(self) -> Option<crate::backend::SimStateDto> {
        (self.sim_state)()
    }
    pub fn sim_enabled(self) -> Vec<String> {
        (self.sim_enabled)()
    }
    pub fn sim_waiting(self) -> Vec<String> {
        (self.sim_waiting)()
    }
    pub fn sim_can_advance(self) -> bool {
        (self.sim_can_advance)()
    }
    pub fn sim_auto(self) -> bool {
        (self.sim_auto)()
    }
    pub fn sim_collapsed(self) -> bool {
        (self.sim_collapsed)()
    }
    pub fn sim_steps(self) -> usize {
        (self.sim_steps)()
    }
    pub fn simulating(self) -> bool {
        (self.simulating)()
    }
    pub fn analysis(self) -> Option<AnalysisUi> {
        (self.analysis)()
    }
    pub fn svg_rect(self) -> Option<(f64, f64, f64, f64)> {
        (self.svg_rect)()
    }
    pub fn drag(self) -> DragState {
        (self.drag)()
    }
    pub fn editing(self) -> bool {
        (self.editing)()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ArcDraft {
    pub source: String,
    pub from_x: f32,
    pub from_y: f32,
    pub to_x: f32,
    pub to_y: f32,
}

/// What the canvas is currently doing with the mouse.
#[derive(Clone, Debug, PartialEq)]
pub enum DragState {
    None,
    Pan { start_client: (f64, f64), start_offset: (f32, f32) },
    Node { id: String, start_client: (f64, f64), start_pos: Position },
    BoxSelect { start: (f32, f32), cur: (f32, f32) },
    ArcFromNode { source: String, start: (f32, f32) },
}

pub fn snap(v: f32) -> f32 {
    (v / GRID).round() * GRID
}

pub fn selected_ids(net: &PetriNet) -> (Vec<String>, Vec<String>) {
    let nodes = net.nodes.iter().filter(|n| n.selected).map(|n| n.id.clone()).collect();
    let edges = net.edges.iter().filter(|e| e.selected).map(|e| e.id.clone()).collect();
    (nodes, edges)
}

pub fn clear_selection(net: &PetriNet) -> PetriNet {
    let mut net = net.clone();
    for n in net.nodes.iter_mut() {
        n.selected = false;
    }
    for e in net.edges.iter_mut() {
        e.selected = false;
    }
    net
}

pub fn net_summary(net: &PetriNet) -> String {
    let mut lines = vec![format!("netKind={}", net.net_kind.as_str())];
    for n in &net.nodes {
        match &n.data {
            NodeData::Place(d) => {
                let mut parts = vec![format!("Place {} label=\"{}\" tokens={}", n.id, d.label, d.tokens)];
                match net.net_kind {
                    NetKind::Pt | NetKind::Timed => {
                        if let Some(c) = d.capacity {
                            parts.push(format!("capacity={c}"));
                        }
                        if net.net_kind == NetKind::Pt {
                            parts.push(format!(
                                "capacityMode={}",
                                d.capacity_mode.clone().unwrap_or_else(|| "reject".into())
                            ));
                        }
                        if net.net_kind == NetKind::Timed {
                            parts.push(format!("saturate={}", d.saturate.unwrap_or(false)));
                        }
                    }
                    NetKind::Cvn => {
                        if let Some(cp) = &d.cvn_place {
                            if cp.class == "control" {
                                parts.push(format!("cvn=control/{}", cp.sub.clone().unwrap_or_default()));
                            } else {
                                parts.push(format!(
                                    "cvn=resource/{}{}",
                                    cp.resource.clone().unwrap_or_default(),
                                    cp.param.map(|p| format!("({p})")).unwrap_or_default()
                                ));
                            }
                        }
                    }
                }
                lines.push(parts.join(" "));
            }
            NodeData::Transition(d) => {
                let mut parts = vec![format!("Transition {} label=\"{}\"", n.id, d.label)];
                if let Some(p) = d.priority {
                    parts.push(format!("priority={p}"));
                }
                if net.net_kind == NetKind::Timed {
                    if let Some(iv) = &d.interval {
                        parts.push(format!("interval={}", format_interval(iv)));
                        parts.push(format!("core={}", d.core.unwrap_or(0)));
                        parts.push(format!("suspendable={}", d.suspendable.unwrap_or(false)));
                    }
                }
                if net.net_kind == NetKind::Cvn {
                    parts.push(format!("cvnKind={}", d.cvn_kind.clone().unwrap_or_else(|| "Sequential".into())));
                    if let Some(s) = &d.scope {
                        parts.push(format!("scope={s}"));
                    }
                    if let Some(f) = &d.family {
                        parts.push(format!("family={f}"));
                    }
                    if let Some(a) = &d.anchors {
                        if !a.is_empty() {
                            parts.push(format!("anchors={a}"));
                        }
                    }
                }
                lines.push(parts.join(" "));
            }
        }
    }
    for e in &net.edges {
        let mut parts = vec![format!(
            "Arc {} -> {} type={} weight={}",
            e.source, e.target, e.data.arc_type.as_str(), e.data.weight
        )];
        if net.net_kind == NetKind::Cvn {
            if let Some(c) = &e.data.cvn_arc {
                match c.kind.as_str() {
                    "guard" => parts.push(format!("guard=\"{}\"", c.guard.clone().unwrap_or_default())),
                    "update" => parts.push(format!("update=\"{}\"", c.update.clone().unwrap_or_default())),
                    _ => parts.push("cvnArc=plain".into()),
                }
            }
        }
        lines.push(parts.join(" "));
    }
    lines.join("\n")
}

pub fn format_interval(iv: &TimeInterval) -> String {
    let left = if iv.left_open { "(" } else { "[" };
    let right = if iv.right_open { ")" } else { "]" };
    let latest = iv.latest.map(|l| l.to_string()).unwrap_or_else(|| "∞".into());
    format!("{left}{}, {latest}{right}", iv.earliest)
}

pub fn summarize_analysis(r: &crate::backend::AnalysisResultDto) -> String {
    let bounded = if r.truncated { "possibly unbounded" } else { "bounded" };
    format!("reachable states: {}, {}, deadlock states: {}", r.state_count, bounded, r.deadlock_count)
}

// ── geometry ───────────────────────────────────────────────────────────────

pub const PLACE_R: f32 = 32.0;
pub const TRANS_W: f32 = 56.0;
pub const TRANS_H: f32 = 40.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pt {
    pub x: f32,
    pub y: f32,
}

/// Facing connection points: where an arc from `src` to `dst` should attach
/// on each node's boundary.
pub fn facing_points(src: &Node, dst: &Node) -> (Pt, Pt) {
    let a = Pt { x: src.position.x, y: src.position.y };
    let b = Pt { x: dst.position.x, y: dst.position.y };
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len = (dx * dx + dy * dy).sqrt().max(0.001);
    let ux = dx / len;
    let uy = dy / len;

    let from = boundary_point(src, ux, uy);
    let to = boundary_point(dst, -ux, -uy);
    (from, to)
}

fn boundary_point(n: &Node, ux: f32, uy: f32) -> Pt {
    match &n.data {
        NodeData::Place(_) => Pt { x: n.position.x + ux * PLACE_R, y: n.position.y + uy * PLACE_R },
        NodeData::Transition(_) => {
            let hw = TRANS_W / 2.0;
            let hh = TRANS_H / 2.0;
            // intersect the direction ray with the rect boundary
            let mut tx = f32::INFINITY;
            let mut ty = f32::INFINITY;
            if ux.abs() > 0.001 {
                tx = hw / ux.abs();
            }
            if uy.abs() > 0.001 {
                ty = hh / uy.abs();
            }
            let t = tx.min(ty);
            Pt { x: n.position.x + ux * t, y: n.position.y + uy * t }
        }
    }
}

// ── editor actions ─────────────────────────────────────────────────────────

pub fn commit(mut state: AppState) {
    let current = state.net();
    state.history.write().undo_stack.push(current);
    state.history.write().redo_stack.clear();
}

pub fn undo(mut state: AppState) {
    let current = state.net();
    let mut h = state.history.write();
    if let Some(prev) = h.undo_stack.pop() {
        h.redo_stack.push(current);
        state.net.set(prev);
    }
}

pub fn redo(mut state: AppState) {
    let current = state.net();
    let mut h = state.history.write();
    if let Some(next) = h.redo_stack.pop() {
        h.undo_stack.push(current);
        state.net.set(next);
    }
}

pub fn can_undo(state: AppState) -> bool {
    !state.history.read().undo_stack.is_empty()
}

pub fn can_redo(state: AppState) -> bool {
    !state.history.read().redo_stack.is_empty()
}

pub fn add_place(mut state: AppState) {
    commit(state);
    let offset = (state.net().nodes.len() * 24) as f32;
    let n = create_place(160.0 + offset, 120.0 + offset, state.net().net_kind);
    state.net.write().nodes.push(n);
    state.selection.set(Some(Selection::Node(state.net().nodes.last().unwrap().id.clone())));
}

pub fn add_transition(mut state: AppState) {
    commit(state);
    let offset = (state.net().nodes.len() * 24) as f32;
    let n = create_transition(160.0 + offset, 120.0 + offset, state.net().net_kind);
    state.net.write().nodes.push(n);
    state.selection.set(Some(Selection::Node(state.net().nodes.last().unwrap().id.clone())));
}

pub fn clear_all(mut state: AppState) {
    commit(state);
    let mut net = state.net.write();
    net.nodes.clear();
    net.edges.clear();
    state.selection.set(None);
}

pub fn delete_selected(mut state: AppState) {
    let (node_ids, edge_ids) = selected_ids(&state.net());
    if node_ids.is_empty() && edge_ids.is_empty() {
        return;
    }
    commit(state);
    let mut net = state.net.write();
    let node_set: std::collections::HashSet<String> = node_ids.iter().cloned().collect();
    net.nodes.retain(|n| !n.selected);
    net.edges.retain(|e| !e.selected && !node_set.contains(&e.source) && !node_set.contains(&e.target));
    state.selection.set(None);
}

pub fn copy_selection(mut state: AppState) {
    let net = state.net();
    let sel_nodes: Vec<Node> = net.nodes.iter().filter(|n| n.selected).cloned().collect();
    if sel_nodes.is_empty() {
        return;
    }
    let ids: std::collections::HashSet<String> = sel_nodes.iter().map(|n| n.id.clone()).collect();
    let sel_edges: Vec<Edge> = net
        .edges
        .iter()
        .filter(|e| ids.contains(&e.source) && ids.contains(&e.target))
        .cloned()
        .collect();
    state.clipboard.set(Clipboard { nodes: sel_nodes, edges: sel_edges });
}

pub fn paste(mut state: AppState) {
    let clip = state.clipboard().clone();
    if clip.nodes.is_empty() {
        return;
    }
    commit(state);
    let nk = state.net().net_kind;
    let mut id_map = std::collections::HashMap::new();
    let mut new_nodes: Vec<Node> = Vec::new();
    for n in &clip.nodes {
        let prefix = if n.is_place() { "p" } else { "t" };
        let new_id = next_id(prefix);
        id_map.insert(n.id.clone(), new_id.clone());
        new_nodes.push(Node {
            id: new_id,
            position: Position { x: n.position.x + 24.0, y: n.position.y + 24.0 },
            data: strip_net_attrs(nk, n.data.clone()),
            selected: false,
        });
    }
    let mut new_edges: Vec<Edge> = Vec::new();
    for e in &clip.edges {
        let (Some(s), Some(t)) = (id_map.get(&e.source), id_map.get(&e.target)) else { continue };
        let mut ne = Edge {
            id: next_id("a"),
            source: s.clone(),
            target: t.clone(),
            data: e.data.clone(),
            selected: false,
        };
        ne.data.cvn_arc = if nk == NetKind::Cvn { e.data.cvn_arc.clone() } else { None };
        new_edges.push(ne);
    }
    let mut net = state.net.write();
    net.nodes.extend(new_nodes);
    net.edges.extend(new_edges);
}

pub fn change_net_kind(mut state: AppState, nk: NetKind) {
    if state.net().net_kind == nk {
        return;
    }
    commit(state);
    let mut net = state.net.write();
    for n in net.nodes.iter_mut() {
        n.data = strip_net_attrs(nk, n.data.clone());
    }
    for e in net.edges.iter_mut() {
        if nk == NetKind::Cvn {
            let mut data = e.data.clone();
            data.cvn_arc = e.data.cvn_arc.clone().or(Some(CvnArc { kind: "plain".into(), guard: None, update: None }));
            e.data = data;
        } else {
            e.data.cvn_arc = None;
        }
    }
    net.net_kind = nk;
    state.simulating.set(false);
    state.sim_open.set(false);
}

pub fn select_node(mut state: AppState, id: &str) {
    let mut net = clear_selection(&state.net());
    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == id) {
        n.selected = true;
    }
    state.net.set(net);
    state.selection.set(Some(Selection::Node(id.to_string())));
}

pub fn select_edge(mut state: AppState, id: &str) {
    let mut net = clear_selection(&state.net());
    if let Some(e) = net.edges.iter_mut().find(|e| e.id == id) {
        e.selected = true;
    }
    state.net.set(net);
    state.selection.set(Some(Selection::Edge(id.to_string())));
}

pub fn counts(state: AppState) -> (usize, usize, usize) {
    let net = state.net();
    (
        net.nodes.iter().filter(|n| n.is_place()).count(),
        net.nodes.iter().filter(|n| !n.is_place()).count(),
        net.edges.len(),
    )
}

pub fn any_selected(state: AppState) -> bool {
    state.net().nodes.iter().any(|n| n.selected) || state.net().edges.iter().any(|e| e.selected)
}

pub fn set_status(mut state: AppState, msg: String) {
    state.status_msg.set(msg);
}

pub fn fits_view(mut state: AppState, w: f64, h: f64) {
    let net = state.net();
    if net.nodes.is_empty() {
        return;
    }
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    for n in &net.nodes {
        min_x = min_x.min(n.position.x - NODE_W);
        min_y = min_y.min(n.position.y - NODE_H);
        max_x = max_x.max(n.position.x + NODE_W);
        max_y = max_y.max(n.position.y + NODE_H);
    }
    let bw = (max_x - min_x).max(1.0) as f64;
    let bh = (max_y - min_y).max(1.0) as f64;
    let zoom = ((w * 0.8) / bw).min((h * 0.8) / bh).min(2.0).max(0.2) as f32;
    let cx = (min_x + max_x) / 2.0;
    let cy = (min_y + max_y) / 2.0;
    state.view.set(ViewState {
        offset_x: (w / 2.0) as f32 - cx * zoom,
        offset_y: (h / 2.0) as f32 - cy * zoom,
        zoom,
    });
}