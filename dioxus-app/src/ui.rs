use std::f32::consts::PI;

use dioxus::prelude::*;
use keyboard_types::{Key, Modifiers};

use crate::ai::{self, ChatTurn};
use crate::examples;
use crate::i18n::T;
use crate::io;
use crate::model::*;
use crate::state::*;
use dioxus::html::input_data::MouseButton;

// ── helpers ────────────────────────────────────────────────────────────────

fn t_of(state: AppState) -> T<'static> {
    T::new(state.lang())
}

fn client_xy(evt: &MouseEvent) -> (f64, f64) {
    let p = evt.client_coordinates();
    (p.x, p.y)
}

fn client_to_local(state: AppState, cx: f64, cy: f64) -> (f32, f32) {
    let r = state.svg_rect().unwrap_or((0.0, 0.0, 1000.0, 700.0));
    ((cx - r.0) as f32, (cy - r.1) as f32)
}

fn client_to_world(state: AppState, cx: f64, cy: f64) -> (f32, f32) {
    let (sx, sy) = client_to_local(state, cx, cy);
    let view = state.view();
    (((sx - view.offset_x) / view.zoom), ((sy - view.offset_y) / view.zoom))
}

fn sim_tokens(state: &AppState, place_id: &str, fallback: usize) -> String {
    if state.simulating() {
        if let Some(sim) = state.sim_state() {
            if let Some(t) = sim.marking.get(place_id) {
                return t.to_string();
            }
        }
    }
    fallback.to_string()
}

fn node_at(state: AppState, wx: f32, wy: f32) -> Option<String> {
    let net = state.net();
    net.nodes.iter().find(|n| match &n.data {
        NodeData::Place(_) => {
            let dx = wx - n.position.x;
            let dy = wy - n.position.y;
            dx * dx + dy * dy <= PLACE_R * PLACE_R
        }
        NodeData::Transition(_) => {
            (wx - n.position.x).abs() <= TRANS_W / 2.0 && (wy - n.position.y).abs() <= TRANS_H / 2.0
        }
    }).map(|n| n.id.clone())
}

fn create_arc_between(mut state: AppState, source: &str, target: &str) {
    let net = state.net();
    let s = net.nodes.iter().find(|n| n.id == source);
    let t = net.nodes.iter().find(|n| n.id == target);
    if let (Some(s), Some(t)) = (s, t) {
        if s.is_place() == t.is_place() {
            return;
        }
        if net.edges.iter().any(|e| e.source == source && e.target == target) {
            return;
        }
    } else {
        return;
    }
    commit(state);
    let arc_type = state.arc_type();
    let mut e = create_arc(source, target, arc_type, 1);
    if state.net().net_kind == NetKind::Cvn {
        e.data.cvn_arc = Some(CvnArc { kind: "plain".into(), guard: None, update: None });
    }
    state.net.write().edges.push(e);
    state.sim_open.set(false);
    state.status_msg.set(String::new());
}

fn handle_arc_click(mut state: AppState, id: &str, cx: f64, cy: f64) {
    match state.pending_arc().clone() {
        None => {
            let (wx, wy) = client_to_world(state, cx, cy);
            let t = t_of(state);
            state.pending_arc.set(Some(ArcDraft {
                source: id.to_string(),
                from_x: wx,
                from_y: wy,
                to_x: wx,
                to_y: wy,
            }));
            state.status_msg.set(t.get("arcSourceHint").to_string());
        }
        Some(draft) => {
            if draft.source == id {
                state.pending_arc.set(None);
                state.status_msg.set(String::new());
                return;
            }
            create_arc_between(state, &draft.source, id);
            state.pending_arc.set(None);
        }
    }
}

fn node_mousedown(mut state: AppState, evt: MouseEvent, id: String) {
    evt.stop_propagation();
    let (cx, cy) = client_xy(&evt);
    if state.tool() == Tool::Arc {
        handle_arc_click(state, &id, cx, cy);
        return;
    }
let node = state.net().nodes.iter().find(|n| n.id == id).cloned();
    let Some(node) = node else { return };
    select_node(state, &id);
    commit(state);
    state.drag.set(DragState::Node {
        id,
        start_client: (cx, cy),
        start_pos: node.position,
    });
}

fn handle_mousedown(mut state: AppState, evt: MouseEvent, id: String) {
    evt.stop_propagation();
    let (cx, cy) = client_xy(&evt);
    let (wx, wy) = client_to_world(state, cx, cy);
    state.pending_arc.set(Some(ArcDraft {
        source: id.clone(),
        from_x: wx,
        from_y: wy,
        to_x: wx,
        to_y: wy,
    }));
    state.drag.set(DragState::ArcFromNode { source: id, start: (wx, wy) });
}

fn canvas_mousedown(mut state: AppState, evt: MouseEvent) {
    let (cx, cy) = client_xy(&evt);
    if state.tool() == Tool::Arc {
        state.pending_arc.set(None);
        state.status_msg.set(String::new());
        return;
    }
    let button = evt.trigger_button();
    if state.select_mode() && button == Some(MouseButton::Primary) {
        let (wx, wy) = client_to_world(state, cx, cy);
        state.drag.set(DragState::BoxSelect { start: (wx, wy), cur: (wx, wy) });
        return;
    }
    let view = state.view();
    state.drag.set(DragState::Pan {
        start_client: (cx, cy),
        start_offset: (view.offset_x, view.offset_y),
    });
    if button == Some(MouseButton::Primary) {
        let mut net = clear_selection(&state.net());
        net.edges.iter_mut().for_each(|e| e.selected = false);
        state.net.set(net);
        state.selection.set(None);
    }
}

fn canvas_mousemove(mut state: AppState, evt: MouseEvent) {
    let (cx, cy) = client_xy(&evt);

    if state.tool() == Tool::Arc {
        if let Some(mut draft) = state.pending_arc().clone() {
            let (wx, wy) = client_to_world(state, cx, cy);
            draft.to_x = wx;
            draft.to_y = wy;
            state.pending_arc.set(Some(draft));
        }
        return;
    }

    match state.drag().clone() {
        DragState::Pan { start_client, start_offset } => {
            let dx = (cx - start_client.0) as f32;
            let dy = (cy - start_client.1) as f32;
            let mut view = state.view.write();
            view.offset_x = start_offset.0 + dx;
            view.offset_y = start_offset.1 + dy;
        }
        DragState::Node { id, start_client, start_pos } => {
            let view = state.view();
            let dx = ((cx - start_client.0) as f32) / view.zoom;
            let dy = ((cy - start_client.1) as f32) / view.zoom;
            let mut nx = start_pos.x + dx;
            let mut ny = start_pos.y + dy;
            if state.snap() {
                nx = snap(nx);
                ny = snap(ny);
            }
            let mut net = state.net.write();
            if let Some(n) = net.nodes.iter_mut().find(|n| n.id == id) {
                n.position = Position { x: nx, y: ny };
            }
        }
        DragState::BoxSelect { start, .. } => {
            let (wx, wy) = client_to_world(state, cx, cy);
            state.drag.set(DragState::BoxSelect { start, cur: (wx, wy) });
        }
        DragState::ArcFromNode { source, .. } => {
            if let Some(mut draft) = state.pending_arc().clone() {
                let (wx, wy) = client_to_world(state, cx, cy);
                draft.to_x = wx;
                draft.to_y = wy;
                state.pending_arc.set(Some(draft));
            }
            let _ = source;
        }
        DragState::None => {}
    }
}

fn canvas_mouseup(mut state: AppState, evt: MouseEvent) {
    let (cx, cy) = client_xy(&evt);
    match state.drag().clone() {
        DragState::Pan { .. } | DragState::Node { .. } => {
            state.drag.set(DragState::None);
        }
        DragState::BoxSelect { start, cur } => {
            apply_box_selection(state, start, cur);
            state.drag.set(DragState::None);
        }
        DragState::ArcFromNode { source, .. } => {
            let (wx, wy) = client_to_world(state, cx, cy);
            if let Some(target) = node_at(state, wx, wy) {
                if target != source {
                    create_arc_between(state, &source, &target);
                }
            }
            state.drag.set(DragState::None);
            state.pending_arc.set(None);
        }
        DragState::None => {}
    }
}

fn apply_box_selection(mut state: AppState, a: (f32, f32), b: (f32, f32)) {
    let x0 = a.0.min(b.0);
    let y0 = a.1.min(b.1);
    let x1 = a.0.max(b.0);
    let y1 = a.1.max(b.1);
    let mut net = clear_selection(&state.net());
    for n in net.nodes.iter_mut() {
        if n.position.x >= x0 && n.position.x <= x1 && n.position.y >= y0 && n.position.y <= y1 {
            n.selected = true;
        }
    }
    let sel = net.nodes.iter().find(|n| n.selected).cloned();
    state.net.set(net);
    state.selection.set(sel.map(|n| Selection::Node(n.id)));
}

