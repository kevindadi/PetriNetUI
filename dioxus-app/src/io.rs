use crate::model::*;
use std::path::PathBuf;

pub fn save_dialog(default_name: &str) -> Option<PathBuf> {
    rfd::FileDialog::new()
        .add_filter("Petri Net (XML)", &["xml"])
        .set_file_name(default_name)
        .save_file()
}

pub fn open_dialog() -> Option<PathBuf> {
    rfd::FileDialog::new()
        .add_filter("Petri Net", &["xml", "json"])
        .pick_file()
}

pub fn write_file(path: &PathBuf, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

pub fn read_file(path: &PathBuf) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn json_to_net(text: &str) -> Result<PetriNet, String> {
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let nk = NetKind::from_str(v.get("netKind").and_then(|k| k.as_str()).unwrap_or("pt"));

    let mut nodes = Vec::new();
    if let Some(arr) = v.get("nodes").and_then(|a| a.as_array()) {
        for item in arr {
            let id = item.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string();
            let t = item.get("type").and_then(|x| x.as_str()).unwrap_or_default().to_string();
            let x = item["position"]["x"].as_f64().unwrap_or(0.0) as f32;
            let y = item["position"]["y"].as_f64().unwrap_or(0.0) as f32;
            let data = item.get("data").cloned().unwrap_or(serde_json::json!({}));
            let node = if t == "place" {
                let d: PlaceData = serde_json::from_value(data).map_err(|e| format!("bad place {id}: {e}"))?;
                Node {
                    id,
                    position: Position { x, y },
                    data: NodeData::Place(d),
                    selected: false,
                }
            } else {
                let d: TransitionData = serde_json::from_value(data).map_err(|e| format!("bad transition {id}: {e}"))?;
                Node {
                    id,
                    position: Position { x, y },
                    data: NodeData::Transition(d),
                    selected: false,
                }
            };
            nodes.push(node);
        }
    }

    let mut edges = Vec::new();
    if let Some(arr) = v.get("edges").and_then(|a| a.as_array()) {
        for item in arr {
            let id = item.get("id").and_then(|x| x.as_str()).unwrap_or_default().to_string();
            let source = item.get("source").and_then(|x| x.as_str()).unwrap_or_default().to_string();
            let target = item.get("target").and_then(|x| x.as_str()).unwrap_or_default().to_string();
            let data: ArcData = item
                .get("data")
                .cloned()
                .map(|d| serde_json::from_value(d).unwrap_or_default())
                .unwrap_or_default();
            edges.push(Edge { id, source, target, data, selected: false });
        }
    }

    Ok(PetriNet { net_kind: nk, nodes, edges })
}

pub fn semantic_json(net: &PetriNet) -> String {
    serde_json::to_string_pretty(&crate::model::to_semantic(net)).unwrap_or_default()
}