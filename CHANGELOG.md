# Changelog

All notable changes to `@keenmate/web-editor` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-1.0, pre-publish. Everything below is the work to date; nothing has been
released to a registry yet.

### Added

- **Headless `EditorEngine`** — owns the ProseMirror view/state, schema, command
  registry, and a typed event bus (`change` / `selectionUpdate` / `transaction` /
  `ready` / `destroy`), with an HTML / Markdown / JSON serialization API
  (`serialize` / `parse`, lossless HTML+JSON; Markdown import/export at the edges).
- **`<km-editor>` Web Component** on `@keenmate/web-components-core` (`BlissElement`,
  shadow DOM, adopted styles). Inputs: `value`, `format` (`markdown`/`html`/`json`),
  `mode`, `readonly`, `toolbar`, `statusbar`, `theme`, `anchor`. Events: `change`,
  `ready`, `mode-change`. Content API: `getValue`/`getHTML`/`getMarkdown`/`getJSON`,
  `setValue`, `focus`, `engine`, `isReady`.
- **View modes** — `edit`, `split` (editor + live md/html/json output), `preview`
  (read-only), and `inline` (overlay card that can anchor to a live-page element).
  The editor mount is persistent, so the document/selection survive a mode switch.
- **Command-driven chrome** — one command model behind a static zone toolbar, a
  selection floating toolbar, and a right-click context menu; all reflect each
  command's `isActive` / `isEnabled`.
- **Toolbar edge zones + tool groups** — the toolbar docks to any edge
  (`toolbar="top|bottom|start|end|none"`), flush against the editor in one bordered
  frame. Tools are organised into **groups** (contiguous, divider-separated
  clusters that wrap into rows/columns) — the self-contained unit for future
  drag-and-drop.
- **Status bar** — a dedicated strip of live indicators (`Words`, `Chars`, + plugin
  items) that hugs the editor body, separate from the tool zones.
  `statusbar="none|top|bottom|both"`; `both` renders two strips split by each
  item's `bar` (built-ins: Chars top, Words bottom).
- **Plugin system** — `definePlugin({ nodes, marks, markdown, commands, keymap,
  pmPlugins, toolbarGroups, selectionItems, menuItems, statusItems, setup, destroy,
  dependencies })`. The engine assembles schema, commands, ProseMirror plugins,
  keymaps, Markdown I/O, and chrome items from the plugin set in dependency order
  (`orderPlugins`). **Serializer contract enforced** at assembly: a schema
  node/mark with no Markdown serializer throws immediately.
- **First-party plugins** — `link`, `image`, `tables`, `code-highlight`
  (`defaultPlugins()`); the core schema is split into core + feature specs, which
  the default plugin set reproduces exactly.
- **Plugin override / remove by id** — `toolbarGroups` and `statusItems` are keyed
  by `id`: a matching id replaces in place (later plugins win), a new id slots in,
  and `removeToolbarGroups` / `removeStatusItems` drop entries (including core).
- **`<km-editor>.plugins` property** — register a custom plugin set on the element
  (compose with `defaultPlugins()`); reassigning rebuilds the engine and preserves
  the live content.
- **Pipeline layer (Phase 7) — "commands ARE pipelines".** A named, trigger/
  command-bound chain of async-by-default stages threading a context `{ doc, extra }`
  (outcomes `resolve` / `halt` / `skip`). The engine assembles one `PipelineRegistry`:
  every `CommandSpec` auto-wraps into a one-stage **sync** pipeline named by its id,
  so a toolbar button, a keybinding, and `engine.run(name)` all fire the same named
  pipeline — and anything triggerable is extensible the same way. Plugins declare
  pipelines (`EditorPlugin.pipelines`) and splice stages into any pipeline by anchor
  (`EditorPlugin.stages` — `before` / `after` / replace-in-place / `remove`); an
  unknown pipeline or a missing anchor throws at assembly (same strictness as the
  serializer contract). **Deferred** pipelines get the async machinery (abort /
  supersede, loader threshold, optional surface **lock** via `setEditable(false)`)
  and a host-injected `InteractionHost` for interactive (modal) stages; a stage
  writes to the document through `rt.dispatch` / `rt.runCommand`. New engine surface:
  `engine.pipelines`, `engine.run(name)`, `engine.setInteractionHost(host)`, a `lock`
  event, and an `interactionHost` option.