fn canvas_wheel(mut state: AppState, evt: WheelEvent) {
    evt.prevent_default();
    let delta = evt.delta().strip_units().y;
    let p = evt.client_coordinates();
    let (sx, sy) = client_to_local(state, p.x, p.y);
    let mut view = state.view.write();
    let factor = if delta > 0.0 { 1.1 } else { 1.0 / 1.1 };
    let new_zoom = (view.zoom * factor).clamp(0.2, 4.0);
    let k = new_zoom / view.zoom;
    view.offset_x = sx - (sx - view.offset_x) * k;
    view.offset_y = sy - (sy - view.offset_y) * k;
    view.zoom = new_zoom;
}

pub fn handle_keydown(state: AppState, evt: KeyboardEvent) {
    if state.editing() {
        return;
    }
    let key = evt.key();
    let mods = evt.modifiers();

    if mods.contains(Modifiers::CONTROL) || mods.contains(Modifiers::META) {
        match key {
            Key::Character(c) if c == "z" => {
                evt.prevent_default();
                if mods.contains(Modifiers::SHIFT) {
                    redo(state);
                } else {
                    undo(state);
                }
            }
            Key::Character(c) if c == "y" => {
                evt.prevent_default();
                redo(state);
            }
            Key::Character(c) if c == "c" => copy_selection(state),
            Key::Character(c) if c == "v" => {
                evt.prevent_default();
                paste(state);
            }
            _ => {}
        }
        return;
    }

    match key {
        Key::Delete | Key::Backspace => {
            evt.prevent_default();
            delete_selected(state);
        }
        _ => {}
    }
}

// ── MenuBar ────────────────────────────────────────────────────────────────

#[component]
pub fn MenuBar() -> Element {
    let mut state = use_context::<AppState>();
    let open_menu: Signal<Option<String>> = use_signal(|| None);
    let lang = state.lang();
    let t = T::new(lang);

    let file_label = t.get("menuFile");
    let edit_label = t.get("menuEdit");
    let view_label = t.get("menuView");
    let examples_label = t.get("menuExamples");
    let help_label = t.get("menuHelp");

    let open_l = t.get("menuOpen").to_string();
    let save_l = t.get("menuSave").to_string();
    let export_l = t.get("menuExportSemantic").to_string();
    let clear_l = t.get("menuClear").to_string();
    let undo_l = t.get("menuUndo").to_string();
    let redo_l = t.get("menuRedo").to_string();
    let copy_l = t.get("menuCopy").to_string();
    let paste_l = t.get("menuPaste").to_string();
    let delete_l = t.get("menuDelete").to_string();
    let select_l = t.get("menuSelect").to_string();
    let snap_l = t.get("menuSnap").to_string();
    let sim_l = t.get("menuShowSim").to_string();
    let chat_l = t.get("menuShowChat").to_string();
    let shortcuts_l = t.get("menuShortcuts").to_string();
    let help_pt_l = t.get("helpRepoPt").to_string();
    let help_timed_l = t.get("helpRepoTimed").to_string();
    let help_cvn_l = t.get("helpRepoCvn").to_string();

    let can_undo_b = can_undo(state);
    let can_redo_b = can_redo(state);
    let has_sel = any_selected(state);
    let _sim_checked = state.sim_open();
    let _chat_checked = state.chat_open();
    let _snap_checked = state.snap();

    rsx! {
        div { class: "menubar",
            MenuTitle { label: file_label, menu_key: "file", open_menu: open_menu }
            MenuTitle { label: edit_label, menu_key: "edit", open_menu: open_menu }
            MenuTitle { label: view_label, menu_key: "view", open_menu: open_menu }
            MenuTitle { label: examples_label, menu_key: "examples", open_menu: open_menu }
            MenuTitle { label: help_label, menu_key: "help", open_menu: open_menu }
            div { class: "menu-spacer" }
            select {
                value: lang.key(),
                onchange: move |evt| {
                    let v = evt.value();
                    state.lang.set(if v == "zh" { Lang::Zh } else { Lang::En });
                },
                option { value: "en", "English" }
                option { value: "zh", "中文" }
            }
            if open_menu() == Some("file".to_string()) {
                MenuDropdown {
                    open_menu: open_menu,
                    items: vec![
                        ("open".to_string(), open_l.clone(), MenuAction::Open, false),
                        ("save".to_string(), save_l.clone(), MenuAction::Save, false),
                        ("export".to_string(), export_l.clone(), MenuAction::ExportSemantic, false),
                        ("sep1".to_string(), String::new(), MenuAction::Separator, false),
                        ("clear".to_string(), clear_l.clone(), MenuAction::Clear, false),
                    ],
                }
            }
            if open_menu() == Some("edit".to_string()) {
                MenuDropdown {
                    open_menu: open_menu,
                    items: vec![
                        ("undo".to_string(), undo_l.clone(), MenuAction::Undo, !can_undo_b),
                        ("redo".to_string(), redo_l.clone(), MenuAction::Redo, !can_redo_b),
                        ("sep2".to_string(), String::new(), MenuAction::Separator, false),
                        ("copy".to_string(), copy_l.clone(), MenuAction::Copy, false),
                        ("paste".to_string(), paste_l.clone(), MenuAction::Paste, false),
                        ("sep3".to_string(), String::new(), MenuAction::Separator, false),
                        ("delete".to_string(), delete_l.clone(), MenuAction::Delete, !has_sel),
                    ],
                }
            }
            if open_menu() == Some("view".to_string()) {
                MenuDropdown {
                    open_menu: open_menu,
                    items: vec![
                        ("select".to_string(), select_l.clone(), MenuAction::ToggleSelect, false),
                        ("snap".to_string(), snap_l.clone(), MenuAction::ToggleSnap, false),
                        ("sep4".to_string(), String::new(), MenuAction::Separator, false),
                        ("sim".to_string(), sim_l.clone(), MenuAction::ToggleSim, false),
                        ("chat".to_string(), chat_l.clone(), MenuAction::ToggleChat, false),
                    ],
                }
            }
            if open_menu() == Some("examples".to_string()) {
                MenuDropdown {
                    open_menu: open_menu,
                    items: vec![
                        ("expt".to_string(), t.get("examplePt").to_string(), MenuAction::ExamplePt, false),
                        ("extimed".to_string(), t.get("exampleTimed").to_string(), MenuAction::ExampleTimed, false),
                        ("excvn".to_string(), t.get("exampleCvn").to_string(), MenuAction::ExampleCvn, false),
                    ],
                }
            }
            if open_menu() == Some("help".to_string()) {
                MenuDropdown {
                    open_menu: open_menu,
                    items: vec![
                        ("shortcuts".to_string(), shortcuts_l.clone(), MenuAction::Shortcuts, false),
                        ("sep5".to_string(), String::new(), MenuAction::Separator, false),
                        ("hpt".to_string(), help_pt_l.clone(), MenuAction::HelpPt, false),
                        ("htimed".to_string(), help_timed_l.clone(), MenuAction::HelpTimed, false),
                        ("hcvn".to_string(), help_cvn_l.clone(), MenuAction::HelpCvn, false),
                    ],
                }
            }
        }
    }
}

#[derive(Clone, PartialEq)]
pub enum MenuAction {
    Open,
    Save,
    ExportSemantic,
    Clear,
    Undo,
    Redo,
    Copy,
    Paste,
    Delete,
    ToggleSelect,
    ToggleSnap,
    ToggleSim,
    ToggleChat,
    ExamplePt,
    ExampleTimed,
    ExampleCvn,
    Shortcuts,
    HelpPt,
    HelpTimed,
    HelpCvn,
    Separator,
}

#[component]
pub fn MenuTitle(label: String, menu_key: String, mut open_menu: Signal<Option<String>>) -> Element {
    let is_open = open_menu() == Some(menu_key.clone());
    rsx! {
        div {
            class: if is_open { "menu-title active" } else { "menu-title" },
            onclick: move |_| {
                if open_menu() == Some(menu_key.clone()) {
                    open_menu.set(None);
                } else {
                    open_menu.set(Some(menu_key.clone()));
                }
            },
            "{label}"
        }
    }
}

