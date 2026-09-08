mod ai;
mod backend;
mod examples;
mod i18n;
mod io;
mod layout;
mod model;
mod state;
mod style;
mod ui;
mod xml;

use dioxus::prelude::*;

use crate::model::*;
use crate::state::*;
use crate::ui::*;

fn main() {
    let _ = dotenvy::dotenv().ok();
    let config = dioxus::desktop::Config::new().with_window(
        dioxus::desktop::WindowBuilder::new()
            .with_title("PetriNet Editor (Dioxus)")
            .with_inner_size(dioxus::desktop::LogicalSize::new(1100.0, 720.0)),
    );
    LaunchBuilder::desktop().with_cfg(config).launch(App);
}

#[component]
fn App() -> Element {
    let net = use_signal(default_net);
    let selection = use_signal(|| None::<Selection>);
    let history = use_signal(HistoryState::default);
    let tool = use_signal(|| Tool::Select);
    let arc_type = use_signal(|| ArcType::Normal);
    let pending_arc = use_signal(|| None::<ArcDraft>);
    let view = use_signal(ViewState::default);
    let snap = use_signal(|| false);
    let select_mode = use_signal(|| false);
    let lang = use_signal(|| Lang::En);
    let show_net_kind = use_signal(|| false);
    let show_shortcuts = use_signal(|| false);
    let clipboard = use_signal(Clipboard::default);
    let status_msg = use_signal(String::new);
    let ai_input = use_signal(String::new);
    let ai_messages = use_signal(Vec::new);
    let ai_loading = use_signal(|| false);
    let sim_state = use_signal(|| None::<crate::backend::SimStateDto>);
    let sim_enabled = use_signal(Vec::new);
    let sim_waiting = use_signal(Vec::new);
    let sim_can_advance = use_signal(|| false);
    let sim_open = use_signal(|| false);
    let chat_open = use_signal(|| false);
    let simulating = use_signal(|| false);
    let sim_collapsed = use_signal(|| false);
    let sim_auto = use_signal(|| false);
    let sim_steps = use_signal(|| 0);
    let analysis = use_signal(|| None::<AnalysisUi>);
    let show_analysis = use_signal(|| false);
    let svg_rect = use_signal(|| None::<(f64, f64, f64, f64)>);
    let drag = use_signal(|| DragState::None);
    let editing = use_signal(|| false);

    let app_state = use_context_provider(move || AppState {
        net,
        selection,
        history,
        tool,
        arc_type,
        pending_arc,
        view,
        snap,
        select_mode,
        lang,
        show_net_kind,
        show_shortcuts,
        clipboard,
        status_msg,
        ai_input,
        ai_messages,
        ai_loading,
        sim_state,
        sim_enabled,
        sim_waiting,
        sim_can_advance,
        sim_open,
        chat_open,
        simulating,
        sim_collapsed,
        sim_auto,
        sim_steps,
        analysis,
        show_analysis,
        svg_rect,
        drag,
        editing,
    });

    rsx! {
        div { class: "app", tabindex: "0",
            onmounted: |evt| {
                let data = evt.data.clone();
                dioxus::prelude::spawn(async move {
                    let _ = data.set_focus(true);
                });
            },
            onkeydown: move |evt| ui::handle_keydown(app_state, evt),
            style { dangerous_inner_html: style::CSS }
            MenuBar {}
            Toolbar {}
            div { class: "workspace",
                div { class: "canvas",
                    Canvas {}
                    CanvasLegend {}
                    if *app_state.chat_open.read() { ChatPanel {} }
                }
                aside { class: "inspector",
                    Inspector {}
                }
            }
            if *app_state.sim_open.read() { SimulationPanel {} }
            StatusBar {}
            if *app_state.show_net_kind.read() { NetKindModal {} }
            if *app_state.show_shortcuts.read() { ShortcutsModal {} }
            if *app_state.show_analysis.read() { AnalysisOverlay {} }
        }
    }
}