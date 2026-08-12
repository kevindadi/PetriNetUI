# PetriNet Editor

A desktop Petri net editor built with [Tauri 2](https://tauri.app/). It provides graphical place/transition modeling, multiple arc types (normal, reset, inhibitor), and the ability to generate Petri nets from natural language using the DeepSeek LLM.

## Features

- **Graphical modeling** — pan, zoom, and drag places (circles) and transitions (boxes) on the canvas.
- **Multiple arc types**:
  - `Normal` — solid line with a filled arrowhead
  - `Reset` — dashed line with a filled arrowhead
  - `Inhibitor` — solid line with a hollow circle
- **Two ways to connect** — drag from a node's edge, or use `+ Arc` click-to-connect mode (click a source, then a target).
- **Validity constraints** — arcs only connect a place to a transition (bipartite). Self-loops, place-place and transition-transition arcs are forbidden; same-direction arcs are deduplicated, and bidirectional arcs are allowed.
- **Editor UX** — undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`), copy/paste (`Ctrl/Cmd+C/V`), box selection mode, inline arc-weight editing, and snap-to-grid.
- **Property editing** — edit place name and token count, transition name, and arc weight/type in the side panel.
- **File persistence** — save/load JSON via native file dialogs.
- **AI generation** — describe a net in the AI Chat panel and let DeepSeek generate it onto the canvas.
- **Internationalization** — English and Chinese UI, extensible to more languages.

## Tech stack

- [Tauri 2](https://tauri.app/) (Rust backend)
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [React Flow (`@xyflow/react`)](https://reactflow.dev/)
- [DeepSeek API](https://api-docs.deepseek.com/)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ with npm
- [Rust](https://www.rust-lang.org/) 1.77+ with Cargo
- Tauri system dependencies for your platform (see the [Tauri docs](https://tauri.app/start/prerequisites/))

## Getting started

```bash
# Install frontend dependencies
npm install

# Configure the DeepSeek API key (only needed for AI generation).
# Create a .env file in the project root:
echo "DEEPSEEK_API_KEY=your-key" > .env

# Start development mode
npm run tauri dev
```

> `.env` is git-ignored and never committed. Without it, the AI generation feature reports an error; all other modeling features work normally.

## Building

```bash
npm run tauri build
```

## Usage

- Click **+ Place** / **+ Transition** in the toolbar to add nodes.
- **+ Arc** enters connect mode: click a source node, then a target node. Pick the arc type with Normal / Reset / Inhibit.
- Alternatively, drag from a node's edge to another node to create an arc.
- Select a node or arc to edit it in the **Properties** panel; press `Delete` or `Backspace` to remove.
- **Open** / **Save** read and write `.json` files.
- In the **AI Chat** panel, describe the net (e.g. "a producer-consumer system with two places and one transition"), then press `Ctrl/Cmd+Enter` or **Send**. The generated net replaces the canvas.
- **Select** toggles box selection; **Snap** toggles snap-to-grid.
- Switch the UI language with the dropdown at the right end of the toolbar.

## File format

Files are JSON with `nodes` (places/transitions) and `edges` (arcs):

```json
{
  "nodes": [
    { "id": "p1", "type": "place", "position": { "x": 150, "y": 150 },
      "data": { "kind": "place", "label": "P1", "tokens": 1 } }
  ],
  "edges": [
    { "id": "a1", "type": "arc", "source": "p1", "target": "t1",
      "sourceHandle": "out", "targetHandle": "in",
      "data": { "weight": 1, "arcType": "normal" } }
  ]
}
```

## Project structure

```
src/
├── App.tsx                  # Main UI and interaction logic
├── i18n.ts                  # Internationalization (en / zh)
├── types.ts                 # Data model and AI result conversion
├── nodes/
│   ├── PlaceNode.tsx        # Place node (circle)
│   └── TransitionNode.tsx   # Transition node (box)
└── edges/
    └── ArcEdge.tsx          # Arc (arrowhead / dashed / hollow circle)
src-tauri/
└── src/
    └── lib.rs               # Tauri commands (incl. DeepSeek call)
```

## License

MIT