#[component]
pub fn MenuDropdown(
    mut open_menu: Signal<Option<String>>,
    items: Vec<(String, String, MenuAction, bool)>,
) -> Element {
    let mut state = use_context::<AppState>();
    let sim_checked = state.sim_open();
    let chat_checked = state.chat_open();
    let snap_checked = state.snap();
    let select_checked = state.select_mode();

    rsx! {
        div { class: "menu-dropdown",
            for (key, label, action, disabled) in items {
                match action {
                    MenuAction::Separator => rsx! { div { class: "menu-sep" } },
                    _ => {
                        let checked = match &action {
                            MenuAction::ToggleSelect => select_checked,
                            MenuAction::ToggleSnap => snap_checked,
                            MenuAction::ToggleSim => sim_checked,
                            MenuAction::ToggleChat => chat_checked,
                            _ => false,
                        };
                        let label_clone = label.clone();
                        rsx! {
                            button {
                                class: "menu-item",
                                disabled: disabled,
                                onclick: move |_| {
                                    open_menu.set(None);
                                    let _ = &key;
                                    match action {
                                        MenuAction::Open => open_net(state),
                                        MenuAction::Save => save_net(state),
                                        MenuAction::ExportSemantic => export_semantic(state),
                                        MenuAction::Clear => clear_all(state),
                                        MenuAction::Undo => undo(state),
                                        MenuAction::Redo => redo(state),
                                        MenuAction::Copy => copy_selection(state),
                                        MenuAction::Paste => paste(state),
                                        MenuAction::Delete => delete_selected(state),
                                        MenuAction::ToggleSelect => { let v = !state.select_mode(); state.select_mode.set(v); state.pending_arc.set(None); }
                                        MenuAction::ToggleSnap => { let v = !state.snap(); state.snap.set(v); }
                                        MenuAction::ToggleSim => { let v = !state.sim_open(); state.sim_open.set(v); }
                                        MenuAction::ToggleChat => { let v = !state.chat_open(); state.chat_open.set(v); }
                                        MenuAction::ExamplePt => load_example(state, examples::pt_example()),
                                        MenuAction::ExampleTimed => load_example(state, examples::timed_example()),
                                        MenuAction::ExampleCvn => load_example(state, examples::cvn_example()),
                                        MenuAction::Shortcuts => state.show_shortcuts.set(true),
                                        MenuAction::HelpPt => open_url("https://github.com/kevindadi/ConcBugDect-Rust"),
                                        MenuAction::HelpTimed => open_url("https://github.com/kevindadi/PTPN"),
                                        MenuAction::HelpCvn => open_url("https://github.com/kevindadi/ConcPlanVerify"),
                                        MenuAction::Separator => {}
                                    }
                                },
                                if checked { span { class: "menu-check", "✓" } }
                                span { "{label_clone}" }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn open_url(url: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn export_semantic(state: AppState) {
    if let Some(path) = io::save_dialog("net.semantic.json") {
        let json = io::semantic_json(&state.net());
        if let Err(e) = io::write_file(&path, &json) {
            set_status(state, format!("Export failed: {e}"));
        } else {
            set_status(state, format!("Exported {}", path.display()));
        }
    }
}

fn load_example(mut state: AppState, mut net: PetriNet) {
    examples::apply_layout(&mut net);
    commit(state);
    state.net.set(net);
    state.selection.set(None);
    state.sim_open.set(false);
    state.show_analysis.set(false);
    state.simulating.set(false);
    state.sim_auto.set(false);
}

// ── Toolbar ────────────────────────────────────────────────────────────────

#[component]
pub fn Toolbar() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let tool_is_arc = state.tool() == Tool::Arc;
    let arc_disabled = !tool_is_arc;
    let select_active = state.select_mode();
    let snap_on = state.snap();
    let can_undo_b = can_undo(state);
    let can_redo_b = can_redo(state);
    let has_sel = any_selected(state);
    let net_kind_label = match state.net().net_kind {
        NetKind::Pt => t.get("netTypePt").to_string(),
        NetKind::Timed => t.get("netTypeTimed").to_string(),
        NetKind::Cvn => t.get("netTypeCvn").to_string(),
    };
    let kind_btn = t.f("kindButton", &[("kind", net_kind_label)]);
    let arc_normal = t.get("arcNormal");
    let arc_reset = t.get("arcReset");
    let arc_inhibit = t.get("arcInhibit");
    let add_place_l = t.get("addPlace");
    let add_transition_l = t.get("addTransition");
    let add_arc_l = t.get("addArc");
    let undo_t = t.get("undoTitle");
    let redo_t = t.get("redoTitle");
    let del_t = t.get("deleteTitle");
    let select_l = t.get("menuSelect");
    let snap_l = t.get("menuSnap");
    let layout_l = t.get("autoLayout");
    let layout_t = t.get("autoLayoutTitle");
    let sim_l = t.get("simToggle");
    let chat_l = t.get("chatOpen");
    let open_l = t.get("menuOpen");
    let save_l = t.get("menuSave");
    let clear_l = t.get("menuClear");

    rsx! {
        div { class: "toolbar",
            div { class: "tb-group",
                button { onclick: move |_| add_place(state), "{add_place_l}" }
                button { onclick: move |_| add_transition(state), "{add_transition_l}" }
                button {
                    class: if tool_is_arc { "active" } else { "" },
                    onclick: move |_| {
                        let next = if state.tool() == Tool::Arc { Tool::Select } else { Tool::Arc };
                        state.tool.set(next);
                        state.pending_arc.set(None);
                        state.status_msg.set(String::new());
                    },
                    "{add_arc_l}"
                }
            }
            div { class: "tb-group",
                button {
                    class: if state.arc_type() == ArcType::Normal { "active" } else { "" },
                    disabled: arc_disabled,
                    onclick: move |_| state.arc_type.set(ArcType::Normal),
                    "{arc_normal}"
                }
                button {
                    class: if state.arc_type() == ArcType::Reset { "active" } else { "" },
                    disabled: arc_disabled,
                    onclick: move |_| state.arc_type.set(ArcType::Reset),
                    "{arc_reset}"
                }
                button {
                    class: if state.arc_type() == ArcType::Inhibitor { "active" } else { "" },
                    disabled: arc_disabled,
                    onclick: move |_| state.arc_type.set(ArcType::Inhibitor),
                    "{arc_inhibit}"
                }
            }
            div { class: "tb-group",
                button { disabled: !can_undo_b, onclick: move |_| undo(state), title: undo_t, "⟲" }
                button { disabled: !can_redo_b, onclick: move |_| redo(state), title: redo_t, "⟳" }
                button {
                    disabled: !has_sel,
                    onclick: move |_| delete_selected(state),
                    title: del_t,
                    "🗑"
                }
            }
            div { class: "tb-group",
                button {
                    class: if select_active { "active" } else { "" },
                    onclick: move |_| {
                        let v = !state.select_mode();
                        state.select_mode.set(v);
                        if v {
                            state.tool.set(Tool::Select);
                            state.pending_arc.set(None);
                        }
                    },
                    "{select_l}"
                }
                button {
                    class: if snap_on { "active" } else { "" },
                    onclick: move |_| {
                        let v = !state.snap();
                        state.snap.set(v);
                    },
                    "{snap_l}"
                }
                button {
                    onclick: move |_| auto_layout(state),
                    title: layout_t,
                    "{layout_l}"
                }
            }
            div { class: "tb-group",
                button { onclick: move |_| state.show_net_kind.set(true), "{kind_btn}" }
                button { onclick: move |_| { let v = !state.sim_open(); state.sim_open.set(v); }, "{sim_l}" }
                button { onclick: move |_| { let v = !state.chat_open(); state.chat_open.set(v); }, "{chat_l}" }
            }
            div { class: "tb-group",
                button { onclick: move |_| open_net(state), "{open_l}" }
                button { onclick: move |_| save_net(state), "{save_l}" }
            }
            div { class: "tb-group",
                button { onclick: move |_| clear_all(state), "{clear_l}" }
            }
        }
    }
}

fn auto_layout(mut state: AppState) {
    commit(state);
    let opts = crate::layout::LayoutOptions::default();
    let net = state.net();
    let pos = crate::layout::compute_layout(&net.nodes, &net.edges, &opts);
    let mut net = state.net.write();
    for n in net.nodes.iter_mut() {
        if let Some(p) = pos.get(&n.id) {
            n.position = p.clone();
        }
    }
}

fn save_net(state: AppState) {
    let default_name = "untitled.pn.xml".to_string();
    if let Some(path) = io::save_dialog(&default_name) {
        let xml = crate::xml::serialize_xml(&state.net());
        if let Err(e) = io::write_file(&path, &xml) {
            set_status(state, format!("Save failed: {e}"));
        } else {
            set_status(state, format!("Saved {}", path.display()));
        }
    }
}

fn open_net(mut state: AppState) {
    let Some(path) = io::open_dialog() else { return };
    let Ok(text) = io::read_file(&path) else {
        set_status(state, "Failed to read file".to_string());
        return;
    };
    commit(state);
    let result = if text.trim_start().starts_with('<') {
        crate::xml::parse_xml(&text).map(|(net, _)| net)
    } else {
        io::json_to_net(&text)
    };
    match result {
        Ok(net) => {
            let ids: Vec<String> = net
                .nodes
                .iter()
                .map(|n| n.id.clone())
                .chain(net.edges.iter().map(|e| e.id.clone()))
                .collect();
            bump_id_counter_for_ids(&ids);
            state.net.set(net);
            state.selection.set(None);
            state.sim_open.set(false);
            state.show_analysis.set(false);
            set_status(state, format!("Opened {}", path.display()));
        }
        Err(e) => set_status(state, format!("Open failed: {e}")),
    }
}

// ── Canvas ─────────────────────────────────────────────────────────────────

#[component]
pub fn Canvas() -> Element {
    let mut state = use_context::<AppState>();
    let net = state.net();
    let view = state.view();
    let transform = format!("translate({} {}) scale({})", view.offset_x, view.offset_y, view.zoom);
    let drag = state.drag();
    let pending = state.pending_arc();
    let edges = net.edges.clone();
    let nodes = net.nodes.clone();

    use_effect(move || {
        let st = state;
        spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(60)).await;
            if let Some((_, _, w, h)) = st.svg_rect() {
                if w > 0.0 && h > 0.0 {
                    crate::state::fits_view(st, w, h);
                }
            }
        });
    });

    rsx! {
        svg {
            class: "canvas-svg",
            onmounted: move |evt| {
                let data = evt.data.clone();
                spawn(async move {
                    if let Ok(r) = data.get_client_rect().await {
                        state.svg_rect.set(Some((r.origin.x, r.origin.y, r.size.width, r.size.height)));
                    }
                });
            },
            onmousedown: move |evt| canvas_mousedown(state, evt),
            onmousemove: move |evt| canvas_mousemove(state, evt),
            onmouseup: move |evt| canvas_mouseup(state, evt),
            onwheel: move |evt| canvas_wheel(state, evt),
            g { transform: transform,
                for e in edges.iter() {
                    EdgeView { edge: e.clone() }
                }
                for n in nodes.iter() {
                    NodeView { node: n.clone() }
                }
                if let Some(draft) = &pending {
                    line {
                        x1: draft.from_x.to_string(), y1: draft.from_y.to_string(),
                        x2: draft.to_x.to_string(), y2: draft.to_y.to_string(),
                        stroke: "#2563eb", "stroke-width": "2", "stroke-dasharray": "6 4",
                    }
                }
                if let DragState::BoxSelect { start, cur } = drag {
                    rect {
                        x: start.0.min(cur.0).to_string(), y: start.1.min(cur.1).to_string(),
                        width: (cur.0 - start.0).abs().to_string(), height: (cur.1 - start.1).abs().to_string(),
                        fill: "#2563eb22", stroke: "#2563eb", "stroke-width": "1", "stroke-dasharray": "4 4",
                    }
                }
            }
        }
    }
}

#[component]
pub fn NodeView(node: Node) -> Element {
    let state = use_context::<AppState>();
    let tr = format!("translate({} {})", node.position.x, node.position.y);
    let stroke = if node.selected { "#2563eb" } else { "#1f2937" };
    let id = node.id.clone();
    let place_r = PLACE_R.to_string();
    let tw = (-TRANS_W / 2.0).to_string();
    let th = (-TRANS_H / 2.0).to_string();
    let w = TRANS_W.to_string();
    let h = TRANS_H.to_string();

    rsx! {
        g {
            transform: tr,
            cursor: "pointer",
            onmousedown: move |evt| node_mousedown(state, evt, id.clone()),
            match &node.data {
                NodeData::Place(d) => {
                    let label = d.label.clone();
                    let tokens = sim_tokens(&state, &node.id, d.tokens);
                    let fill = if state.simulating() { "#d1fae5" } else { "#dbeafe" };
                    rsx! {
                        circle { cx: "0", cy: "0", r: place_r, fill: fill, stroke: stroke, "stroke-width": "2" }
                        text { x: "0", y: "-44", "text-anchor": "middle", "font-size": "12", "{label}" }
                        text { x: "0", y: "7", "text-anchor": "middle", "font-size": "16", "font-weight": "600", "{tokens}" }
                    }
                }
                NodeData::Transition(d) => {
                    let label = d.label.clone();
                    let mut fill = "#fef3c7";
                    if state.simulating() && state.sim_enabled().iter().any(|e| e == &node.id) {
                        fill = "#bbf7d0";
                    } else if state.simulating() && state.sim_waiting().iter().any(|e| e == &node.id) {
                        fill = "#fef9c3";
                    }
                    rsx! {
                        rect {
                            x: tw, y: th, width: w, height: h,
                            fill: fill, stroke: stroke, "stroke-width": "2",
                        }
                        text { x: "0", y: "-28", "text-anchor": "middle", "font-size": "12", "{label}" }
                    }
                }
            }
            Handle { node_id: node.id.clone() }
        }
    }
}

#[component]
pub fn Handle(node_id: String) -> Element {
    let state = use_context::<AppState>();
    let pts = [
        (-TRANS_W / 2.0, 0.0),
        (TRANS_W / 2.0, 0.0),
        (0.0, -TRANS_H / 2.0),
        (0.0, TRANS_H / 2.0),
    ];
    let handles: Vec<(f32, f32, String)> = pts.into_iter().map(|(x, y)| (x, y, node_id.clone())).collect();
    rsx! {
        for (x, y, nid) in handles {
            circle {
                cx: x.to_string(), cy: y.to_string(), r: "6",
                fill: "#ffffff", stroke: "#64748b", "stroke-width": "1.5",
                opacity: "0.9",
                cursor: "crosshair",
                onmousedown: move |evt| handle_mousedown(state, evt, nid.clone()),
            }
        }
    }
}

#[component]
pub fn EdgeView(edge: Edge) -> Element {
    let state = use_context::<AppState>();
    let net = state.net();
    let (Some(src), Some(dst)) = (
        net.nodes.iter().find(|n| n.id == edge.source),
        net.nodes.iter().find(|n| n.id == edge.target),
    ) else {
        return rsx! {};
    };
    let (a, b) = facing_points(src, dst);
    let selected = edge.selected;
    let stroke = if selected { "#2563eb" } else { "#1f2937" };
    let width = if selected { "3" } else { "2" };
    let dash = if edge.data.arc_type == ArcType::Reset { "7 4" } else { "" };

    let angle = (b.y - a.y).atan2(b.x - a.x);
    let arrow_len = 13.0;
    let arrow_w = 6.0;
    let bx = b.x - arrow_len * angle.cos();
    let by = b.y - arrow_len * angle.sin();
    let p1x = bx - arrow_w * angle.sin();
    let p1y = by + arrow_w * angle.cos();
    let p2x = bx + arrow_w * angle.sin();
    let p2y = by - arrow_w * angle.cos();
    let points = format!("{},{},{},{},{},{}", b.x, b.y, p1x, p1y, p2x, p2y);
    let b_str = format!("{} {}", b.x, b.y);

    let weight_text = if edge.data.weight != 1 {
        Some(edge.data.weight.to_string())
    } else {
        None
    };
    let mid_x = ((a.x + b.x) / 2.0).to_string();
    let mid_y = ((a.y + b.y) / 2.0 - 6.0).to_string();
    let id = edge.id.clone();
    let arc_type = edge.data.arc_type;

    rsx! {
        g {
            cursor: "pointer",
            onclick: move |evt| {
                evt.stop_propagation();
                select_edge(state, &id);
            },
            line {
                x1: a.x.to_string(), y1: a.y.to_string(), x2: b.x.to_string(), y2: b.y.to_string(),
                stroke: stroke, "stroke-width": width, "stroke-dasharray": dash,
            }
            if arc_type == ArcType::Inhibitor {
                circle { cx: b_str, cy: b.y.to_string(), r: "7", fill: "#ffffff", stroke: stroke, "stroke-width": "2" }
            } else {
                polygon { points: points, fill: stroke }
            }
            if let Some(w) = weight_text {
                text {
                    x: mid_x, y: mid_y,
                    "text-anchor": "middle", "font-size": "13", "font-weight": "600",
                    fill: stroke, "{w}"
                }
            }
        }
    }
}

#[component]
pub fn CanvasLegend() -> Element {
    let state = use_context::<AppState>();
    let t = t_of(state);
    let normal = t.get("legendNormal");
    let reset = t.get("legendReset");
    let inhibit = t.get("legendInhibitor");
    rsx! {
        div { class: "canvas-legend",
            div { class: "legend-item", span { class: "legend-line normal" }, "{normal}" }
            div { class: "legend-item", span { class: "legend-line reset" }, "{reset}" }
            div { class: "legend-item", span { class: "legend-line inhibit" }, "{inhibit}" }
        }
    }
}

// ── Inspector ──────────────────────────────────────────────────────────────

#[component]
pub fn Inspector() -> Element {
    let state = use_context::<AppState>();
    let sel = state.selection();
    match sel {
        None => rsx! { NetOverview {} },
        Some(Selection::Node(id)) => {
            let node = state.net().nodes.iter().find(|n| n.id == id).cloned();
            match node {
                Some(n) => rsx! { PropsNode { node: n } },
                None => rsx! { NetOverview {} },
            }
        }
        Some(Selection::Edge(id)) => {
            let edge = state.net().edges.iter().find(|e| e.id == id).cloned();
            match edge {
                Some(e) => rsx! { PropsEdge { edge: e } },
                None => rsx! { NetOverview {} },
            }
        }
    }
}

#[component]
pub fn NetOverview() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let (places, transitions, arcs) = counts(state);
    let kind_label = match state.net().net_kind {
        NetKind::Pt => t.get("netTypePt"),
        NetKind::Timed => t.get("netTypeTimed"),
        NetKind::Cvn => t.get("netTypeCvn"),
    };
    let counts_str = t.f("overviewCounts", &[
        ("places", places.to_string()),
        ("transitions", transitions.to_string()),
        ("arcs", arcs.to_string()),
    ]);
    let overview_title = t.get("overviewTitle");
    let kind_l = t.get("overviewKindLabel");
    let change_l = t.get("overviewChange");
    let tip = t.get("overviewTip");
    let add_p = t.get("addPlace");
    let add_t = t.get("addTransition");
    let start_l = t.get("simStart");
    let analyze_l = t.get("simAnalyze");
    rsx! {
        div { class: "panel",
            h3 { "{overview_title}" }
            div { class: "ov-row",
                span { "{kind_l}: {kind_label}" }
                button { class: "small", onclick: move |_| state.show_net_kind.set(true), "{change_l}" }
            }
            div { class: "ov-counts", "{counts_str}" }
            div { class: "ov-actions",
                button { onclick: move |_| add_place(state), "{add_p}" }
                button { onclick: move |_| add_transition(state), "{add_t}" }
                button { onclick: move |_| start_simulation(state), "{start_l}" }
                button { onclick: move |_| run_analysis(state), "{analyze_l}" }
            }
            div { class: "ov-tip", "{tip}" }
        }
    }
}

#[component]
pub fn PropsNode(node: Node) -> Element {
    match &node.data {
        NodeData::Place(_) => rsx! { PlaceProps { node: node.clone() } },
        NodeData::Transition(_) => rsx! { TransitionProps { node: node.clone() } },
    }
}

#[component]
pub fn PlaceProps(node: Node) -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let nk = state.net().net_kind;
    let node_id = node.id.clone();
    let title = t.get("properties");
    let name_l = t.get("name").to_string();
    let tokens_l = t.get("tokens").to_string();
    let capacity_l = t.get("capacity").to_string();
    let d = node.place().unwrap();
    let label_v = d.label.clone();
    let tokens_v = d.tokens as i64;
    let cap_v = d.capacity;
    let show_capacity = nk == NetKind::Pt || nk == NetKind::Timed;
    let show_class = nk == NetKind::Cvn;
    let cur_class = d.cvn_place.clone().map(|c| c.class).unwrap_or_else(|| "control".into());
    let class_l = t.get("placeClass").to_string();
    let class_opts = vec![
        ("control".to_string(), t.get("controlFlow").to_string()),
        ("resource".to_string(), t.get("resource").to_string()),
    ];
    let nid_label = node_id.clone();
    let nid_tokens = node_id.clone();
    let nid_cap = node_id.clone();
    let nid_class = node_id.clone();

    rsx! {
        div { class: "panel",
            h3 { "{title}" }
            LabelInput { label: name_l.clone(), value: label_v.clone(), onchange: move |v| {
                commit(state);
                let mut net = state.net.write();
                if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_label) {
                    if let Some(pd) = n.place_mut() { pd.label = v; }
                }
            } }
            NumberInput { label: tokens_l, value: tokens_v, onchange: move |v: i64| {
                commit(state);
                let mut net = state.net.write();
                if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_tokens) {
                    if let Some(pd) = n.place_mut() { pd.tokens = v.max(0) as usize; }
                }
            } }
            if show_capacity {
                NumberInputOpt { label: capacity_l, value: cap_v, onchange: move |v: Option<usize>| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_cap) {
                        if let Some(pd) = n.place_mut() { pd.capacity = v; }
                    }
                } }
            }
            if show_class {
                SelectInput { label: class_l, value: cur_class, options: class_opts, onchange: move |v: String| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_class) {
                        if let Some(pd) = n.place_mut() {
                            pd.cvn_place = Some(if v == "resource" {
                                CvnPlace { class: "resource".into(), sub: None, resource: Some("Mutex".into()), param: Some(1) }
                            } else {
                                CvnPlace { class: "control".into(), sub: Some("Statement".into()), resource: None, param: None }
                            });
                        }
                    }
                } }
            }
        }
    }
}

