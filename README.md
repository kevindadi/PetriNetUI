# PetriNet Editor

A desktop Petri net editor written in pure Rust with [Dioxus](https://dioxuslabs.com/) Desktop. It provides graphical place/transition modeling, multiple arc types (normal, reset, inhibitor), token-game simulation, reachability analysis, and the ability to generate Petri nets from natural language using the DeepSeek LLM.

The analysis and simulation engine is [UniPN](https://github.com/kevindadi/UniPN) (a Rust submodule), shared with the analysis backends of the P/T, timed, and CVN toolchains.

## Features

- **Graphical modeling** — pan, zoom, and drag places (circles) and transitions (boxes) on the canvas.
- **Multiple arc types**:
  - `Normal` — solid line with a filled arrowhead
  - `Reset` — dashed line with a filled arrowhead
  - `Inhibitor` — solid line with a hollow circle
- **Two ways to connect** — drag from a node's handle, or use `+ Arc` click-to-connect mode (click a source, then a target).
- **Validity constraints** — arcs only connect a place to a transition (bipartite). Self-loops, place-place and transition-transition arcs are forbidden; same-direction arcs are deduplicated, and bidirectional arcs are allowed.
- **Editor UX** — undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`), copy/paste (`Ctrl/Cmd+C/V`), box selection mode, snap-to-grid, and force-directed auto layout.
- **Property editing** — edit place name/tokens/capacity, transition name/priority and (for timed nets) the firing interval, plus arc weight and type in the side panel. CVN nets support place class and arc guard/update kinds.
- **Net kinds** — switch between P/T, timed (PTPN), and data (CVN) nets; built-in examples for each.
- **Simulation** — token-game simulation driven by UniPN: fire enabled transitions, auto-play, and for timed nets advance time. The canvas live-updates markings and highlights enabled/waiting transitions.
- **Reachability analysis** — explore the reachability graph (with concentric layout), inspect deadlock states/markings, and view boundedness, dead transitions, and timed DBM summaries.
- **File persistence** — save/load Petri-net XML, open legacy `.json`, and export semantic JSON via native file dialogs.
- **AI generation** — describe a net in the AI Chat panel and let DeepSeek generate it onto the canvas.
- **Internationalization** — English and Chinese UI, extensible to more languages.

## Tech stack

- [Dioxus 0.7](https://dioxuslabs.com/) Desktop (Rust, renders via the platform webview; all app logic in Rust)
- [UniPN](https://github.com/kevindadi/UniPN) — Petri net analysis/simulation engine
- [rfd](https://docs.rs/rfd) — native file dialogs
- [reqwest](https://docs.rs/reqwest) — DeepSeek API client
- [DeepSeek API](https://api-docs.deepseek.com/)

## Prerequisites

- [Rust](https://www.rust-lang.org/) 1.80+ with Cargo
- The `UniPN` submodule is checked out (it is referenced via a path dependency):
  ```bash
  git submodule update --init --recursive
  ```

## Getting started

```bash
cd dioxus-app

# Configure the DeepSeek API key (only needed for AI generation).
# Create a .env file in the project root:
echo "DEEPSEEK_API_KEY=your-key" > ../.env

# Build and run the desktop app
cargo run
```

> `.env` is git-ignored and never committed. Without it, the AI generation feature reports an error; all other modeling features work normally.

## Building

```bash
cd dioxus-app
cargo build --release
cargo test   # backend tests (simulation + analysis)
```

## Usage

- Click **+ Place** / **+ Transition** in the toolbar to add nodes.
- **+ Arc** enters connect mode: click a source node, then a target node. Pick the arc type with Normal / Reset / Inhibit.
- Alternatively, drag from a node's handle to another node to create an arc.
- Select a node or arc to edit it in the **Properties** panel; press `Delete` or `Backspace` to remove.
- **Open** / **Save** read and write `.xml` files (legacy `.json` is also supported on open); **Export Semantic JSON** writes the semantic model.
- In the **AI Chat** panel, describe the net (e.g. "a producer-consumer system with two places and one transition"), then press `Enter` or **Send**. The generated net replaces the canvas.
- **Select** toggles box selection; **Snap** toggles snap-to-grid; **Auto Layout** arranges nodes force-directed.
- **Net type** opens the net-kind picker (P/T, Timed, Data); **Examples** loads a ready-made net.
- Start the **Simulation** panel to play the token game, or run **Reachability Analysis** to explore the state space.
- Switch the UI language with the dropdown at the right end of the menu bar.

## File format

Files are XML with `place` / `transition` / `arc` elements under a `<petrinet kind="...">` root; each node carries a `<graphics x="..." y="..."/>` child for its canvas position:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<petrinet kind="pt">
  <place id="p1" label="P1" tokens="1"><graphics x="150" y="150"/></place>
  <transition id="t1" label="T1"><graphics x="330" y="150"/></transition>
  <arc id="a1" source="p1" target="t1" weight="1" type="normal"/>
</petrinet>
```

Legacy `.json` files (React-flow style `nodes` / `edges`) are accepted by **Open**.

## Project structure

```
dioxus-app/
├── Cargo.toml
└── src/
    ├── main.rs            # App shell, shared state wiring
    ├── ui.rs              # All UI components (canvas, panels, menus, modals)
    ├── state.rs           # Shared AppState signals + editor actions
    ├── model.rs           # Data model, net↔backend DTO conversion, AI-net parsing
    ├── i18n.rs            # Internationalization (en / zh)
    ├── style.rs           # CSS
    ├── xml.rs             # XML save / load
    ├── io.rs              # Native file dialogs + JSON load / semantic export
    ├── layout.rs          # Force-directed auto layout
    ├── examples.rs        # P/T, timed, and CVN example nets
    ├── ai.rs              # DeepSeek chat client + prompt builder
    └── backend/
        ├── analyze.rs     # Reachability / boundedness / deadlock analysis (UniPN)
        └── sim.rs         # Token-game simulation engine (UniPN)
```

> `src/` and `src-tauri/` at the repo root are the legacy React + Tauri 2 frontend, kept on the `main` branch. The `dioxus` branch replaces them with `dioxus-app/`.

## License

MIT