- **Cloud-image plugins** — `imageBrowserPlugin({ upload })` (a deferred, locking
  `image:browser:pick` pipeline: pick → upload → insert, with a toolbar ☁ button)
  and `imageBase64Plugin` (splices a `to-base64` stage **before** `insert` without
  importing the browser plugin — the extension-bus proof). Dev visualizer page
  (`pipelines.html`) gains a command-triggered image lane, a cloud picker, and a
  base64 toggle.
- Categorised logging (`EDITOR:*`) via the shared core logging module.
- **Examples site + `EXAMPLES.md`** — a hub `index.html` (page registry → cards +
  a floating jump-nav) with per-feature pages (Basic Usage, Rich Content, Plugins &
  Pipelines, Pipeline Lab, Playground) on a shared skeleton (`examples-shared.css` +
  self-initializing JS: chapter-nav / copy-link / controls-store). A multi-page
  Vite build (`build:examples` → `dist-examples/`) packages it as a self-contained
  static site; `EXAMPLES.md` is the portable guide for reproducing the convention.
- **Real-editor example pages.** A new **Rich Content** page puts the first-party
  content plugins on a small live `<km-editor>` — links, images, tables, and code
  with syntax highlighting — each card showing the feature land in the document,
  with a page-wide **Markdown / HTML / JSON output-lens toggle** on the readouts
  (one document, any serialization; the table card shows the raw-HTML-vs-clean-
  `<table>` contrast, HTML/JSON lossless). **Plugins & Pipelines** gains PP03
  **Cloud image → crop → insert**: a second plugin splices an interactive `crop`
  stage after `upload` into `image:browser:pick` (the browser plugin untouched),
  landing the cropped image in the editor. The former **Pipeline Visualizer** page
  becomes the **Pipeline Lab** — the run visualizer plus the (design-stage)
  phase/config-cell and image use-case prototypes folded in as sections; the two
  standalone prototype pages are removed.
- **Static examples image** — a two-stage `Dockerfile` (node build → nginx serve)
  + `nginx.conf` that serves `dist-examples/` and silently drops vulnerability-
  scanner traffic.
- **Pipeline ordering & configuration — design + dev prototype (design-stage).**
  `PIPELINES.md` gains the phase model: a pipeline-owned ordered **phase**
  vocabulary; the **propose/dispose** ladder (a plugin proposes a stage's `phase`,
  the app owner disposes via per-phase `order` / `assign`); soft intra-phase
  anchors (`afterIfPresent` / `beforeIfPresent`); and the **config cell** — config
  as a property of the `(stage × pipeline)` pair, resolved default ← factory ←
  per-pipeline and read by a stage as `rt.config`. Also: plugin **public API** as a
  first-class contract with wrapper/adapter plugins, and batch-as-a-wrapper. Two
  dev-only visualizations (now sections of the **Pipeline Lab** example page)
  prototype it end to end against the real assembler without touching the shipped
  engine — **Phases & Config Cell** (ordering + config
  resolution + the assembly throw cases) and **Image Pipeline Use Cases** (an
  interactive crop-editor stage, a planner driving the same crop stage headless,
  and the API-wrapper + batch + gallery flow, with real `Blob`s). Not yet promoted
  into the engine.

### Notes

- Markdown import does not parse tables back into nodes (export is a raw-HTML GFM
  fallback); HTML and JSON round-trip losslessly.
- Deferred: drag-and-drop reordering of tool groups; multiple simultaneous toolbar
  zones; declarative (attribute/registry) plugin loading on the element.
