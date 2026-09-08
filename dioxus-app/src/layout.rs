use std::collections::HashMap;

use crate::model::{Edge, Node, Position};

/// Simple force-directed layout (Fruchterman–Reingold style) that keeps
/// connected nodes close. Replaces the JS Cytoscape "cose" layout.
pub fn compute_layout(nodes: &[Node], edges: &[Edge], opts: &LayoutOptions) -> HashMap<String, Position> {
    let mut pos: HashMap<String, Position> = HashMap::new();
    for n in nodes {
        pos.insert(n.id.clone(), Position { x: n.position.x, y: n.position.y });
    }
    if nodes.is_empty() {
        return pos;
    }

    let area = opts.area;
    let k = (area / nodes.len().max(1) as f32).sqrt();
    let repulsion = opts.repulsion;
    let ideal_len = opts.ideal_edge_length;

    let mut velocity: HashMap<String, (f32, f32)> = HashMap::new();
    for n in nodes {
        velocity.insert(n.id.clone(), (0.0, 0.0));
    }

    for _iter in 0..opts.iterations {
        let mut disp: HashMap<String, (f32, f32)> = HashMap::new();
        for n in nodes {
            disp.insert(n.id.clone(), (0.0, 0.0));
        }

        // repulsive forces
        for i in 0..nodes.len() {
            for j in (i + 1)..nodes.len() {
                let a = &nodes[i];
                let b = &nodes[j];
                let (dx, dy) = delta(&pos, &a.id, &b.id);
                let d2 = (dx * dx + dy * dy).max(0.01);
                let d = d2.sqrt();
                let force = repulsion / d2;
                let fx = dx / d * force;
                let fy = dy / d * force;
                disp.entry(a.id.clone()).or_default().0 -= fx;
                disp.entry(a.id.clone()).or_default().1 -= fy;
                disp.entry(b.id.clone()).or_default().0 += fx;
                disp.entry(b.id.clone()).or_default().1 += fy;
            }
        }

        // attractive forces along edges
        for e in edges {
            let (dx, dy) = delta(&pos, &e.source, &e.target);
            let d = (dx * dx + dy * dy).sqrt().max(0.01);
            let force = (d * d) / (k * ideal_len);
            let fx = dx / d * force;
            let fy = dy / d * force;
            disp.entry(e.source.clone()).or_default().0 += fx;
            disp.entry(e.source.clone()).or_default().1 += fy;
            disp.entry(e.target.clone()).or_default().0 -= fx;
            disp.entry(e.target.clone()).or_default().1 -= fy;
        }

        // apply with temperature cooling
        let temp = opts.temperature * (1.0 - _iter as f32 / opts.iterations as f32);
        for n in nodes {
            let (dx, dy) = disp[&n.id];
            let d = (dx * dx + dy * dy).sqrt().max(0.01);
            let mx = dx / d * temp.min(d);
            let my = dy / d * temp.min(d);
            let v = velocity.entry(n.id.clone()).or_insert((0.0, 0.0));
            v.0 = v.0 * 0.85 + mx * 0.15;
            v.1 = v.1 * 0.85 + my * 0.15;
            if let Some(p) = pos.get_mut(&n.id) {
                p.x += v.0;
                p.y += v.1;
            }
        }
    }

    normalize_to_gap(&mut pos, 130.0);
    pos
}

fn delta(pos: &HashMap<String, Position>, a: &str, b: &str) -> (f32, f32) {
    let pa = pos.get(a).cloned().unwrap_or(Position { x: 0.0, y: 0.0 });
    let pb = pos.get(b).cloned().unwrap_or(Position { x: 0.0, y: 0.0 });
    (pa.x - pb.x, pa.y - pb.y)
}

fn normalize_to_gap(pos: &mut HashMap<String, Position>, gap: f32) {
    if pos.is_empty() {
        return;
    }
    let min_x = pos.values().map(|p| p.x).fold(f32::INFINITY, f32::min);
    let min_y = pos.values().map(|p| p.y).fold(f32::INFINITY, f32::min);
    for p in pos.values_mut() {
        p.x -= min_x;
        p.y -= min_y;
    }
    let ids: Vec<String> = pos.keys().cloned().collect();
    let mut min_gap = f32::INFINITY;
    for i in 0..ids.len() {
        for j in (i + 1)..ids.len() {
            let d = dist(&pos[&ids[i]], &pos[&ids[j]]);
            if d > 0.0 && d < min_gap {
                min_gap = d;
            }
        }
    }
    if min_gap > 0.0 && min_gap < gap {
        let scale = gap / min_gap;
        for p in pos.values_mut() {
            p.x *= scale;
            p.y *= scale;
        }
    }
}

fn dist(a: &Position, b: &Position) -> f32 {
    ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).sqrt()
}

pub struct LayoutOptions {
    pub iterations: usize,
    pub temperature: f32,
    pub repulsion: f32,
    pub ideal_edge_length: f32,
    pub area: f32,
}

impl Default for LayoutOptions {
    fn default() -> Self {
        LayoutOptions {
            iterations: 200,
            temperature: 400.0,
            repulsion: 60000.0,
            ideal_edge_length: 260.0,
            area: 400000.0,
        }
    }
}