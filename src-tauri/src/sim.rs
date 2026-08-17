//! Interactive token-game simulation bridge. Reuses the UniPN builders from
//! `analyze` and adds clock-aware semantics for timed nets.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::analyze::{PtAnalyzer, SemanticNetDto, build_cvn, build_pt, build_timed};
use unipn::analysis::NetLike;
use unipn::cvn::{CvnExtra, CvnNet, CvnState};
use unipn::expr::Val;
use unipn::ids::{PlaceId, TransitionId};
use unipn::net::{ArcDir, Marking, State};
use unipn::timed::TimedNet;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimStateDto {
    pub marking: BTreeMap<String, usize>,
    pub time: i32,
    pub clocks: BTreeMap<String, i32>,
    pub vars: BTreeMap<String, i64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimResultDto {
    pub state: SimStateDto,
    pub enabled: Vec<String>,
    pub waiting: Vec<String>,
    pub can_advance: bool,
}

struct PtSim {
    net: PtAnalyzer,
    po: Vec<String>,
    to: Vec<String>,
    initial: Marking,
}

struct TimedSim {
    net: TimedNet,
    po: Vec<String>,
    to: Vec<String>,
    initial: Marking,
}

struct CvnSim {
    net: CvnNet,
    po: Vec<String>,
    to: Vec<String>,
    initial: Marking,
    initial_vars: BTreeMap<String, Val>,
}

enum Engine {
    Pt(PtSim),
    Timed(TimedSim),
    Cvn(CvnSim),
}

impl Engine {
    fn build(semantic: &SemanticNetDto) -> Result<Self, String> {
        match semantic.net_kind.as_str() {
            "pt" => {
                let (net, marking, po, to, reject) = build_pt(semantic)?;
                Ok(Engine::Pt(PtSim {
                    net: PtAnalyzer { net, reject },
                    po,
                    to,
                    initial: marking,
                }))
            }
            "timed" => {
                let (net, state, po, to) = build_timed(semantic)?;
                Ok(Engine::Timed(TimedSim {
                    net,
                    po,
                    to,
                    initial: state.marking,
                }))
            }
            "cvn" => {
                let (net, state, po, to) = build_cvn(semantic)?;
                Ok(Engine::Cvn(CvnSim {
                    net,
                    po,
                    to,
                    initial: state.marking,
                    initial_vars: state.extra.vars,
                }))
            }
            other => Err(format!("unsupported net kind: {other}")),
        }
    }

    // ── conversions ──

    fn marking_from_dto(&self, m: &BTreeMap<String, usize>) -> Marking {
        match self {
            Engine::Pt(s) => Marking::new(s.po.iter().map(|id| m.get(id).copied().unwrap_or(0)).collect()),
            Engine::Timed(s) => Marking::new(s.po.iter().map(|id| m.get(id).copied().unwrap_or(0)).collect()),
            Engine::Cvn(s) => Marking::new(s.po.iter().map(|id| m.get(id).copied().unwrap_or(0)).collect()),
        }
    }

    fn marking_to_dto(&self, m: &Marking) -> BTreeMap<String, usize> {
        let po = match self {
            Engine::Pt(s) => &s.po,
            Engine::Timed(s) => &s.po,
            Engine::Cvn(s) => &s.po,
        };
        let mut map = BTreeMap::new();
        for (i, id) in po.iter().enumerate() {
            map.insert(id.clone(), m.tokens(PlaceId(i)));
        }
        map
    }

    fn vars_to_dto(vars: &BTreeMap<String, Val>) -> BTreeMap<String, i64> {
        vars.iter()
            .map(|(k, v)| {
                let n = match v {
                    Val::Concrete(unipn::expr::ConcreteVal::Int(i)) => *i,
                    _ => 0,
                };
                (k.clone(), n)
            })
            .collect()
    }

    // ── ops ──

    fn initial_state(&self) -> SimStateDto {
        match self {
            Engine::Pt(s) => SimStateDto {
                marking: self.marking_to_dto(&s.initial),
                time: 0,
                clocks: BTreeMap::new(),
                vars: BTreeMap::new(),
            },
            Engine::Timed(s) => {
                let mut clocks = BTreeMap::new();
                for i in timed_structural(&s.net, &s.initial) {
                    clocks.insert(s.to[i].clone(), 0);
                }
                SimStateDto {
                    marking: self.marking_to_dto(&s.initial),
                    time: 0,
                    clocks,
                    vars: BTreeMap::new(),
                }
            }
            Engine::Cvn(s) => SimStateDto {
                marking: self.marking_to_dto(&s.initial),
                time: 0,
                clocks: BTreeMap::new(),
                vars: Self::vars_to_dto(&s.initial_vars),
            },
        }
    }

    fn result(&self, state: &SimStateDto) -> SimResultDto {
        let (enabled, waiting) = self.enabled_waiting(state);
        SimResultDto {
            state: state.clone(),
            enabled,
            waiting,
            can_advance: self.can_advance(state),
        }
    }

    fn enabled_waiting(&self, state: &SimStateDto) -> (Vec<String>, Vec<String>) {
        match self {
            Engine::Pt(s) => {
                let marking = self.marking_from_dto(&state.marking);
                let enabled = s
                    .net
                    .enabled(&marking)
                    .into_iter()
                    .filter_map(|t| s.to.get(t.index()).cloned())
                    .collect();
                (enabled, Vec::new())
            }
            Engine::Cvn(s) => {
                let cvn_state = self.cvn_state(state);
                let enabled = s
                    .net
                    .enabled(&cvn_state)
                    .into_iter()
                    .filter_map(|t| s.to.get(t.index()).cloned())
                    .collect();
                (enabled, Vec::new())
            }
            Engine::Timed(s) => {
                let marking = self.marking_from_dto(&state.marking);
                let mut enabled = Vec::new();
                let mut waiting = Vec::new();
                for i in timed_structural(&s.net, &marking) {
                    let interval = s.net.transition(TransitionId(i)).map(|t| t.kind.interval);
                    let clock = state.clocks.get(&s.to[i]).copied().unwrap_or(0);
                    match interval {
                        Some(iv) if iv.contains(clock) => enabled.push(s.to[i].clone()),
                        Some(iv) if clock < iv.effective_earliest() => waiting.push(s.to[i].clone()),
                        _ => {}
                    }
                }
                (enabled, waiting)
            }
        }
    }

    fn cvn_state(&self, state: &SimStateDto) -> CvnState {
        let marking = self.marking_from_dto(&state.marking);
        let vars = state
            .vars
            .iter()
            .map(|(k, v)| (k.clone(), Val::int(*v)))
            .collect::<BTreeMap<_, _>>();
        State::new(marking, CvnExtra { vars, domains: BTreeMap::new() })
    }

    fn fire(&self, state: &SimStateDto, transition_id: &str) -> Option<SimResultDto> {
        match self {
            Engine::Pt(s) => {
                let t_idx = s.to.iter().position(|id| id == transition_id)?;
                let t = TransitionId(t_idx);
                let marking = self.marking_from_dto(&state.marking);
                if !s.net.enabled(&marking).contains(&t) {
                    return None;
                }
                let next = s.net.fire(&marking, t)?;
                let mut next_state = state.clone();
                next_state.marking = self.marking_to_dto(&next);
                Some(self.result(&next_state))
            }
            Engine::Cvn(s) => {
                let t_idx = s.to.iter().position(|id| id == transition_id)?;
                let t = TransitionId(t_idx);
                let cvn_state = self.cvn_state(state);
                if !s.net.enabled(&cvn_state).contains(&t) {
                    return None;
                }
                let next = s.net.fire(&cvn_state, t)?;
                let mut next_state = state.clone();
                next_state.marking = self.marking_to_dto(&next.marking);
                next_state.vars = Self::vars_to_dto(&next.extra.vars);
                Some(self.result(&next_state))
            }
            Engine::Timed(s) => {
                let t_idx = s.to.iter().position(|id| id == transition_id)?;
                let t = TransitionId(t_idx);
                let marking = self.marking_from_dto(&state.marking);
                let structural = timed_structural(&s.net, &marking);
                if !structural.contains(&t_idx) {
                    return None;
                }
                let clock = state.clocks.get(transition_id).copied().unwrap_or(0);
                let interval = s.net.transition(t).map(|tr| tr.kind.interval)?;
                if !interval.contains(clock) {
                    return None;
                }
                let next = timed_fire(&s.net, &marking, t);
                let mut next_state = state.clone();
                next_state.marking = self.marking_to_dto(&next);
                let mut clocks = BTreeMap::new();
                for i in timed_structural(&s.net, &next) {
                    let id = &s.to[i];
                    clocks.insert(id.clone(), state.clocks.get(id).copied().unwrap_or(0));
                }
                next_state.clocks = clocks;
                Some(self.result(&next_state))
            }
        }
    }

    fn can_advance(&self, state: &SimStateDto) -> bool {
        match self {
            Engine::Pt(_) | Engine::Cvn(_) => false,
            Engine::Timed(s) => {
                let marking = self.marking_from_dto(&state.marking);
                timed_advance_delta(&s.net, &marking, &state.clocks, &s.to).is_some()
            }
        }
    }

    fn advance_time(&self, state: &SimStateDto) -> Option<SimResultDto> {
        match self {
            Engine::Pt(_) | Engine::Cvn(_) => None,
            Engine::Timed(s) => {
                let marking = self.marking_from_dto(&state.marking);
                let delta = timed_advance_delta(&s.net, &marking, &state.clocks, &s.to)?;
                let mut next_state = state.clone();
                next_state.time += delta;
                for clock in next_state.clocks.values_mut() {
                    *clock += delta;
                }
                Some(self.result(&next_state))
            }
        }
    }
}

fn timed_structural(net: &TimedNet, marking: &Marking) -> Vec<usize> {
    net.transitions
        .iter()
        .enumerate()
        .filter_map(|(i, _)| {
            let t = TransitionId(i);
            let ok = net.is_enabled(marking, t)
                && net
                    .arcs_of(t, ArcDir::Inhibitor)
                    .all(|a| marking.tokens(a.place) < a.weight);
            ok.then_some(i)
        })
        .collect()
}

fn timed_fire(net: &TimedNet, marking: &Marking, t: TransitionId) -> Marking {
    let mut next = net.fire(marking, t);
    for arc in net.arcs_of(t, ArcDir::Reset) {
        next.set(arc.place, 0);
    }
    next
}

fn timed_advance_delta(
    net: &TimedNet,
    marking: &Marking,
    clocks: &BTreeMap<String, i32>,
    to: &[String],
) -> Option<i32> {
    let mut delta = i32::MAX;
    for i in timed_structural(net, marking) {
        let id = &to[i];
        let clock = clocks.get(id).copied().unwrap_or(0);
        let earliest = net
            .transition(TransitionId(i))
            .map(|t| t.kind.interval.effective_earliest())
            .unwrap_or(0);
        if clock < earliest {
            delta = delta.min(earliest - clock);
        }
    }
    (delta < i32::MAX).then_some(delta.max(0))
}

// ── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sim_initial(semantic: SemanticNetDto) -> Result<SimResultDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::build(&semantic)?;
        Ok(engine.result(&engine.initial_state()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sim_fire(
    semantic: SemanticNetDto,
    state: SimStateDto,
    transition_id: String,
) -> Result<Option<SimResultDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::build(&semantic)?;
        Ok(engine.fire(&state, &transition_id))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sim_advance_time(
    semantic: SemanticNetDto,
    state: SimStateDto,
) -> Result<Option<SimResultDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::build(&semantic)?;
        Ok(engine.advance_time(&state))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analyze::{ArcDataDto, IntervalDto, SemanticArcDto, SemanticPlaceDto, SemanticTransitionDto, TransitionDataDto};

    fn place(id: &str, label: &str, tokens: usize) -> SemanticPlaceDto {
        SemanticPlaceDto {
            id: id.into(),
            data: crate::analyze::PlaceDataDto {
                label: label.into(),
                tokens,
                capacity: None,
                capacity_mode: None,
                saturate: None,
                cvn_place: None,
            },
        }
    }

    fn trans(id: &str, label: &str, interval: Option<IntervalDto>) -> SemanticTransitionDto {
        SemanticTransitionDto {
            id: id.into(),
            data: TransitionDataDto {
                label: label.into(),
                priority: None,
                interval,
                core: None,
                suspendable: None,
                cvn_kind: None,
                scope: None,
                anchors: None,
                family: None,
            },
        }
    }

    fn arc(s: &str, t: &str) -> SemanticArcDto {
        SemanticArcDto {
            source: s.into(),
            target: t.into(),
            data: ArcDataDto { weight: 1, arc_type: "normal".into(), cvn_arc: None },
        }
    }

    #[test]
    fn timed_clock_sequence() {
        let sem = SemanticNetDto {
            net_kind: "timed".into(),
            places: vec![place("load", "Job ready", 1), place("done", "Job done", 0)],
            transitions: vec![
                trans("process", "Process", Some(IntervalDto { earliest: 2.0, latest: Some(5.0), left_open: false, right_open: false })),
                trans("reset", "Reset", Some(IntervalDto { earliest: 1.0, latest: Some(3.0), left_open: false, right_open: false })),
            ],
            arcs: vec![
                arc("load", "process"),
                arc("process", "done"),
                arc("done", "reset"),
                arc("reset", "load"),
            ],
        };
        let engine = Engine::build(&sem).unwrap();
        let initial = engine.result(&engine.initial_state());
        // process structurally enabled but clock 0 < 2 → waiting
        assert_eq!(initial.enabled, Vec::<String>::new());
        assert_eq!(initial.waiting, vec!["process"]);
        assert!(initial.can_advance);

        // advance to earliest → process enabled
        let after_adv = engine.advance_time(&initial.state).expect("advance");
        assert_eq!(after_adv.state.time, 2);
        assert_eq!(after_adv.enabled, vec!["process"]);
        assert_eq!(after_adv.waiting, Vec::<String>::new());

        // fire process → done; reset waiting
        let fired = engine.fire(&after_adv.state, "process").expect("fire");
        assert_eq!(fired.state.marking.get("done"), Some(&1));
        assert_eq!(fired.waiting, vec!["reset"]);

        // advance → reset enabled
        let adv2 = engine.advance_time(&fired.state).expect("advance2");
        assert_eq!(adv2.state.time, 3);
        assert_eq!(adv2.enabled, vec!["reset"]);

        // fire reset → back to load
        let fired2 = engine.fire(&adv2.state, "reset").expect("fire2");
        assert_eq!(fired2.state.marking.get("load"), Some(&1));
        assert_eq!(fired2.state.time, 3);
    }

    #[test]
    fn pt_and_cvn_basic() {
        let pt = SemanticNetDto {
            net_kind: "pt".into(),
            places: vec![place("p1", "P1", 1), place("p2", "P2", 0)],
            transitions: vec![trans("t1", "T1", None)],
            arcs: vec![arc("p1", "t1"), arc("t1", "p2")],
        };
        let e = Engine::build(&pt).unwrap();
        let r = e.result(&e.initial_state());
        assert_eq!(r.enabled, vec!["t1"]);
        let fired = e.fire(&r.state, "t1").expect("fire");
        assert_eq!(fired.state.marking.get("p2"), Some(&1));
        assert_eq!(fired.enabled, Vec::<String>::new());

        let cvn = SemanticNetDto {
            net_kind: "cvn".into(),
            places: vec![place("a", "A", 1)],
            transitions: vec![trans("t", "T", None)],
            arcs: vec![arc("a", "t")],
        };
        let e2 = Engine::build(&cvn).unwrap();
        let r2 = e2.result(&e2.initial_state());
        assert_eq!(r2.enabled, vec!["t"]);
    }
}