#[component]
pub fn TransitionProps(node: Node) -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let nk = state.net().net_kind;
    let node_id = node.id.clone();
    let title = t.get("properties");
    let name_l = t.get("name").to_string();
    let priority_l = t.get("priority").to_string();
    let d = node.transition().unwrap();
    let label_v = d.label.clone();
    let pri_v = d.priority.map(|p| p as usize);
    let show_pri = nk == NetKind::Pt || nk == NetKind::Timed;
    let show_interval = nk == NetKind::Timed;
    let interval = d.interval.clone().unwrap_or_default();
    let earliest_l = t.get("earliest").to_string();
    let latest_l = t.get("latest").to_string();
    let left_open_l = t.get("leftOpen").to_string();
    let right_open_l = t.get("rightOpen").to_string();
    let nid_label = node_id.clone();
    let nid_pri = node_id.clone();
    let nid_iv_e = node_id.clone();
    let nid_iv_l = node_id.clone();
    let nid_iv_lo = node_id.clone();
    let nid_iv_ro = node_id.clone();
    let iv_e = interval.earliest;
    let iv_l = interval.latest;
    let iv_lo = interval.left_open;
    let iv_ro = interval.right_open;

    rsx! {
        div { class: "panel",
            h3 { "{title}" }
            LabelInput { label: name_l.clone(), value: label_v.clone(), onchange: move |v| {
                commit(state);
                let mut net = state.net.write();
                if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_label) {
                    if let Some(td) = n.transition_mut() { td.label = v; }
                }
            } }
            if show_pri {
                NumberInputOpt { label: priority_l, value: pri_v, onchange: move |v: Option<usize>| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_pri) {
                        if let Some(td) = n.transition_mut() { td.priority = v.map(|x| x as i32); }
                    }
                } }
            }
            if show_interval {
                NumberInput { label: earliest_l, value: iv_e as i64, onchange: move |v: i64| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_iv_e) {
                        if let Some(td) = n.transition_mut() {
                            let mut iv = td.interval.take().unwrap_or_default();
                            iv.earliest = v.max(0) as f64;
                            td.interval = Some(iv);
                        }
                    }
                } }
                NumberInputOpt { label: latest_l, value: iv_l.map(|x| x as usize), onchange: move |v: Option<usize>| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_iv_l) {
                        if let Some(td) = n.transition_mut() {
                            let mut iv = td.interval.take().unwrap_or_default();
                            iv.latest = v.map(|x| x as f64);
                            td.interval = Some(iv);
                        }
                    }
                } }
                div { class: "prop-row",
                    span { class: "prop-label", "{left_open_l}" }
                    input { "type": "checkbox", checked: iv_lo, onchange: move |_| {
                        commit(state);
                        let mut net = state.net.write();
                        if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_iv_lo) {
                            if let Some(td) = n.transition_mut() {
                                let mut iv = td.interval.take().unwrap_or_default();
                                iv.left_open = !iv.left_open;
                                td.interval = Some(iv);
                            }
                        }
                    } }
                }
                div { class: "prop-row",
                    span { class: "prop-label", "{right_open_l}" }
                    input { "type": "checkbox", checked: iv_ro, onchange: move |_| {
                        commit(state);
                        let mut net = state.net.write();
                        if let Some(n) = net.nodes.iter_mut().find(|n| n.id == nid_iv_ro) {
                            if let Some(td) = n.transition_mut() {
                                let mut iv = td.interval.take().unwrap_or_default();
                                iv.right_open = !iv.right_open;
                                td.interval = Some(iv);
                            }
                        }
                    } }
                }
            }
        }
    }
}

