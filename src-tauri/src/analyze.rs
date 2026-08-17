//! Reachability analysis bridge: converts the frontend's semantic net (JSON)
//! into UniPN nets and explores the reachable state space in Rust.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

use serde::{Deserialize, Serialize};

use unipn::analysis::{explore, AnalysisConfig, NetLike, ReachabilityGraph, SearchStrategy};
use unipn::analysis::pt::check_boundness;
use unipn::analysis::timed::reachability::{StateClassReachabilityGraph, reachable_markings};
use unipn::cvn::{find_dead_transitions, CvnArcKind, CvnExtra, CvnNet, CvnState, CvnTransition};
use unipn::expr::{BoolExpr, CmpOp, Expr, Op, Val, VarUpdate};
use unipn::ids::{PlaceId, TransitionId};
use unipn::model::{ControlSub, PlaceKind, ResourceType, TransitionKind};
use unipn::net::{ArcDir, Marking, Net};
use unipn::pt::{PlaceType, PtNet, PtPlaceKind, PtTransitionKind, TransitionType};
use unipn::timed::{
    INF, TimeInterval, TimedNet, TimedPlaceKind, TimedState, TimedTransitionKind,
};

// ── DTOs (mirror the frontend's `SemanticNet`) ─────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticNetDto {
    pub net_kind: String,
    pub places: Vec<SemanticPlaceDto>,
    pub transitions: Vec<SemanticTransitionDto>,
    pub arcs: Vec<SemanticArcDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticPlaceDto {
    pub id: String,
    pub data: PlaceDataDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceDataDto {
    pub label: String,
    pub tokens: usize,
    pub capacity: Option<usize>,
    pub capacity_mode: Option<String>,
    pub saturate: Option<bool>,
    pub cvn_place: Option<CvnPlaceDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvnPlaceDto {
    pub class: String,
    pub sub: Option<String>,
    pub resource: Option<String>,
    pub param: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticTransitionDto {
    pub id: String,
    pub data: TransitionDataDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionDataDto {
    pub label: String,
    pub priority: Option<i32>,
    pub interval: Option<IntervalDto>,
    pub core: Option<i32>,
    pub suspendable: Option<bool>,
    pub cvn_kind: Option<String>,
    pub scope: Option<String>,
    pub anchors: Option<String>,
    pub family: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalDto {
    pub earliest: f64,
    pub latest: Option<f64>,
    pub left_open: bool,
    pub right_open: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticArcDto {
    pub source: String,
    pub target: String,
    pub data: ArcDataDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcDataDto {
    pub weight: usize,
    #[serde(rename = "arcType")]
    pub arc_type: String,
    pub cvn_arc: Option<CvnArcDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvnArcDto {
    #[serde(rename = "type")]
    pub kind: String,
    pub guard: Option<String>,
    pub update: Option<String>,
}

// ── Result DTO (mirrors the frontend's `AnalysisResult`) ──────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResultDto {
    pub state_count: usize,
    pub truncated: bool,
    pub deadlock_count: usize,
    pub deadlock_markings: Vec<BTreeMap<String, usize>>,
    pub max_tokens: BTreeMap<String, usize>,
    pub states: Vec<ReachStateDto>,
    pub edges: Vec<ReachEdgeDto>,
    pub advanced: AdvancedDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedDto {
    pub boundness: Option<BoundnessDto>,
    pub dead_transitions: Option<Vec<String>>,
    pub timed: Option<TimedSummaryDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundnessDto {
    pub bounded: bool,
    pub unbounded_places: Vec<String>,
    pub note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedSummaryDto {
    pub state_class_count: usize,
    pub reachable_marking_count: usize,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachStateDto {
    pub marking: BTreeMap<String, usize>,
    pub level: usize,
    pub deadlock: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReachEdgeDto {
    pub source: usize,
    pub target: usize,
    pub transition_id: String,
}

// ── Builders ───────────────────────────────────────────────────────────────

fn arc_direction(arc_type: &str, source_is_place: bool) -> ArcDir {
    match arc_type {
        "reset" => ArcDir::Reset,
        "inhibitor" => ArcDir::Inhibitor,
        _ if source_is_place => ArcDir::Input,
        _ => ArcDir::Output,
    }
}

pub(crate) fn build_pt(sem: &SemanticNetDto) -> Result<(PtNet, Marking, Vec<String>, Vec<String>, HashSet<usize>), String> {
    let mut net: PtNet = Net::new();
    let mut marking = Vec::with_capacity(sem.places.len());
    let mut place_index: HashMap<&str, PlaceId> = HashMap::new();
    let mut reject: HashSet<usize> = HashSet::new();
    let mut place_order = Vec::with_capacity(sem.places.len());

    for p in &sem.places {
        let id = net.add_place(
            p.data.label.clone(),
            PtPlaceKind {
                place_type: PlaceType::BasicBlock,
                span: String::new(),
                capacity: p.data.capacity,
            },
        );
        place_index.insert(p.id.as_str(), id);
        place_order.push(p.id.clone());
        marking.push(p.data.tokens);
        if p.data.capacity.is_some() && p.data.capacity_mode.as_deref() != Some("saturate") {
            reject.insert(id.index());
        }
    }

    let mut trans_index: HashMap<&str, TransitionId> = HashMap::new();
    let mut trans_order = Vec::with_capacity(sem.transitions.len());
    for t in &sem.transitions {
        let id = net.add_transition(
            t.data.label.clone(),
            PtTransitionKind::new(TransitionType::Normal),
        );
        trans_index.insert(t.id.as_str(), id);
        trans_order.push(t.id.clone());
    }

    for a in &sem.arcs {
        let source_is_place = place_index.contains_key(a.source.as_str());
        let dir = arc_direction(&a.data.arc_type, source_is_place);
        let (pid, tid) = if source_is_place {
            (
                *place_index.get(a.source.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.target.as_str()).ok_or("arc references unknown transition")?,
            )
        } else {
            (
                *place_index.get(a.target.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.source.as_str()).ok_or("arc references unknown transition")?,
            )
        };
        net.add_arc(pid, tid, dir, a.data.weight.max(1), ());
    }

    Ok((net, Marking::new(marking), place_order, trans_order, reject))
}

pub(crate) fn build_timed(sem: &SemanticNetDto) -> Result<(TimedNet, TimedState, Vec<String>, Vec<String>), String> {
    let mut net: TimedNet = Net::new();
    let mut marking = Vec::with_capacity(sem.places.len());
    let mut place_index: HashMap<&str, PlaceId> = HashMap::new();
    let mut place_order = Vec::with_capacity(sem.places.len());

    for p in &sem.places {
        let id = net.add_place(
            p.data.label.clone(),
            TimedPlaceKind {
                capacity: p.data.capacity,
                saturate: p.data.saturate.unwrap_or(false),
            },
        );
        place_index.insert(p.id.as_str(), id);
        place_order.push(p.id.clone());
        marking.push(p.data.tokens);
    }

    let mut trans_index: HashMap<&str, TransitionId> = HashMap::new();
    let mut trans_order = Vec::with_capacity(sem.transitions.len());
    for t in &sem.transitions {
        let iv = t.data.interval.as_ref().map(|i| TimeInterval {
            earliest: i.earliest as i32,
            latest: i.latest.map_or(INF, |v| v as i32),
            left_open: i.left_open,
            right_open: i.right_open,
        });
        let id = net.add_transition(
            t.data.label.clone(),
            TimedTransitionKind {
                interval: iv.unwrap_or(TimeInterval::closed(0, INF)),
                priority: t.data.priority.unwrap_or(0),
                core: t.data.core.unwrap_or(0),
                suspendable: t.data.suspendable.unwrap_or(false),
            },
        );
        trans_index.insert(t.id.as_str(), id);
        trans_order.push(t.id.clone());
    }

    for a in &sem.arcs {
        let source_is_place = place_index.contains_key(a.source.as_str());
        let dir = arc_direction(&a.data.arc_type, source_is_place);
        let (pid, tid) = if source_is_place {
            (
                *place_index.get(a.source.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.target.as_str()).ok_or("arc references unknown transition")?,
            )
        } else {
            (
                *place_index.get(a.target.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.source.as_str()).ok_or("arc references unknown transition")?,
            )
        };
        net.add_arc(pid, tid, dir, a.data.weight.max(1), ());
    }

    Ok((net, TimedState::from(Marking::new(marking)), place_order, trans_order))
}

fn control_sub(s: Option<&str>) -> ControlSub {
    match s {
        Some("BasicBlock") => ControlSub::BasicBlock,
        Some("FunctionStart") => ControlSub::FunctionStart,
        Some("FunctionEnd") => ControlSub::FunctionEnd,
        Some("Return") => ControlSub::Return,
        Some("ThreadEnd") => ControlSub::ThreadEnd,
        Some("CallWait") => ControlSub::CallWait,
        Some("WaitPoint") => ControlSub::WaitPoint,
        Some("Reacquire") => ControlSub::Reacquire,
        Some("SpawnBridge") => ControlSub::SpawnBridge,
        Some("TestPoint") => ControlSub::TestPoint,
        _ => ControlSub::Statement,
    }
}

fn transition_kind(s: Option<&str>) -> TransitionKind {
    match s {
        Some("Goto") => TransitionKind::Goto,
        Some("FunctionEnter") => TransitionKind::FunctionEnter,
        Some("FunctionExit") => TransitionKind::FunctionExit,
        Some("Return") => TransitionKind::Return,
        Some("Drop") => TransitionKind::Drop,
        Some("BranchTrue") => TransitionKind::BranchTrue,
        Some("BranchFalse") => TransitionKind::BranchFalse,
        Some("Switch") => TransitionKind::Switch { label: String::new() },
        Some("Lock") => TransitionKind::Lock,
        Some("Unlock") => TransitionKind::Unlock,
        Some("ReadLock") => TransitionKind::ReadLock,
        Some("ReadUnlock") => TransitionKind::ReadUnlock,
        Some("Acquire") => TransitionKind::Acquire,
        Some("Release") => TransitionKind::Release,
        Some("Send") => TransitionKind::Send,
        Some("Recv") => TransitionKind::Recv,
        Some("VarRead") => TransitionKind::VarRead,
        Some("VarWrite") => TransitionKind::VarWrite,
        Some("AtomicLoad") => TransitionKind::AtomicLoad,
        Some("AtomicStore") => TransitionKind::AtomicStore,
        Some("AtomicCmpXchg") => TransitionKind::AtomicCmpXchg,
        Some("CasSuccess") => TransitionKind::CasSuccess,
        Some("CasFailure") => TransitionKind::CasFailure,
        Some("UnsafeRead") => TransitionKind::UnsafeRead,
        Some("UnsafeWrite") => TransitionKind::UnsafeWrite,
        Some("UnsafeAccess") => TransitionKind::UnsafeAccess,
        Some("Spawn") => TransitionKind::Spawn,
        Some("Join") => TransitionKind::Join,
        Some("Call") => TransitionKind::Call,
        Some("CondvarWaitEnter") => TransitionKind::CondvarWaitEnter,
        Some("CondvarWakeByNotify") => TransitionKind::CondvarWakeByNotify,
        Some("CondvarWakeByNotifyAll") => TransitionKind::CondvarWakeByNotifyAll,
        Some("CondvarReacquire") => TransitionKind::CondvarReacquire,
        Some("CondvarNotify") => TransitionKind::CondvarNotify,
        Some("CondvarNotifyLost") => TransitionKind::CondvarNotifyLost,
        Some("CondvarNotifyAll") => TransitionKind::CondvarNotifyAll,
        Some("CondvarNotifyAllLost") => TransitionKind::CondvarNotifyAllLost,
        Some("TestBarrier") => TransitionKind::TestBarrier,
        Some("TestInject") => TransitionKind::TestInject,
        Some("TestPoint") => TransitionKind::TestPoint,
        Some("Other") | None => TransitionKind::Other(String::new()),
        Some(other) => TransitionKind::Other(other.to_string()),
    }
}

// ── Guard / update parsing (frontend string syntax) ───────────────────────

fn parse_guard(s: &str) -> BoolExpr {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() == 3 {
        let lhs = Expr::Ref(parts[0].to_string());
        let op = match parts[1] {
            "==" => CmpOp::Eq,
            "!=" => CmpOp::Ne,
            "<=" => CmpOp::Le,
            ">=" => CmpOp::Ge,
            "<" => CmpOp::Lt,
            ">" => CmpOp::Gt,
            _ => return BoolExpr::True,
        };
        if let Ok(rhs) = parts[2].parse::<i64>() {
            return BoolExpr::Cmp {
                op,
                lhs: Box::new(lhs),
                rhs: Box::new(Expr::Lit(Val::int(rhs))),
            };
        }
    }
    BoolExpr::True
}

fn ident_or_lit(s: &str) -> Expr {
    if let Ok(v) = s.parse::<i64>() {
        Expr::Lit(Val::int(v))
    } else if s.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_') {
        Expr::Ref(s.to_string())
    } else {
        Expr::Lit(Val::int(0))
    }
}

fn parse_expr(s: &str) -> Expr {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() == 3 {
        let a = ident_or_lit(parts[0]);
        let op = match parts[1] {
            "+" => Op::Add,
            "-" => Op::Sub,
            "*" => Op::Mul,
            "/" => Op::Div,
            "%" => Op::Mod,
            _ => return a,
        };
        let b = ident_or_lit(parts[2]);
        return Expr::BinOp {
            op,
            lhs: Box::new(a),
            rhs: Box::new(b),
        };
    }
    ident_or_lit(s)
}

fn parse_update(s: &str) -> VarUpdate {
    let mut map = VarUpdate::new();
    if let Some((name, rhs)) = s.split_once('=') {
        map.insert(name.trim().to_string(), parse_expr(rhs.trim()));
    }
    map
}

fn collect_identifiers(s: &str, out: &mut Vec<String>) {
    for part in s.split(|c: char| !c.is_ascii_alphanumeric() && c != '_') {
        if !part.is_empty() && part.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        {
            if !out.iter().any(|v| v == part) {
                out.push(part.to_string());
            }
        }
    }
}

pub(crate) fn build_cvn(sem: &SemanticNetDto) -> Result<(CvnNet, CvnState, Vec<String>, Vec<String>), String> {
    let mut net: CvnNet = Net::new();
    let mut marking = Vec::with_capacity(sem.places.len());
    let mut place_index: HashMap<&str, PlaceId> = HashMap::new();
    let mut place_order = Vec::with_capacity(sem.places.len());

    for p in &sem.places {
        let kind = match p.data.cvn_place.as_ref() {
            Some(c) if c.class == "resource" => {
                let rt = match c.resource.as_deref() {
                    Some("RwLock") => ResourceType::RwLock { max_readers: c.param.unwrap_or(1) },
                    Some("Semaphore") => ResourceType::Semaphore { count: c.param.unwrap_or(1) },
                    Some("Channel") => ResourceType::Channel,
                    Some("Condvar") => ResourceType::Condvar,
                    _ => ResourceType::Mutex,
                };
                PlaceKind::Resource(rt)
            }
            _ => PlaceKind::Control(control_sub(
                p.data.cvn_place.as_ref().and_then(|c| c.sub.as_deref()),
            )),
        };
        let id = net.add_place(p.data.label.clone(), kind);
        place_index.insert(p.id.as_str(), id);
        place_order.push(p.id.clone());
        marking.push(p.data.tokens);
    }

    let mut trans_index: HashMap<&str, TransitionId> = HashMap::new();
    let mut trans_order = Vec::with_capacity(sem.transitions.len());
    for t in &sem.transitions {
        let id = net.add_transition(
            t.data.label.clone(),
            CvnTransition {
                kind: transition_kind(t.data.cvn_kind.as_deref()),
                scope: t.data.scope.clone(),
                anchors: t
                    .data
                    .anchors
                    .as_deref()
                    .map(|a| {
                        a.split([',', ' ', ';'])
                            .filter(|p| !p.is_empty())
                            .map(|p| p.to_string())
                            .collect()
                    })
                    .unwrap_or_default(),
                family: t.data.family.clone(),
            },
        );
        trans_index.insert(t.id.as_str(), id);
        trans_order.push(t.id.clone());
    }

    let mut vars: Vec<String> = Vec::new();
    for a in &sem.arcs {
        let source_is_place = place_index.contains_key(a.source.as_str());
        let dir = arc_direction(&a.data.arc_type, source_is_place);
        let (pid, tid) = if source_is_place {
            (
                *place_index.get(a.source.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.target.as_str()).ok_or("arc references unknown transition")?,
            )
        } else {
            (
                *place_index.get(a.target.as_str()).ok_or("arc references unknown place")?,
                *trans_index.get(a.source.as_str()).ok_or("arc references unknown transition")?,
            )
        };

        let arc_kind = match (dir, a.data.cvn_arc.as_ref()) {
            (ArcDir::Input, Some(c)) if c.kind == "guard" => {
                let guard = c.guard.as_deref().unwrap_or("");
                if let Some(g) = c.guard.as_deref() {
                    collect_identifiers(g, &mut vars);
                }
                CvnArcKind::Guard(parse_guard(guard))
            }
            (ArcDir::Output, Some(c)) if c.kind == "update" => {
                if let Some(u) = c.update.as_deref() {
                    collect_identifiers(u, &mut vars);
                    CvnArcKind::Update(parse_update(u))
                } else {
                    CvnArcKind::Plain
                }
            }
            _ => CvnArcKind::Plain,
        };
        net.add_arc(pid, tid, dir, a.data.weight.max(1), arc_kind);
    }

    let var_store: BTreeMap<String, Val> = vars.into_iter().map(|v| (v, Val::int(0))).collect();
    let state = CvnState::new(
        Marking::new(marking),
        CvnExtra {
            vars: var_store,
            domains: BTreeMap::new(),
        },
    );

    Ok((net, state, place_order, trans_order))
}

// ── Analyzers ──────────────────────────────────────────────────────────────

/// P/T with reject-capacity: a transition is not enabled if a non-saturating
/// output place would overflow (UniPN's `PtNet` always saturates).
pub(crate) struct PtAnalyzer {
    pub(crate) net: PtNet,
    pub(crate) reject: HashSet<usize>,
}

impl PtAnalyzer {
    fn output_ok(&self, state: &Marking, t: TransitionId) -> bool {
        for arc in self.net.arcs_of(t, ArcDir::Output) {
            if !self.reject.contains(&arc.place.index()) {
                continue;
            }
            if let Some(cap) = self.net.place(arc.place).and_then(|p| p.kind.capacity) {
                if state.tokens(arc.place) + arc.weight > cap {
                    return false;
                }
            }
        }
        true
    }
}

impl NetLike for PtAnalyzer {
    type State = Marking;

    fn num_places(&self) -> usize {
        self.net.num_places()
    }

    fn num_transitions(&self) -> usize {
        self.net.num_transitions()
    }

    fn enabled(&self, state: &Self::State) -> Vec<TransitionId> {
        self.net
            .enabled(state)
            .into_iter()
            .filter(|t| self.output_ok(state, *t))
            .collect()
    }

    fn fire(&self, state: &Self::State, transition: TransitionId) -> Option<Self::State> {
        if !self.enabled(state).contains(&transition) {
            return None;
        }
        self.net.fire(state, transition)
    }
}

/// Timed with inhibitor/reset arcs (UniPN's `TimedNet` NetLike handles only
/// input/output arcs).
pub(crate) struct TimedAnalyzer {
    net: TimedNet,
}

impl NetLike for TimedAnalyzer {
    type State = TimedState;

    fn num_places(&self) -> usize {
        self.net.num_places()
    }

    fn num_transitions(&self) -> usize {
        self.net.num_transitions()
    }

    fn enabled(&self, state: &Self::State) -> Vec<TransitionId> {
        self.net
            .enabled(state)
            .into_iter()
            .filter(|t| {
                self.net
                    .arcs_of(*t, ArcDir::Inhibitor)
                    .all(|a| state.marking.tokens(a.place) < a.weight)
            })
            .collect()
    }

    fn fire(&self, state: &Self::State, transition: TransitionId) -> Option<Self::State> {
        if !self.enabled(state).contains(&transition) {
            return None;
        }
        let mut next = <TimedNet as NetLike>::fire(&self.net, state, transition)?;
        for arc in self.net.arcs_of(transition, ArcDir::Reset) {
            next.marking.set(arc.place, 0);
        }
        Some(next)
    }
}

// ── Result conversion ──────────────────────────────────────────────────────

fn compute_levels(edges: &[(usize, usize, TransitionId)], n: usize) -> Vec<usize> {
    let mut level = vec![usize::MAX; n];
    let mut adj: HashMap<usize, Vec<usize>> = HashMap::new();
    for (s, t, _) in edges {
        adj.entry(*s).or_default().push(*t);
    }
    let mut queue = VecDeque::from([0usize]);
    level[0] = 0;
    while let Some(u) = queue.pop_front() {
        if let Some(nexts) = adj.get(&u) {
            for &v in nexts {
                if level[v] == usize::MAX {
                    level[v] = level[u] + 1;
                    queue.push_back(v);
                }
            }
        }
    }
    level.iter().map(|l| if *l == usize::MAX { 0 } else { *l }).collect()
}

fn marking_map(m: &Marking, order: &[String]) -> BTreeMap<String, usize> {
    let mut map = BTreeMap::new();
    for (i, pid) in order.iter().enumerate() {
        map.insert(pid.clone(), m.tokens(PlaceId(i)));
    }
    map
}

fn convert_result<S>(
    graph: &ReachabilityGraph<S>,
    place_order: &[String],
    trans_order: &[String],
    marking_of: impl Fn(&S) -> &Marking,
    advanced: AdvancedDto,
) -> AnalysisResultDto {
    let levels = compute_levels(&graph.edges, graph.states.len());
    let mut max_tokens: BTreeMap<String, usize> = BTreeMap::new();
    let mut states: Vec<ReachStateDto> = Vec::with_capacity(graph.states.len());

    for (i, s) in graph.states.iter().enumerate() {
        let m = marking_of(s);
        for (j, pid) in place_order.iter().enumerate() {
            let v = m.tokens(PlaceId(j));
            max_tokens
                .entry(pid.clone())
                .and_modify(|cur| *cur = (*cur).max(v))
                .or_insert(v);
        }
        states.push(ReachStateDto {
            marking: marking_map(m, place_order),
            level: levels[i],
            deadlock: false,
        });
    }

    for &idx in &graph.blocked {
        if let Some(st) = states.get_mut(idx) {
            st.deadlock = true;
        }
    }

    let edges: Vec<ReachEdgeDto> = graph
        .edges
        .iter()
        .map(|(s, t, tr)| ReachEdgeDto {
            source: *s,
            target: *t,
            transition_id: trans_order
                .get(tr.index())
                .cloned()
                .unwrap_or_else(|| format!("t{}", tr.index())),
        })
        .collect();

    let deadlock_markings: Vec<BTreeMap<String, usize>> = graph
        .blocked
        .iter()
        .map(|&i| marking_map(marking_of(&graph.states[i]), place_order))
        .collect();

    AnalysisResultDto {
        state_count: graph.states.len(),
        truncated: graph.truncated,
        deadlock_count: graph.blocked.len(),
        deadlock_markings,
        max_tokens,
        states,
        edges,
        advanced,
    }
}

// ── Command ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn analyze_net(
    semantic: SemanticNetDto,
    max_states: u64,
) -> Result<AnalysisResultDto, String> {
    tauri::async_runtime::spawn_blocking(move || run_analysis(&semantic, max_states))
        .await
        .map_err(|e| e.to_string())?
}

fn run_analysis(semantic: &SemanticNetDto, max_states: u64) -> Result<AnalysisResultDto, String> {
    let config = AnalysisConfig {
        strategy: SearchStrategy::Bfs,
        max_states: max_states.max(1) as usize,
    };

    match semantic.net_kind.as_str() {
        "pt" => {
            let (net, marking, po, to, reject) = build_pt(semantic)?;
            let advanced = pt_advanced(&net, &marking, &po);
            let graph = explore(&PtAnalyzer { net, reject }, marking, &config);
            Ok(convert_result(&graph, &po, &to, |s: &Marking| s, advanced))
        }
        "timed" => {
            let (net, state, po, to) = build_timed(semantic)?;
            let advanced = timed_advanced(&net, &state.marking, max_states.max(1) as usize);
            let graph = explore(&TimedAnalyzer { net }, state, &config);
            Ok(convert_result(
                &graph,
                &po,
                &to,
                |s: &TimedState| &s.marking,
                advanced,
            ))
        }
        "cvn" => {
            let (net, state, po, to) = build_cvn(semantic)?;
            let advanced = cvn_advanced(&net, &po, &to, &state);
            let graph = explore(&net, state, &config);
            Ok(convert_result(&graph, &po, &to, |s: &CvnState| &s.marking, advanced))
        }
        other => Err(format!("unsupported net kind: {other}")),
    }
}

fn pt_advanced(net: &PtNet, initial: &Marking, place_order: &[String]) -> AdvancedDto {
    let boundness = match check_boundness(net, initial) {
        unipn::analysis::pt::BoundnessResult::Bounded => BoundnessDto {
            bounded: true,
            unbounded_places: Vec::new(),
            note: None,
        },
        unipn::analysis::pt::BoundnessResult::Unbounded { unbounded_places, .. } => BoundnessDto {
            bounded: false,
            unbounded_places: unbounded_places
                .iter()
                .filter_map(|p| place_order.get(p.index()).cloned())
                .collect(),
            note: None,
        },
        unipn::analysis::pt::BoundnessResult::Unknown { reason } => BoundnessDto {
            bounded: false,
            unbounded_places: Vec::new(),
            note: Some(reason),
        },
    };
    AdvancedDto {
        boundness: Some(boundness),
        dead_transitions: None,
        timed: None,
    }
}

fn timed_advanced(net: &TimedNet, initial: &Marking, max_states: usize) -> AdvancedDto {
    let mut builder = StateClassReachabilityGraph::new(net, initial.clone());
    let _ = builder.build(max_states);
    let graph = builder.get_graph();
    let timed = TimedSummaryDto {
        state_class_count: graph.states.len(),
        reachable_marking_count: reachable_markings(graph).len(),
        truncated: graph.stats.truncated,
    };
    AdvancedDto {
        boundness: None,
        dead_transitions: None,
        timed: Some(timed),
    }
}

fn cvn_advanced(net: &CvnNet, po: &[String], to: &[String], initial: &CvnState) -> AdvancedDto {
    let config = AnalysisConfig {
        strategy: SearchStrategy::Bfs,
        max_states: 100_000,
    };
    let graph = explore(net, initial.clone(), &config);
    let dead = find_dead_transitions(net, &graph)
        .into_iter()
        .filter_map(|c| match c.kind {
            unipn::analysis::PropertyViolation::DeadTransition { transition, .. } => {
                to.get(transition.index()).cloned()
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    let _ = po;
    AdvancedDto {
        boundness: None,
        dead_transitions: Some(dead),
        timed: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn place(id: &str, label: &str, tokens: usize) -> SemanticPlaceDto {
        SemanticPlaceDto {
            id: id.into(),
            data: PlaceDataDto {
                label: label.into(),
                tokens,
                capacity: None,
                capacity_mode: None,
                saturate: None,
                cvn_place: None,
            },
        }
    }

    fn trans(id: &str, label: &str) -> SemanticTransitionDto {
        SemanticTransitionDto {
            id: id.into(),
            data: TransitionDataDto {
                label: label.into(),
                priority: None,
                interval: None,
                core: None,
                suspendable: None,
                cvn_kind: None,
                scope: None,
                anchors: None,
                family: None,
            },
        }
    }

    fn arc(source: &str, target: &str, weight: usize, arc_type: &str) -> SemanticArcDto {
        SemanticArcDto {
            source: source.into(),
            target: target.into(),
            data: ArcDataDto {
                weight,
                arc_type: arc_type.into(),
                cvn_arc: None,
            },
        }
    }

    fn net(
        kind: &str,
        places: Vec<SemanticPlaceDto>,
        transitions: Vec<SemanticTransitionDto>,
        arcs: Vec<SemanticArcDto>,
    ) -> SemanticNetDto {
        SemanticNetDto {
            net_kind: kind.into(),
            places,
            transitions,
            arcs,
        }
    }

    #[test]
    fn pt_mutual_exclusion() {
        let sem = net(
            "pt",
            vec![
                place("A_idle", "A idle", 1),
                place("A_crit", "A critical", 0),
                place("Mutex", "Mutex", 1),
                place("B_idle", "B idle", 1),
                place("B_crit", "B critical", 0),
            ],
            vec![trans("enterA", "Enter A"), trans("exitA", "Exit A"), trans("enterB", "Enter B"), trans("exitB", "Exit B")],
            vec![
                arc("A_idle", "enterA", 1, "normal"),
                arc("Mutex", "enterA", 1, "normal"),
                arc("enterA", "A_crit", 1, "normal"),
                arc("A_crit", "exitA", 1, "normal"),
                arc("exitA", "A_idle", 1, "normal"),
                arc("exitA", "Mutex", 1, "normal"),
                arc("B_idle", "enterB", 1, "normal"),
                arc("Mutex", "enterB", 1, "normal"),
                arc("enterB", "B_crit", 1, "normal"),
                arc("B_crit", "exitB", 1, "normal"),
                arc("exitB", "B_idle", 1, "normal"),
                arc("exitB", "Mutex", 1, "normal"),
            ],
        );
        let r = run_analysis(&sem, 5000).unwrap();
        assert_eq!(r.state_count, 3, "states");
        assert_eq!(r.edges.len(), 4, "edges");
        assert_eq!(r.deadlock_count, 0, "deadlocks");
        assert!(!r.truncated);
        assert_eq!(r.max_tokens.get("A_crit"), Some(&1));
        let b = r.advanced.boundness.expect("pt boundness");
        assert!(b.bounded, "mutex net should be bounded");
    }

    #[test]
    fn timed_loop() {
        let process = TransitionDataDto {
            label: "Process".into(),
            priority: None,
            interval: Some(IntervalDto {
                earliest: 2.0,
                latest: Some(5.0),
                left_open: false,
                right_open: false,
            }),
            core: None,
            suspendable: None,
            cvn_kind: None,
            scope: None,
            anchors: None,
            family: None,
        };
        let reset = TransitionDataDto {
            label: "Reset".into(),
            priority: None,
            interval: Some(IntervalDto {
                earliest: 1.0,
                latest: Some(3.0),
                left_open: false,
                right_open: false,
            }),
            core: None,
            suspendable: None,
            cvn_kind: None,
            scope: None,
            anchors: None,
            family: None,
        };
        let sem = net(
            "timed",
            vec![place("load", "Job ready", 1), place("done", "Job done", 0)],
            vec![SemanticTransitionDto { id: "process".into(), data: process }, SemanticTransitionDto { id: "reset".into(), data: reset }],
            vec![
                arc("load", "process", 1, "normal"),
                arc("process", "done", 1, "normal"),
                arc("done", "reset", 1, "normal"),
                arc("reset", "load", 1, "normal"),
            ],
        );
        let r = run_analysis(&sem, 5000).unwrap();
        assert_eq!(r.state_count, 2, "states");
        assert_eq!(r.edges.len(), 2, "edges");
        assert_eq!(r.deadlock_count, 0);
        let t = r.advanced.timed.expect("timed dbm");
        assert!(t.state_class_count >= 1);
        assert_eq!(t.reachable_marking_count, 2);
    }

    #[test]
    fn cvn_threads_mutex() {
        let lock = |id: &str, ready: &str, _crit: &str, _unlock: &str| vec![
            SemanticArcDto {
                source: ready.into(),
                target: id.into(),
                data: ArcDataDto {
                    weight: 1,
                    arc_type: "normal".into(),
                    cvn_arc: Some(CvnArcDto {
                        kind: "guard".into(),
                        guard: Some("n < 2".into()),
                        update: None,
                    }),
                },
            },
            SemanticArcDto {
                source: "Mutex".into(),
                target: id.into(),
                data: ArcDataDto { weight: 1, arc_type: "normal".into(), cvn_arc: None },
            },
            arc(id, _crit, 1, "normal"),
        ];
        let unlock = |id: &str, crit: &str, ready: &str| vec![
            arc(crit, id, 1, "normal"),
            SemanticArcDto {
                source: id.into(),
                target: ready.into(),
                data: ArcDataDto {
                    weight: 1,
                    arc_type: "normal".into(),
                    cvn_arc: Some(CvnArcDto {
                        kind: "update".into(),
                        guard: None,
                        update: Some("n = n + 1".into()),
                    }),
                },
            },
            arc(id, "Mutex", 1, "normal"),
        ];

        let mut arcs = vec![];
        arcs.extend(lock("lock1", "T1_ready", "T1_crit", "unlock1"));
        arcs.extend(unlock("unlock1", "T1_crit", "T1_ready"));
        arcs.extend(lock("lock2", "T2_ready", "T2_crit", "unlock2"));
        arcs.extend(unlock("unlock2", "T2_crit", "T2_ready"));

        let mut mutex = place("Mutex", "Mutex", 1);
        mutex.data.cvn_place = Some(CvnPlaceDto {
            class: "resource".into(),
            sub: None,
            resource: Some("Mutex".into()),
            param: None,
        });

        let sem = net(
            "cvn",
            vec![
                place("T1_ready", "T1 ready", 1),
                place("T1_crit", "T1 critical", 0),
                place("T2_ready", "T2 ready", 1),
                place("T2_crit", "T2 critical", 0),
                mutex,
            ],
            vec![trans("lock1", "Lock 1"), trans("unlock1", "Unlock 1"), trans("lock2", "Lock 2"), trans("unlock2", "Unlock 2")],
            arcs,
        );
        let r = run_analysis(&sem, 5000).unwrap();
        assert_eq!(r.state_count, 7, "states");
        assert_eq!(r.edges.len(), 8, "edges");
        assert_eq!(r.deadlock_count, 1, "deadlocks (counter reaches n=2)");
        let deadlock_idx = r.states.iter().position(|s| s.deadlock).expect("a deadlock state");
        assert_eq!(r.states[deadlock_idx].marking.get("Mutex"), Some(&1));
        let dead = r.advanced.dead_transitions.expect("cvn dead transitions");
        assert!(dead.is_empty(), "all four transitions fire, got {dead:?}");
    }
}
