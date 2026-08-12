# PetriNet Editor

一个基于 [Tauri 2](https://tauri.app/) 的桌面 Petri 网编辑器，提供图形化的库所/变迁建模、多种弧类型（普通弧、Reset 弧、禁止弧）以及通过 DeepSeek 大模型自然语言生成 Petri 网的能力。

## 功能特性

- **图形化建模**：在画布上拖拽、缩放，添加库所（圆形）和变迁（矩形）节点。
- **多种弧类型**：
  - `Normal` — 实线 + 实心箭头
  - `Reset` — 虚线 + 实心箭头
  - `Inhibitor`（禁止弧）— 实线 + 空心圆
- **两种连线方式**：拖拽连线（从节点边缘拖出）和点击连线（`+ Arc` 模式，先后点击两个节点）。
- **合法性约束**：弧只能连接库所与变迁（二部图），禁止自环、库所-库所、变迁-变迁；同向弧自动去重，支持双向弧。
- **属性编辑**：右侧面板可编辑库所名称与 token 数、变迁名称、弧的权重与类型。
- **文件持久化**：通过原生文件对话框保存/加载 JSON。
- **AI 生成**：右侧 AI Chat 面板，用自然语言描述需求，由 DeepSeek 生成 Petri 网并渲染到画布。

## 技术栈

- [Tauri 2](https://tauri.app/)（Rust 后端）
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [React Flow (`@xyflow/react`)](https://reactflow.dev/)
- [DeepSeek API](https://api-docs.deepseek.com/)

## 环境要求

- [Node.js](https://nodejs.org/) 20+ 与 npm
- [Rust](https://www.rust-lang.org/) 1.77+ 与 Cargo
- macOS / Windows / Linux 对应的 Tauri 系统依赖（见 [Tauri 文档](https://tauri.app/start/prerequisites/)）

## 快速开始

```bash
# 安装前端依赖
npm install

# 配置 DeepSeek API Key（仅 AI 生成功能需要）
# 在项目根目录创建 .env 文件：
echo "DEEPSEEK_API_KEY=你的key" > .env

# 启动开发模式
npm run tauri dev
```

> `.env` 已在 `.gitignore` 中，不会提交到仓库。未配置时，AI 生成功能会报错，其余建模功能不受影响。

## 构建发布

```bash
npm run tauri build
```

## 使用说明

- 点击工具栏 **+ Place** / **+ Transition** 添加节点。
- **+ Arc** 进入连线模式：先点起点，再点目标，即可创建弧；配合 Normal / Reset / Inhibit 选择弧类型。
- 也可以直接从节点边缘拖拽到另一个节点创建弧。
- 点击节点或弧，在右侧 **Properties** 面板编辑属性；按 `Delete` 或 `Backspace` 删除。
- 工具栏 **Open** / **Save** 读写 `.json` 文件。
- 在 **AI Chat** 面板输入自然语言描述（例如 “a producer-consumer system with two places and one transition”），`Ctrl/Cmd + Enter` 或点击「发送」，生成的网会替换当前画布。

## 保存格式

文件为 JSON，包含 `nodes`（库所/变迁）与 `edges`（弧）两部分：

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

## 项目结构

```
src/
├── App.tsx                  # 主界面与交互逻辑
├── types.ts                 # 数据模型与 AI 结果转换
├── nodes/
│   ├── PlaceNode.tsx        # 库所节点（圆）
│   └── TransitionNode.tsx   # 变迁节点（矩形）
└── edges/
    └── ArcEdge.tsx          # 弧（箭头/虚线/空心圆）
src-tauri/
└── src/
    └── lib.rs               # Tauri 命令（含 DeepSeek 调用）
```

## License

MIT