#[component]
pub fn PropsEdge(edge: Edge) -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let nk = state.net().net_kind;
    let edge_id = edge.id.clone();
    let title = t.get("properties");
    let weight_l = t.get("weight").to_string();
    let type_l = t.get("type").to_string();
    let weight_v = edge.data.weight as i64;
    let arc_types = vec![
        (ArcType::Normal.as_str().to_string(), t.get("arcNormal").to_string()),
        (ArcType::Reset.as_str().to_string(), t.get("arcReset").to_string()),
        (ArcType::Inhibitor.as_str().to_string(), t.get("arcInhibit").to_string()),
    ];
    let cur_type = edge.data.arc_type.as_str().to_string();
    let src_label = format!("{} → {}", edge.source, edge.target);
    let cur_cvn_kind = edge.data.cvn_arc.clone().map(|c| c.kind).unwrap_or_else(|| "plain".into());
    let cvn_kind_opts = vec![
        ("plain".to_string(), t.get("plain").to_string()),
        ("guard".to_string(), t.get("guard").to_string()),
        ("update".to_string(), t.get("update").to_string()),
    ];
    let arc_kind_l = t.get("arcKind").to_string();
    let is_cvn = nk == NetKind::Cvn;
    let eid_weight = edge_id.clone();
    let eid_type = edge_id.clone();
    let eid_cvn = edge_id.clone();

    rsx! {
        div { class: "panel",
            h3 { "{title}" }
            div { class: "prop-row",
                span { class: "prop-label", "{type_l}" }
                span { "{src_label}" }
            }
            NumberInput { label: weight_l, value: weight_v, onchange: move |v: i64| {
                commit(state);
                let mut net = state.net.write();
                if let Some(e) = net.edges.iter_mut().find(|e| e.id == eid_weight) {
                    e.data.weight = v.max(1) as usize;
                }
            } }
            SelectInput { label: type_l.clone(), value: cur_type.clone(), options: arc_types, onchange: move |v: String| {
                commit(state);
                let mut net = state.net.write();
                if let Some(e) = net.edges.iter_mut().find(|e| e.id == eid_type) {
                    e.data.arc_type = ArcType::from_str(&v);
                }
            } }
            if is_cvn {
                SelectInput { label: arc_kind_l, value: cur_cvn_kind, options: cvn_kind_opts, onchange: move |v: String| {
                    commit(state);
                    let mut net = state.net.write();
                    if let Some(e) = net.edges.iter_mut().find(|e| e.id == eid_cvn) {
                        let cur = e.data.cvn_arc.take().unwrap_or(CvnArc { kind: "plain".into(), guard: None, update: None });
                        e.data.cvn_arc = Some(CvnArc {
                            kind: v.clone(),
                            guard: if v == "guard" { Some(cur.guard.unwrap_or_else(|| "x >= 1".into())) } else { None },
                            update: if v == "update" { Some(cur.update.unwrap_or_else(|| "x = x + 1".into())) } else { None },
                        });
                    }
                } }
            }
        }
    }
}

