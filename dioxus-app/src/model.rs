use std::sync::atomic::{AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetKind {
    Pt,
    Timed,
    Cvn,
}

impl NetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            NetKind::Pt => "pt",
            NetKind::Timed => "timed",
            NetKind::Cvn => "cvn",
        }
    }
    pub fn from_str(s: &str) -> NetKind {
        match s {
            "timed" => NetKind::Timed,
            "cvn" => NetKind::Cvn,
            _ => NetKind::Pt,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArcType {
    Normal,
    Reset,
    Inhibitor,
}

impl ArcType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ArcType::Normal => "normal",
            ArcType::Reset => "reset",
            ArcType::Inhibitor => "inhibitor",
        }
    }
    pub fn from_str(s: &str) -> ArcType {
        match s {
            "reset" => ArcType::Reset,
            "inhibitor" => ArcType::Inhibitor,
            _ => ArcType::Normal,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TimeInterval {
    pub earliest: f64,
    pub latest: Option<f64>,
    pub left_open: bool,
    pub right_open: bool,
}

impl Default for TimeInterval {
    fn default() -> Self {
        TimeInterval { earliest: 0.0, latest: None, left_open: false, right_open: false }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvnPlace {
    pub class: String,
    pub sub: Option<String>,
    pub resource: Option<String>,
    pub param: Option<usize>,
}

impl Default for CvnPlace {
    fn default() -> Self {
        CvnPlace { class: "control".into(), sub: Some("Statement".into()), resource: None, param: None }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceData {
    pub kind: String,
    pub label: String,
    pub tokens: usize,
    pub capacity: Option<usize>,
    pub capacity_mode: Option<String>,
    pub saturate: Option<bool>,
    pub cvn_place: Option<CvnPlace>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionData {
    pub kind: String,
    pub label: String,
    pub priority: Option<i32>,
    pub interval: Option<TimeInterval>,
    pub core: Option<i32>,
    pub suspendable: Option<bool>,
    pub cvn_kind: Option<String>,
    pub scope: Option<String>,
    pub anchors: Option<String>,
    pub family: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CvnArc {
    #[serde(rename = "type")]
    pub kind: String,
    pub guard: Option<String>,
    pub update: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcData {
    pub weight: usize,
    pub arc_type: ArcType,
    pub cvn_arc: Option<CvnArc>,
}

impl Default for ArcData {
    fn default() -> Self {
        ArcData { weight: 1, arc_type: ArcType::Normal, cvn_arc: None }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NodeData {
    Place(PlaceData),
    Transition(TransitionData),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Node {
    pub id: String,
    pub position: Position,
    pub data: NodeData,
    pub selected: bool,
}

impl Node {
    pub fn is_place(&self) -> bool {
        matches!(self.data, NodeData::Place(_))
    }
    pub fn place(&self) -> Option<&PlaceData> {
        match &self.data {
            NodeData::Place(d) => Some(d),
            _ => None,
        }
    }
    pub fn place_mut(&mut self) -> Option<&mut PlaceData> {
        match &mut self.data {
            NodeData::Place(d) => Some(d),
            _ => None,
        }
    }
    pub fn transition(&self) -> Option<&TransitionData> {
        match &self.data {
            NodeData::Transition(d) => Some(d),
            _ => None,
        }
    }
    pub fn transition_mut(&mut self) -> Option<&mut TransitionData> {
        match &mut self.data {
            NodeData::Transition(d) => Some(d),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub data: ArcData,
    pub selected: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PetriNet {
    pub net_kind: NetKind,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

impl Default for PetriNet {
    fn default() -> Self {
        PetriNet { net_kind: NetKind::Pt, nodes: Vec::new(), edges: Vec::new() }
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

static ID_COUNTER: AtomicUsize = AtomicUsize::new(0);

pub fn next_id(prefix: &str) -> String {
    let n = ID_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    format!("{prefix}_{n}")
}

pub fn bump_id_counter(min: usize) {
    ID_COUNTER.fetch_max(min, Ordering::Relaxed);
}

pub fn bump_id_counter_for_ids(ids: &[String]) {
    let mut max = 0;
    for id in ids {
        if let Some(pos) = id.rfind('_') {
            if let Ok(n) = id[pos + 1..].parse::<usize>() {
                if n > max {
                    max = n;
                }
            }
        }
    }
    if max > 0 {
        bump_id_counter(max);
    }
}

pub fn strip_net_attrs(nk: NetKind, data: NodeData) -> NodeData {
    match data {
        NodeData::Place(d) => {
            let mut base = PlaceData {
                kind: "place".into(),
                label: d.label,
                tokens: d.tokens,
                capacity: None,
                capacity_mode: None,
                saturate: None,
                cvn_place: None,
            };
            match nk {
                NetKind::Pt => {
                    base.capacity = d.capacity;
                    base.capacity_mode = Some(d.capacity_mode.unwrap_or_else(|| "reject".into()));
                }
                NetKind::Timed => {
                    base.capacity = d.capacity;
                    base.saturate = Some(d.saturate.unwrap_or(false));
                }
                NetKind::Cvn => {
                    base.cvn_place = Some(d.cvn_place.unwrap_or_default());
                }
            }
            NodeData::Place(base)
        }
        NodeData::Transition(d) => {
            let mut base = TransitionData {
                kind: "transition".into(),
                label: d.label,
                priority: None,
                interval: None,
                core: None,
                suspendable: None,
                cvn_kind: None,
                scope: None,
                anchors: None,
                family: None,
            };
            match nk {
                NetKind::Pt => {
                    base.priority = d.priority;
                }
                NetKind::Timed => {
                    base.priority = d.priority;
                    base.interval = Some(d.interval.unwrap_or_default());
                    base.core = Some(d.core.unwrap_or(0));
                    base.suspendable = Some(d.suspendable.unwrap_or(false));
                }
                NetKind::Cvn => {
                    base.cvn_kind = Some(d.cvn_kind.unwrap_or_else(|| "Sequential".into()));
                    base.scope = d.scope;
                    base.anchors = Some(d.anchors.unwrap_or_default());
                    base.family = d.family;
                }
            }
            NodeData::Transition(base)
        }
    }
}

pub fn create_place(x: f32, y: f32, nk: NetKind) -> Node {
    let id = next_id("p");
    let data = NodeData::Place(PlaceData {
        kind: "place".into(),
        label: format!("P{id}"),
        tokens: 0,
        capacity: None,
        capacity_mode: None,
        saturate: None,
        cvn_place: None,
    });
    Node { id, position: Position { x, y }, data: strip_net_attrs(nk, data), selected: false }
}

pub fn create_transition(x: f32, y: f32, nk: NetKind) -> Node {
    let id = next_id("t");
    let data = NodeData::Transition(TransitionData {
        kind: "transition".into(),
        label: format!("T{id}"),
        priority: None,
        interval: None,
        core: None,
        suspendable: None,
        cvn_kind: None,
        scope: None,
        anchors: None,
        family: None,
    });
    Node { id, position: Position { x, y }, data: strip_net_attrs(nk, data), selected: false }
}

pub fn create_arc(source: &str, target: &str, arc_type: ArcType, weight: usize) -> Edge {
    let id = next_id("a");
    let data = ArcData { weight, arc_type, cvn_arc: None };
    Edge { id, source: source.into(), target: target.into(), data, selected: false }
}

pub fn default_net() -> PetriNet {
    let mut p1 = create_place(150.0, 150.0, NetKind::Pt);
    p1.place_mut().map(|d| d.tokens = 1);
    let t1 = create_transition(330.0, 150.0, NetKind::Pt);
    let mut p2 = create_place(510.0, 150.0, NetKind::Pt);
    p2.place_mut().map(|d| d.label = "P2".into());
    let a1 = create_arc(&p1.id, &t1.id, ArcType::Normal, 1);
    let a2 = create_arc(&t1.id, &p2.id, ArcType::Normal, 1);
    PetriNet {
        net_kind: NetKind::Pt,
        nodes: vec![p1, t1, p2],
        edges: vec![a1, a2],
    }
}

// ── to backend DTO ─────────────────────────────────────────────────────────

pub fn to_semantic(net: &PetriNet) -> backend::SemanticNetDto {
    let places = net
        .nodes
        .iter()
        .filter(|n| n.is_place())
        .map(|n| backend::SemanticPlaceDto {
            id: n.id.clone(),
            data: place_to_dto(n.place().unwrap()),
        })
        .collect();
    let transitions = net
        .nodes
        .iter()
        .filter(|n| !n.is_place())
        .map(|n| backend::SemanticTransitionDto {
            id: n.id.clone(),
            data: trans_to_dto(n.transition().unwrap()),
        })
        .collect();
    let arcs = net
        .edges
        .iter()
        .map(|e| backend::SemanticArcDto {
            source: e.source.clone(),
            target: e.target.clone(),
            data: arc_to_dto(&e.data),
        })
        .collect();
    backend::SemanticNetDto { net_kind: net.net_kind.as_str().into(), places, transitions, arcs }
}

pub fn place_to_dto(d: &PlaceData) -> backend::PlaceDataDto {
    backend::PlaceDataDto {
        label: d.label.clone(),
        tokens: d.tokens,
        capacity: d.capacity,
        capacity_mode: d.capacity_mode.clone(),
        saturate: d.saturate,
        cvn_place: d.cvn_place.clone().map(|c| backend::CvnPlaceDto {
            class: c.class,
            sub: c.sub,
            resource: c.resource,
            param: c.param,
        }),
    }
}

pub fn trans_to_dto(d: &TransitionData) -> backend::TransitionDataDto {
    backend::TransitionDataDto {
        label: d.label.clone(),
        priority: d.priority,
        interval: d.interval.clone().map(|iv| backend::IntervalDto {
            earliest: iv.earliest,
            latest: iv.latest,
            left_open: iv.left_open,
            right_open: iv.right_open,
        }),
        core: d.core,
        suspendable: d.suspendable,
        cvn_kind: d.cvn_kind.clone(),
        scope: d.scope.clone(),
        anchors: d.anchors.clone(),
        family: d.family.clone(),
    }
}

pub fn arc_to_dto(d: &ArcData) -> backend::ArcDataDto {
    backend::ArcDataDto {
        weight: d.weight,
        arc_type: d.arc_type.as_str().into(),
        cvn_arc: d.cvn_arc.clone().map(|c| backend::CvnArcDto {
            kind: c.kind,
            guard: c.guard,
            update: c.update,
        }),
    }
}

use crate::backend;

// ── AI net conversion ──────────────────────────────────────────────────────

pub fn ai_net_to_petri_net(v: &serde_json::Value, nk: NetKind) -> PetriNet {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut id_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    if let Some(places) = v.get("places").and_then(|a| a.as_array()) {
        for p in places {
            let orig = p.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let node_id = if orig.is_empty() { next_id("p") } else { orig.clone() };
            id_map.insert(orig, node_id.clone());
            let label = p.get("label").and_then(|x| x.as_str()).unwrap_or(&node_id).to_string();
            let tokens = p.get("tokens").and_then(|x| x.as_f64()).unwrap_or(0.0).max(0.0).floor() as usize;
            let x = p.get("x").and_then(|x| x.as_f64()).unwrap_or(100.0) as f32;
            let y = p.get("y").and_then(|x| x.as_f64()).unwrap_or(100.0) as f32;
            let data = PlaceData {
                kind: "place".into(),
                label,
                tokens,
                capacity: p.get("capacity").and_then(|x| x.as_f64()).map(|c| c as usize),
                capacity_mode: p.get("capacityMode").and_then(|x| x.as_str()).map(|s| s.into()),
                saturate: p.get("saturate").and_then(|x| x.as_bool()),
                cvn_place: p.get("cvnPlace").map(|c| parse_cvn_place(c)),
            };
            nodes.push(Node { id: node_id, position: Position { x, y }, data: strip_net_attrs(nk, NodeData::Place(data)), selected: false });
        }
    }

    if let Some(trans) = v.get("transitions").and_then(|a| a.as_array()) {
        for tr in trans {
            let orig = tr.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let node_id = if orig.is_empty() { next_id("t") } else { orig.clone() };
            id_map.insert(orig, node_id.clone());
            let label = tr.get("label").and_then(|x| x.as_str()).unwrap_or(&node_id).to_string();
            let x = tr.get("x").and_then(|x| x.as_f64()).unwrap_or(100.0) as f32;
            let y = tr.get("y").and_then(|x| x.as_f64()).unwrap_or(100.0) as f32;
            let data = TransitionData {
                kind: "transition".into(),
                label,
                priority: tr.get("priority").and_then(|x| x.as_f64()).map(|p| p as i32),
                interval: tr.get("interval").map(parse_interval),
                core: tr.get("core").and_then(|x| x.as_f64()).map(|c| c as i32),
                suspendable: tr.get("suspendable").and_then(|x| x.as_bool()),
                cvn_kind: tr.get("cvnKind").and_then(|x| x.as_str()).map(|s| s.into()),
                scope: tr.get("scope").and_then(|x| x.as_str()).map(|s| s.into()),
                anchors: tr.get("anchors").and_then(|x| x.as_str()).map(|s| s.into()),
                family: tr.get("family").and_then(|x| x.as_str()).map(|s| s.into()),
            };
            nodes.push(Node { id: node_id, position: Position { x, y }, data: strip_net_attrs(nk, NodeData::Transition(data)), selected: false });
        }
    }

    if let Some(arcs) = v.get("arcs").and_then(|a| a.as_array()) {
        for a in arcs {
            let from = a.get("from").and_then(|x| x.as_str()).and_then(|s| id_map.get(s).cloned());
            let to = a.get("to").and_then(|x| x.as_str()).and_then(|s| id_map.get(s).cloned());
            let (Some(source), Some(target)) = (from, to) else { continue };
            if source == target {
                continue;
            }
            let s_is_place = nodes.iter().find(|n| n.id == source).map(|n| n.is_place()).unwrap_or(false);
            let t_is_place = nodes.iter().find(|n| n.id == target).map(|n| n.is_place()).unwrap_or(false);
            if s_is_place == t_is_place {
                continue;
            }
            let weight = a.get("weight").and_then(|x| x.as_f64()).unwrap_or(1.0).max(1.0).floor() as usize;
            let arc_type = ArcType::from_str(a.get("type").and_then(|x| x.as_str()).unwrap_or("normal"));
            let cvn_arc = if nk == NetKind::Cvn {
                Some(parse_cvn_arc(a.get("cvnArc")))
            } else {
                None
            };
            let mut e = create_arc(&source, &target, arc_type, weight);
            e.data.cvn_arc = cvn_arc;
            edges.push(e);
        }
    }

    PetriNet { net_kind: nk, nodes, edges }
}

fn parse_cvn_place(v: &serde_json::Value) -> CvnPlace {
    if v.is_null() {
        return CvnPlace::default();
    }
    CvnPlace {
        class: v.get("class").and_then(|x| x.as_str()).unwrap_or("control").to_string(),
        sub: v.get("sub").and_then(|x| x.as_str()).map(|s| s.to_string()),
        resource: v.get("resource").and_then(|x| x.as_str()).map(|s| s.to_string()),
        param: v.get("param").and_then(|x| x.as_f64()).map(|p| p as usize),
    }
}

fn parse_cvn_arc(v: Option<&serde_json::Value>) -> CvnArc {
    let v = v.unwrap_or(&serde_json::Value::Null);
    if v.is_null() {
        return CvnArc { kind: "plain".into(), guard: None, update: None };
    }
    let kind = v.get("type").and_then(|x| x.as_str()).unwrap_or("plain").to_string();
    CvnArc {
        kind,
        guard: v.get("guard").and_then(|x| x.as_str()).map(|s| s.to_string()),
        update: v.get("update").and_then(|x| x.as_str()).map(|s| s.to_string()),
    }
}

fn parse_interval(v: &serde_json::Value) -> TimeInterval {
    TimeInterval {
        earliest: v.get("earliest").and_then(|x| x.as_f64()).unwrap_or(0.0),
        latest: v.get("latest").and_then(|x| if x.is_null() { None } else { x.as_f64() }),
        left_open: v.get("leftOpen").and_then(|x| x.as_bool()).unwrap_or(false),
        right_open: v.get("rightOpen").and_then(|x| x.as_bool()).unwrap_or(false),
    }
}
