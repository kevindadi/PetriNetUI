use std::collections::HashMap;

use crate::model::*;
use quick_xml::events::Event;
use quick_xml::Reader;

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn serialize_xml(net: &PetriNet) -> String {
    let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str(&format!("<petrinet kind=\"{}\">\n", net.net_kind.as_str()));

    for n in &net.nodes {
        match &n.data {
            NodeData::Place(d) => {
                let mut attrs = format!(
                    "id=\"{}\" label=\"{}\" tokens=\"{}\"",
                    esc(&n.id),
                    esc(&d.label),
                    d.tokens
                );
                if let Some(c) = d.capacity {
                    attrs.push_str(&format!(" capacity=\"{c}\""));
                }
                if let Some(cm) = &d.capacity_mode {
                    attrs.push_str(&format!(" capacityMode=\"{cm}\""));
                }
                if d.saturate.unwrap_or(false) {
                    attrs.push_str(" saturate=\"true\"");
                }
                if let Some(cp) = &d.cvn_place {
                    if cp.class == "control" {
                        attrs.push_str(&format!(" cvnClass=\"control\" cvnSub=\"{}\"", esc(&cp.sub.clone().unwrap_or_default())));
                    } else {
                        attrs.push_str(&format!(" cvnClass=\"resource\" cvnResource=\"{}\"", esc(&cp.resource.clone().unwrap_or_default())));
                        if let Some(p) = cp.param {
                            attrs.push_str(&format!(" cvnParam=\"{p}\""));
                        }
                    }
                }
                out.push_str(&format!(
                    "  <place {attrs}><graphics x=\"{}\" y=\"{}\"/></place>\n",
                    n.position.x, n.position.y
                ));
            }
            NodeData::Transition(d) => {
                let mut attrs = format!("id=\"{}\" label=\"{}\"", esc(&n.id), esc(&d.label));
                if let Some(p) = d.priority {
                    attrs.push_str(&format!(" priority=\"{p}\""));
                }
                if let Some(iv) = &d.interval {
                    attrs.push_str(&format!(
                        " intervalEarliest=\"{}\" intervalLatest=\"{}\" intervalLeft=\"{}\" intervalRight=\"{}\"",
                        iv.earliest,
                        iv.latest.map(|l| l.to_string()).unwrap_or_default(),
                        if iv.left_open { 1 } else { 0 },
                        if iv.right_open { 1 } else { 0 }
                    ));
                }
                if let Some(c) = d.core {
                    attrs.push_str(&format!(" core=\"{c}\""));
                }
                if d.suspendable.unwrap_or(false) {
                    attrs.push_str(" suspendable=\"true\"");
                }
                if let Some(k) = &d.cvn_kind {
                    attrs.push_str(&format!(" cvnKind=\"{}\"", esc(k)));
                }
                if let Some(s) = &d.scope {
                    attrs.push_str(&format!(" scope=\"{}\"", esc(s)));
                }
                if let Some(a) = &d.anchors {
                    attrs.push_str(&format!(" anchors=\"{}\"", esc(a)));
                }
                if let Some(f) = &d.family {
                    attrs.push_str(&format!(" family=\"{}\"", esc(f)));
                }
                out.push_str(&format!(
                    "  <transition {attrs}><graphics x=\"{}\" y=\"{}\"/></transition>\n",
                    n.position.x, n.position.y
                ));
            }
        }
    }

    for e in &net.edges {
        let mut attrs = format!(
            "id=\"{}\" source=\"{}\" target=\"{}\" weight=\"{}\" type=\"{}\"",
            esc(&e.id),
            esc(&e.source),
            esc(&e.target),
            e.data.weight,
            e.data.arc_type.as_str()
        );
        if let Some(c) = &e.data.cvn_arc {
            match c.kind.as_str() {
                "guard" => attrs.push_str(&format!(" guard=\"{}\"", esc(&c.guard.clone().unwrap_or_default()))),
                "update" => attrs.push_str(&format!(" update=\"{}\"", esc(&c.update.clone().unwrap_or_default()))),
                _ => attrs.push_str(" cvnArc=\"plain\""),
            }
        }
        out.push_str(&format!("  <arc {attrs}/>\n"));
    }

    out.push_str("</petrinet>\n");
    out
}

fn attr(el: &quick_xml::events::BytesStart, name: &str) -> Option<String> {
    for a in el.attributes().with_checks(false).flatten() {
        let key = String::from_utf8_lossy(a.key.as_ref()).to_string();
        if key == name {
            let v = a.unescape_value().ok().map(|v| v.to_string()).unwrap_or_default();
            return Some(v);
        }
    }
    None
}

fn int_attr(el: &quick_xml::events::BytesStart, name: &str) -> Option<i64> {
    attr(el, name).and_then(|v| v.parse::<i64>().ok())
}