#[component]
pub fn LabelInput(label: String, value: String, onchange: EventHandler<String>) -> Element {
    let mut state = use_context::<AppState>();
    rsx! {
        div { class: "prop-row",
            span { class: "prop-label", "{label}" }
            input {
                class: "prop-input",
                value: value,
                onfocus: move |_| state.editing.set(true),
                onblur: move |_| state.editing.set(false),
                onchange: move |evt| onchange.call(evt.value()),
            }
        }
    }
}

#[component]
pub fn NumberInput(label: String, value: i64, onchange: EventHandler<i64>) -> Element {
    let mut state = use_context::<AppState>();
    let v = value.to_string();
    rsx! {
        div { class: "prop-row",
            span { class: "prop-label", "{label}" }
            input {
                class: "prop-input",
                "type": "number",
                value: v,
                onfocus: move |_| state.editing.set(true),
                onblur: move |_| state.editing.set(false),
                onchange: move |evt| {
                    if let Ok(v) = evt.value().parse::<i64>() { onchange.call(v); }
                },
            }
        }
    }
}

#[component]
pub fn NumberInputOpt(label: String, value: Option<usize>, onchange: EventHandler<Option<usize>>) -> Element {
    let mut state = use_context::<AppState>();
    let v = value.map(|v| v.to_string()).unwrap_or_default();
    rsx! {
        div { class: "prop-row",
            span { class: "prop-label", "{label}" }
            input {
                class: "prop-input",
                "type": "number",
                value: v,
                placeholder: "unbounded",
                onfocus: move |_| state.editing.set(true),
                onblur: move |_| state.editing.set(false),
                onchange: move |evt| {
                    let v = evt.value();
                    if v.is_empty() {
                        onchange.call(None);
                    } else if let Ok(n) = v.parse::<usize>() {
                        onchange.call(Some(n));
                    }
                },
            }
        }
    }
}

#[component]
pub fn SelectInput(label: String, value: String, options: Vec<(String, String)>, onchange: EventHandler<String>) -> Element {
    let mut state = use_context::<AppState>();
    rsx! {
        div { class: "prop-row",
            span { class: "prop-label", "{label}" }
            select {
                class: "prop-input",
                value: value,
                onfocus: move |_| state.editing.set(true),
                onblur: move |_| state.editing.set(false),
                onchange: move |evt| onchange.call(evt.value()),
                for (val, label) in options {
                    option { value: val.clone(), "{label}" }
                }
            }
        }
    }
}

// ── Simulation ─────────────────────────────────────────────────────────────

fn start_simulation(mut state: AppState) {
    state.simulating.set(true);
    state.sim_auto.set(false);
    state.sim_collapsed.set(false);
    state.sim_open.set(true);
    state.sim_steps.set(0);
    let mut st = state;
    spawn(async move {
        let sem = to_semantic(&st.net());
        match crate::backend::sim_initial(&sem) {
            Ok(r) => {
                st.sim_state.set(Some(r.state.clone()));
                st.sim_enabled.set(r.enabled);
                st.sim_waiting.set(r.waiting);
                st.sim_can_advance.set(r.can_advance);
            }
            Err(e) => set_status(st, format!("Simulation error: {e}")),
        }
    });
}

fn sim_fire(state: AppState, transition_id: String) {
    let mut st = state;
    spawn(async move {
        let sem = to_semantic(&st.net());
        let Some(sim_state) = st.sim_state() else { return };
        match crate::backend::sim_fire(&sem, &sim_state, &transition_id) {
            Ok(Some(r)) => {
                st.sim_state.set(Some(r.state.clone()));
                st.sim_enabled.set(r.enabled);
                st.sim_waiting.set(r.waiting);
                st.sim_can_advance.set(r.can_advance);
                st.sim_steps.set(st.sim_steps() + 1);
            }
            _ => {}
        }
    });
}

fn sim_advance(state: AppState) {
    let mut st = state;
    spawn(async move {
        let sem = to_semantic(&st.net());
        let Some(sim_state) = st.sim_state() else { return };
        match crate::backend::sim_advance_time(&sem, &sim_state) {
            Ok(Some(r)) => {
                st.sim_state.set(Some(r.state.clone()));
                st.sim_enabled.set(r.enabled);
                st.sim_waiting.set(r.waiting);
                st.sim_can_advance.set(r.can_advance);
            }
            _ => {}
        }
    });
}

fn sim_step(state: AppState) {
    let enabled = state.sim_enabled();
    if !enabled.is_empty() {
        let id = pick_priority(enabled, &state.net());
        if let Some(id) = id {
            sim_fire(state, id);
            return;
        }
    }
    if state.sim_can_advance() {
        sim_advance(state);
    }
}

fn pick_priority(ids: Vec<String>, net: &PetriNet) -> Option<String> {
    if ids.is_empty() {
        return None;
    }
    let mut best = i32::MIN;
    let mut top: Vec<String> = Vec::new();
    for id in ids {
        let priority = net
            .nodes
            .iter()
            .find(|n| n.id == id)
            .and_then(|n| n.transition())
            .and_then(|d| d.priority)
            .unwrap_or(0);
        if priority > best {
            best = priority;
            top.clear();
            top.push(id.clone());
        } else if priority == best {
            top.push(id.clone());
        }
    }
    top.get(rand_index(top.len())).cloned()
}

fn rand_index(n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos() as usize;
    t % n
}

#[component]
pub fn SimulationPanel() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let sim_state = state.sim_state();
    let enabled = state.sim_enabled();
    let waiting = state.sim_waiting();
    let can_advance = state.sim_can_advance();
    let nk = state.net().net_kind;
    let steps = state.sim_steps();
    let auto = state.sim_auto();

    let sim_title = t.get("tabSimulation");
    let collapse_l = t.get("simCollapse");
    let start_l = t.get("simStart");
    let step_l = t.get("simStep");
    let auto_l = if auto { t.get("simPause") } else { t.get("simAuto") };
    let reset_l = t.get("simReset");
    let steps_str = t.f("simSteps", &[("count", steps.to_string())]);
    let time_str = sim_state.as_ref().map(|s| t.f("simTime", &[("time", s.time.to_string())]));
    let marking_l = t.get("simMarking");
    let enabled_l = t.get("simEnabled");
    let no_enabled_l = t.get("simNoEnabled");
    let waiting_l = t.get("simWaiting");
    let advance_l = t.get("simAdvanceTime");
    let hint = match nk {
        NetKind::Pt => t.get("simKindPt").to_string(),
        NetKind::Timed => t.get("simKindTimed").to_string(),
        NetKind::Cvn => t.get("simKindCvn").to_string(),
    };
    let marking: Vec<(String, String)> = sim_state
        .as_ref()
        .map(|s| s.marking.iter().map(|(k, v)| (k.clone(), v.to_string())).collect())
        .unwrap_or_default();
    let enabled_btns: Vec<(String, String)> = enabled.iter().map(|id| (id.clone(), id.clone())).collect();
    let waiting_chips: Vec<(String, String)> = waiting.iter().map(|id| (id.clone(), id.clone())).collect();
    let is_timed = nk == NetKind::Timed;

    rsx! {
        div { class: "sim-panel",
            div { class: "sim-header",
                span { "{sim_title}" }
                button { class: "small", onclick: move |_| { let v = !state.sim_collapsed(); state.sim_collapsed.set(v); }, "{collapse_l}" }
                button { class: "small", onclick: move |_| { state.sim_open.set(false); state.simulating.set(false); state.sim_auto.set(false); }, "✕" }
            }
            div { class: "sim-body",
                div { class: "sim-actions",
                    button { onclick: move |_| start_simulation(state), "{start_l}" }
                    button { onclick: move |_| sim_step(state), "{step_l}" }
                    button { onclick: move |_| { let v = !state.sim_auto(); state.sim_auto.set(v); }, "{auto_l}" }
                    button { onclick: move |_| start_simulation(state), "{reset_l}" }
                }
                if auto { AutoTicker {} }
                div { class: "sim-info",
                    "{steps_str}"
                    if let Some(tm) = &time_str { span { " · {tm}" } }
                }
                div { class: "sim-marking",
                    div { class: "sim-section-title", "{marking_l}" }
                    div { class: "marking-grid",
                        for (id, toks) in marking {
                            span { class: "marking-cell", "{id}: {toks}" }
                        }
                    }
                }
                div { class: "sim-enabled",
                    div { class: "sim-section-title", "{enabled_l}" }
                    if enabled_btns.is_empty() {
                        div { class: "sim-deadlock", "{no_enabled_l}" }
                    } else {
                        for (disp_id, btn_id) in enabled_btns {
                            button { class: "trans-btn enabled", onclick: move |_| sim_fire(state, btn_id.clone()), "{disp_id}" }
                        }
                    }
                }
                if is_timed {
                    div { class: "sim-waiting",
                        div { class: "sim-section-title", "{waiting_l}" }
                        for (disp_id, _btn_id) in waiting_chips {
                            span { class: "waiting-chip", "{disp_id}" }
                        }
                        if can_advance {
                            button { onclick: move |_| sim_advance(state), "{advance_l}" }
                        }
                    }
                }
                div { class: "sim-hint", "{hint}" }
            }
        }
    }
}

#[component]
pub fn AutoTicker() -> Element {
    let state = use_context::<AppState>();
    use_future(move || async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            if state.sim_auto() {
                sim_step(state);
            }
        }
    });
    rsx! { span { class: "ticker", "▶" } }
}

// ── Chat ───────────────────────────────────────────────────────────────────

fn send_chat(mut state: AppState) {
    let prompt = state.ai_input().trim().to_string();
    if prompt.is_empty() || state.ai_loading() {
        return;
    }
    state.ai_input.set(String::new());
    state.ai_loading.set(true);
    let mut msgs = state.ai_messages();
    msgs.push(ChatTurn { role: "user".into(), content: prompt.clone() });
    state.ai_messages.set(msgs.clone());
    let mut st = state;

    spawn(async move {
        let t = t_of(st);
        let mut analysis_summary = String::from("analysis unavailable");
        let sem = to_semantic(&st.net());
        if let Ok(ar) = crate::backend::analyze_net(&sem, 2000) {
            analysis_summary = crate::state::summarize_analysis(&ar);
        }
        let net_kind = st.net().net_kind.as_str().to_string();
        let net_summary = crate::state::net_summary(&st.net());
        let history: Vec<ChatTurn> = st.ai_messages().into_iter().rev().take(10).collect();
        match ai::generate_petri_net(prompt.clone(), net_summary, analysis_summary, history, net_kind).await {
            Ok(raw) => {
                let mut msgs = st.ai_messages();
                match ai::extract_net(&raw) {
                    Some(json) => {
                        let nk = st.net().net_kind;
                        let net = crate::model::ai_net_to_petri_net(&json, nk);
                        let places = net.nodes.iter().filter(|n| n.is_place()).count();
                        let transitions = net.nodes.len() - places;
                        let arcs = net.edges.len();
                        let mut laid = net.clone();
                        examples::apply_layout(&mut laid);
                        commit(st);
                        st.net.set(laid);
                        st.selection.set(None);
                        msgs.push(ChatTurn {
                            role: "assistant".into(),
                            content: t.f("aiNetResult", &[
                                ("places", places.to_string()),
                                ("transitions", transitions.to_string()),
                                ("arcs", arcs.to_string()),
                            ]),
                        });
                    }
                    None => {
                        msgs.push(ChatTurn { role: "assistant".into(), content: raw.trim().to_string() });
                    }
                }
                st.ai_messages.set(msgs);
            }
            Err(e) => {
                let mut msgs = st.ai_messages();
                let t = t_of(st);
                msgs.push(ChatTurn {
                    role: "assistant".into(),
                    content: t.f("generationFailed", &[("error", e)]),
                });
                st.ai_messages.set(msgs);
            }
        }
        st.ai_loading.set(false);
    });
}

#[component]
pub fn ChatPanel() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let messages = state.ai_messages();
    let loading = state.ai_loading();
    let title = t.get("tabChat");
    let placeholder = t.get("chatPlaceholder");
    let send_l = if loading { t.get("generating").to_string() } else { t.get("send").to_string() };
    let rows: Vec<(String, String)> = messages
        .iter()
        .map(|m| {
            let cls = if m.role == "user" { "chat-msg user" } else { "chat-msg assistant" };
            (cls.to_string(), m.content.clone())
        })
        .collect();

    rsx! {
        div { class: "chat-panel",
            div { class: "chat-header",
                span { "{title}" }
                button { class: "small", onclick: move |_| state.chat_open.set(false), "✕" }
            }
            div { class: "chat-messages",
                for (cls, content) in rows {
                    div { class: cls, "{content}" }
                }
            }
            div { class: "chat-input-row",
                input {
                    class: "chat-input",
                    placeholder: placeholder,
                    value: state.ai_input(),
                    onfocus: move |_| state.editing.set(true),
                    onblur: move |_| state.editing.set(false),
                    oninput: move |evt| state.ai_input.set(evt.value()),
                    onkeydown: move |evt| {
                        if evt.key() == Key::Enter {
                            evt.prevent_default();
                            send_chat(state);
                        }
                    },
                }
                button {
                    disabled: loading,
                    onclick: move |_| send_chat(state),
                    "{send_l}"
                }
            }
        }
    }
}

// ── Analysis ───────────────────────────────────────────────────────────────

fn run_analysis(state: AppState) {
    let mut st = state;
    spawn(async move {
        let sem = to_semantic(&st.net());
        let t = t_of(st);
        match crate::backend::analyze_net(&sem, 2000) {
            Ok(result) => {
                st.analysis.set(Some(AnalysisUi { result, selected_state: Some(0), highlight_transition: None }));
                st.show_analysis.set(true);
            }
            Err(e) => set_status(st, format!("{}: {e}", t.get("analyzeTitle"))),
        }
    });
}

#[component]
pub fn AnalysisOverlay() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let title = t.get("analyzeTitle");
    let back_l = t.get("backToEditor");
    let ui = state.analysis().unwrap();
    let result = ui.result;

    rsx! {
        div { class: "analysis-overlay",
            div { class: "analysis-view",
                div { class: "analysis-header",
                    h2 { "{title}" }
                    button { onclick: move |_| state.show_analysis.set(false), "{back_l}" }
                }
                AnalysisSummary { result: result.clone() }
                AnalysisGraph { result: result.clone() }
            }
        }
    }
}