pub fn parse_xml(text: &str) -> Result<(PetriNet, HashMap<String, Position>), String> {
    let mut reader = Reader::from_str(text);
    reader.config_mut().trim_text(true);

    let mut net = PetriNet::default();
    let mut positions: HashMap<String, Position> = HashMap::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match name.as_str() {
                    "petrinet" => {
                        net.net_kind = NetKind::from_str(&attr(&e, "kind").unwrap_or_default());
                    }
                    "place" => {
                        let id = attr(&e, "id").unwrap_or_default();
                        let mut data = PlaceData {
                            kind: "place".into(),
                            label: attr(&e, "label").unwrap_or_else(|| id.clone()),
                            tokens: int_attr(&e, "tokens").unwrap_or(0).max(0) as usize,
                            capacity: None,
                            capacity_mode: None,
                            saturate: None,
                            cvn_place: None,
                        };
                        if let Some(c) = int_attr(&e, "capacity") {
                            data.capacity = Some(c.max(0) as usize);
                        }
                        data.capacity_mode = attr(&e, "capacityMode");
                        if attr(&e, "saturate").as_deref() == Some("true") {
                            data.saturate = Some(true);
                        }
                        if let Some(cls) = attr(&e, "cvnClass") {
                            if cls == "control" {
                                data.cvn_place = Some(CvnPlace {
                                    class: "control".into(),
                                    sub: attr(&e, "cvnSub"),
                                    resource: None,
                                    param: None,
                                });
                            } else {
                                data.cvn_place = Some(CvnPlace {
                                    class: "resource".into(),
                                    sub: None,
                                    resource: attr(&e, "cvnResource").or_else(|| Some("Mutex".into())),
                                    param: int_attr(&e, "cvnParam").map(|p| p.max(1) as usize),
                                });
                            }
                        }
                        let node = Node {
                            id,
                            position: Position { x: 0.0, y: 0.0 },
                            data: NodeData::Place(data),
                            selected: false,
                        };
                        net.nodes.push(node);
                    }
                    "transition" => {
                        let id = attr(&e, "id").unwrap_or_default();
                        let mut data = TransitionData {
                            kind: "transition".into(),
                            label: attr(&e, "label").unwrap_or_else(|| id.clone()),
                            priority: int_attr(&e, "priority").map(|v| v as i32),
                            interval: None,
                            core: int_attr(&e, "core").map(|v| v as i32),
                            suspendable: (attr(&e, "suspendable").as_deref() == Some("true")).then_some(true),
                            cvn_kind: attr(&e, "cvnKind"),
                            scope: attr(&e, "scope"),
                            anchors: attr(&e, "anchors"),
                            family: attr(&e, "family"),
                        };
                        if int_attr(&e, "intervalEarliest").is_some() {
                            data.interval = Some(TimeInterval {
                                earliest: int_attr(&e, "intervalEarliest").unwrap_or(0) as f64,
                                latest: attr(&e, "intervalLatest")
                                    .and_then(|v| if v.is_empty() { None } else { v.parse::<f64>().ok() }),
                                left_open: attr(&e, "intervalLeft").as_deref() == Some("1"),
                                right_open: attr(&e, "intervalRight").as_deref() == Some("1"),
                            });
                        }
                        let node = Node {
                            id,
                            position: Position { x: 0.0, y: 0.0 },
                            data: NodeData::Transition(data),
                            selected: false,
                        };
                        net.nodes.push(node);
                    }
                    "arc" => {
                        let id = attr(&e, "id").unwrap_or_default();
                        let source = attr(&e, "source").unwrap_or_default();
                        let target = attr(&e, "target").unwrap_or_default();
                        let weight = int_attr(&e, "weight").unwrap_or(1).max(1) as usize;
                        let arc_type = ArcType::from_str(&attr(&e, "type").unwrap_or_default());
                        let guard = attr(&e, "guard");
                        let update = attr(&e, "update");
                        let plain = attr(&e, "cvnArc").as_deref() == Some("plain");
                        let cvn_arc = if let Some(g) = guard {
                            Some(CvnArc { kind: "guard".into(), guard: Some(g), update: None })
                        } else if let Some(u) = update {
                            Some(CvnArc { kind: "update".into(), guard: None, update: Some(u) })
                        } else if plain {
                            Some(CvnArc { kind: "plain".into(), guard: None, update: None })
                        } else {
                            None
                        };
                        net.edges.push(Edge {
                            id,
                            source,
                            target,
                            data: ArcData { weight, arc_type, cvn_arc },
                            selected: false,
                        });
                    }
                    "graphics" => {
                        let id = attr(&e, "id");
                        let x = int_attr(&e, "x").unwrap_or(0) as f32;
                        let y = int_attr(&e, "y").unwrap_or(0) as f32;
                        if let Some(id) = id {
                            positions.insert(id, Position { x, y });
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    for n in net.nodes.iter_mut() {
        if let Some(p) = positions.get(&n.id) {
            n.position = p.clone();
        }
    }

    Ok((net, positions))
}