#[component]
pub fn AnalysisSummary(result: crate::backend::AnalysisResultDto) -> Element {
    let state = use_context::<AppState>();
    let t = t_of(state);
    let states_str = t.f("simStates", &[("count", result.state_count.to_string())]);
    let bounded_str = if result.truncated {
        t.f("analyzeTruncated", &[("limit", "2000".to_string())])
    } else {
        t.get("analyzeBounded").to_string()
    };
    let deadlock_str = t.f("simDeadlocks", &[("count", result.deadlock_count.to_string())]);
    let adv = result.advanced;
    let mut adv_rows: Vec<String> = Vec::new();
    if let Some(b) = &adv.boundness {
        adv_rows.push(if b.bounded {
            t.get("analyzeBounded").to_string()
        } else {
            t.get("analyzeUnbounded").to_string()
        });
    }
    if let Some(dt) = &adv.dead_transitions {
        adv_rows.push(format!("{}: {}", t.get("analyzeDeadTransitions"), dt.join(", ")));
    }
    if let Some(tm) = &adv.timed {
        adv_rows.push(format!(
            "{}: {} · {}",
            t.get("analyzeTimed"),
            t.f("analyzeStateClasses", &[("count", tm.state_class_count.to_string())]),
            t.f("analyzeReachableMarkings", &[("count", tm.reachable_marking_count.to_string())]),
        ));
    }

    rsx! {
        div { class: "analysis-summary",
            div { class: "as-row", "{states_str}" }
            div { class: "as-row", "{bounded_str}" }
            div { class: "as-row", "{deadlock_str}" }
            for row in adv_rows {
                div { class: "as-row", "{row}" }
            }
        }
    }
}

#[component]
pub fn AnalysisGraph(result: crate::backend::AnalysisResultDto) -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let sel = state.analysis().as_ref().and_then(|a| a.selected_state);
    let hl = state.analysis().as_ref().and_then(|a| a.highlight_transition.clone());

    let width = 900.0;
    let height = 560.0;
    let mut positions: std::collections::HashMap<usize, (f32, f32)> = std::collections::HashMap::new();
    if result.states.len() <= 1 {
        positions.insert(0, (width / 2.0, height / 2.0));
    } else {
        let max_level = result.states.iter().map(|s| s.level).max().unwrap_or(0).max(1) as f32;
        let mut counts: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        for s in &result.states {
            *counts.entry(s.level).or_insert(0) += 1;
        }
        for (i, s) in result.states.iter().enumerate() {
            let level = s.level as f32;
            let radius = (level / max_level).max(0.05) * (height / 2.0 - 60.0);
            let count = counts.get(&s.level).copied().unwrap_or(1) as f32;
            let angle = (2.0 * PI * i as f32) / count.max(1.0) + level * 0.6;
            positions.insert(
                i,
                (
                    width / 2.0 + radius * angle.cos(),
                    height / 2.0 + radius * angle.sin(),
                ),
            );
        }
    }

    let sel_info = sel.and_then(|i| result.states.get(i).cloned());
    let sel_title = t.get("analyzeSelectedState");
    let deadlock_l = t.get("analyzeLegendDeadlock");
    let sel_info_text: Option<String> = sel_info.as_ref().map(|s| {
        format!(
            "{} {}{} · level {} · {}",
            sel_title,
            sel.unwrap(),
            "",
            s.level,
            if s.deadlock { deadlock_l } else { "—" }
        )
    });
    let sel_marking: Vec<(String, String)> = sel_info
        .as_ref()
        .map(|s| s.marking.iter().map(|(k, v)| (k.clone(), v.to_string())).collect())
        .unwrap_or_default();
    let marking_cells: Vec<String> = sel_marking.iter().map(|(id, n)| format!("{id}: {n}")).collect();

    let lines: Vec<(f32, f32, f32, f32, String, String)> = result
        .edges
        .iter()
        .filter_map(|e| {
            let (Some(&p1), Some(&p2)) = (positions.get(&e.source), positions.get(&e.target)) else {
                return None;
            };
            let is_hl = Some(&e.transition_id) == hl.as_ref();
            let sc = if is_hl { "#f59e0b".to_string() } else { "#94a3b8".to_string() };
            let sw = if is_hl { "3".to_string() } else { "1.5".to_string() };
            Some((p1.0, p1.1, p2.0, p2.1, sc, sw))
        })
        .collect();

    let nodes_data: Vec<(usize, f32, f32, String, String, String)> = result
        .states
        .iter()
        .enumerate()
        .filter_map(|(i, s)| {
            let &(x, y) = positions.get(&i)?;
            let r = if sel == Some(i) { "20".to_string() } else { "16".to_string() };
            let fill = if s.deadlock { "#ef4444".to_string() } else { "#3b82f6".to_string() };
            Some((i, x, y, r, fill, i.to_string()))
        })
        .collect();

    rsx! {
        div { class: "analysis-graph-wrap",
            svg { class: "analysis-graph", width: width.to_string(), height: height.to_string(),
                for (x1, y1, x2, y2, sc, sw) in lines {
                    line {
                        x1: x1.to_string(), y1: y1.to_string(),
                        x2: x2.to_string(), y2: y2.to_string(),
                        stroke: sc, "stroke-width": sw,
                    }
                }
                for (i, x, y, r, fill, lbl) in nodes_data {
                    g {
                        onclick: move |_| {
                            let mut st = state.analysis.write();
                            if let Some(a) = st.as_mut() {
                                a.selected_state = Some(i);
                                a.highlight_transition = None;
                            }
                        },
                        circle {
                            cx: x.to_string(), cy: y.to_string(),
                            r: r, fill: fill, stroke: "#1e293b", "stroke-width": "2",
                        }
                        text {
                            x: x.to_string(), y: (y + 4.0).to_string(),
                            "text-anchor": "middle", "font-size": "11", fill: "#ffffff", "{lbl}"
                        }
                    }
                }
            }
            if let Some(info) = &sel_info_text {
                div { class: "analysis-state-info", "{info}" }
                div { class: "analysis-marking",
                    for cell in marking_cells {
                        span { class: "marking-cell", "{cell}" }
                    }
                }
            }
        }
    }
}

// ── Modals / StatusBar ─────────────────────────────────────────────────────

#[component]
pub fn NetKindModal() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let title = t.get("netKindModalTitle");
    let cancel_l = t.get("cancel");
    let pt_l = t.get("netTypePt");
    let timed_l = t.get("netTypeTimed");
    let cvn_l = t.get("netTypeCvn");
    let pt_d = t.get("netKindDescPt");
    let timed_d = t.get("netKindDescTimed");
    let cvn_d = t.get("netKindDescCvn");
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| state.show_net_kind.set(false),
            div { class: "modal", onclick: move |evt| evt.stop_propagation(),
                h3 { "{title}" }
                div { class: "nk-options",
                    button { class: "nk-option", onclick: move |_| { change_net_kind(state, NetKind::Pt); state.show_net_kind.set(false); },
                        b { "{pt_l}" } div { class: "nk-desc", "{pt_d}" }
                    }
                    button { class: "nk-option", onclick: move |_| { change_net_kind(state, NetKind::Timed); state.show_net_kind.set(false); },
                        b { "{timed_l}" } div { class: "nk-desc", "{timed_d}" }
                    }
                    button { class: "nk-option", onclick: move |_| { change_net_kind(state, NetKind::Cvn); state.show_net_kind.set(false); },
                        b { "{cvn_l}" } div { class: "nk-desc", "{cvn_d}" }
                    }
                }
                div { class: "modal-actions",
                    button { onclick: move |_| state.show_net_kind.set(false), "{cancel_l}" }
                }
            }
        }
    }
}

#[component]
pub fn ShortcutsModal() -> Element {
    let mut state = use_context::<AppState>();
    let t = t_of(state);
    let title = t.get("shortcutsTitle");
    let close_l = t.get("shortcutsClose");
    let keys = [
        t.get("shortcutUndo"),
        t.get("shortcutRedo"),
        t.get("shortcutCopy"),
        t.get("shortcutPaste"),
        t.get("shortcutDelete"),
        t.get("shortcutSend"),
    ];
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| state.show_shortcuts.set(false),
            div { class: "modal", onclick: move |evt| evt.stop_propagation(),
                h3 { "{title}" }
                for row in keys {
                    div { class: "sc-row", "{row}" }
                }
                div { class: "modal-actions",
                    button { onclick: move |_| state.show_shortcuts.set(false), "{close_l}" }
                }
            }
        }
    }
}

#[component]
pub fn StatusBar() -> Element {
    let state = use_context::<AppState>();
    let t = t_of(state);
    let (places, transitions, arcs) = counts(state);
    let nk = state.net().net_kind;
    let status = state.status_msg();
    let msg = if status.is_empty() {
        t.get("statusDefault").to_string()
    } else {
        status
    };
    let places_str = t.f("statusPlaces", &[("count", places.to_string())]);
    let transitions_str = t.f("statusTransitions", &[("count", transitions.to_string())]);
    let arcs_str = t.f("statusArcs", &[("count", arcs.to_string())]);
    let nk_str = nk.as_str().to_uppercase();
    rsx! {
        div { class: "statusbar",
            span { class: "status-left", "{msg}" }
            span { class: "status-right",
                span { "{places_str}" }
                span { "{transitions_str}" }
                span { "{arcs_str}" }
                span { class: "status-chip", "{nk_str}" }
            }
        }
    }
}