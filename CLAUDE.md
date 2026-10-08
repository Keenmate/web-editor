# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@keenmate/web-editor` — a framework-agnostic WYSIWYG / Markdown editor built on
[ProseMirror](https://prosemirror.net/) and shipped as a `<km-editor>` **Web
Component** on the shared `@keenmate/web-components-core` runtime (`BlissElement`,
shadow DOM, adopted styles). It is an **npm-workspaces monorepo** (`packages/*`),
though today there is a single package: `packages/editor` (`@keenmate/web-editor`).

Ideas are mined from the abandoned TOAST UI Editor, but **none of its code is
reused** — this is a clean, single-model design.

### Single-model architecture (the core idea)

Unlike dual-surface editors (separate Markdown and WYSIWYG models kept in sync),
this editor has **one ProseMirror document** as the single source of truth.
Markdown / HTML / JSON are only **import/export formats at the edges**:

- **HTML and JSON round-trip losslessly** (they come straight from the schema).
- **Markdown is a serialization at the boundary** — `prosemirror-markdown`
  (`MarkdownSerializer`) out, `markdown-it` (CommonMark preset) in. Some
  constructs (e.g. tables) export as a raw-HTML GFM fallback and do **not** parse
  back into nodes on import.

## Commands

All scripts run from the **repo root** (npm workspaces). A `Makefile` wraps the
common ones; either works.

```bash
npm install                 # root; installs the workspace
npm run dev                 # Vite dev playground for the editor (port 21113)
npm run build               # build all packages (Vite lib build: ES + UMD + style.css + dts)
npm run build:types         # emit TypeScript declarations (tsc, emitDeclarationOnly)
npm test                    # run unit tests across workspaces

# Per package (equivalent):
npm run dev        -w @keenmate/web-editor
npm run build      -w @keenmate/web-editor
npm run test:unit  -w @keenmate/web-editor      # vitest run (happy-dom)
npm run test:unit:watch -w @keenmate/web-editor # vitest watch
```

Run a single test file or by name (from `packages/editor`):

```bash
npx vitest run test/unit/plugin.test.ts
npx vitest run -t "later plugin wins on an id conflict"
```

There is **no ESLint config** (the `lint` Makefile target is a no-op placeholder).
The real pre-change gate is: `build:types` (tsc) clean + `test:unit` green + the
lib builds.

> **Note on the shell:** the Bash tool resets cwd to `C:\Git\General\tui.editor`
> after every command. Prefix commands with `cd /c/Git/KM/web-editor` (and the
> cwd will not persist to the next call).

## Architecture (`packages/editor/src`)

Two layers: a **headless engine** and a **Web Component** that wraps it. The
element is the primary entry point; the engine is also exported for programmatic
use.

### The headless engine — `engine/`

- `editor-engine.ts` (`EditorEngine`) — owns the ProseMirror `EditorView` +
  state, assembles schema / commands / PM plugins / keymaps / Markdown I/O /
  chrome items **from the active plugin set in dependency order**, and exposes a
  typed event bus (`change` / `selectionUpdate` / `transaction` / `ready` /
  `destroy`) plus the serialization API. Read-only getters surface the assembled
  `toolbarGroups`, `toolbarItems`, `selectionItems`, `menuItems`, `statusItems`.
- `command-registry.ts` (`CommandRegistry`, `CommandSpec`) — commands carry
  `run` / `isActive` / `isEnabled`; the chrome reflects active/enabled state.
  **Formatting/history keybindings live on commands, not in `editor.ts`.**
- `default-commands.ts` — core command set (bold, italic, headings, lists, …).
- `plugin.ts` — the plugin model (`EditorPlugin`, `definePlugin`) and assembly:
  `orderPlugins` (stable topological sort over `dependencies`; throws on missing
  dep / cycle), `mergeSchemaSpecs`, `assembleItems` (flat selection/menu items),
  `assembleGroups` / `assembleStatusItems` (**id-keyed layering** —
  core-leading → plugins → core-trailing; a matching `id` replaces in place with
  later-plugin-wins, `removeToolbarGroups` / `removeStatusItems` drop entries).
- `default-plugins.ts` — `defaultPlugins()` = `[link, image, tables, code-highlight]`.
- `markdown-io.ts` — `buildMarkdownIO(schema, plugins)` merges core + plugin
  Markdown maps and **enforces the serializer contract**: any schema node
  (except `doc`) or mark lacking a Markdown serializer **throws at assembly**.
- `serialization/` — `html.ts`, `json.ts`, `markdown.ts` (+ `index.ts`). Public
  `serialize(doc, schema, format)` / `parse(text, schema, format)`.
  `serialization/markdown.ts` is a leaf (no plugin imports) to avoid cycles.
- `event-emitter.ts` — the typed `EventEmitter`.

### The schema seam — `schema.ts`

Specs are split into **core** (`coreNodes` / `coreMarks`, always present) and
**feature** specs (`linkMarkSpec`, `imageNodeSpec`, `tableNodeSpecs`) that the
first-party plugins contribute. `buildSchema` assembles core + whatever the
plugin set adds — this is how the engine grows its schema. The exported `schema`
singleton remains the **full** set (core + default features) for standalone use;
the default plugin set reproduces it exactly.

### First-party plugins — `plugins/`

`link.ts`, `image.ts`, `tables.ts`, `code-highlight.ts` are the default feature
plugins. Also here: `syntax-highlight.ts` (Prism integration for code blocks),
`floating-toolbar.ts`, `debug.ts`. Each feature plugin contributes schema +
commands + a Markdown serializer + a toolbar group keyed by its own id.

### The Web Component — `web-component.ts`

`KmEditorElement` (`BlissElement`). `static inputs`: `value`, `format`
(`markdown`/`html`/`json`), `mode` (`edit`/`split`/`preview`/`inline`), `readonly`,
`toolbar` (`top`/`bottom`/`start`/`end`/`none`), `statusbar`
(`none`/`top`/`bottom`/`both`), `theme`, `anchor`. Events: `change`, `ready`,
`mode-change`. Content API: `getValue`/`getHTML`/`getMarkdown`/`getJSON`,
`setValue`, `focus`, `engine`, `isReady`, and a `plugins` property (register a
custom plugin set; reassigning rebuilds the engine and preserves live content).

> **BlissElement gotcha:** the core installs instance-own accessors for every
> declared `input`, shadowing subclass prototype getters for those keys — so live
> reads of inputs must go through `this.config`. Non-input properties (like
> `plugins`) use plain class accessors safely.

### The chrome / UI — `ui/`

A small custom DOM layer (no framework), not the engine:

- `view-layout.ts` — builds the persistent shadow structure: a `.km-surface`
  (bordered frame, flex per `km-tb-{side}`) holding the toolbar mount + a
  `.km-body` group (status strips hug the editor mount inside the body; the
  toolbar docks outside).
- `chrome.ts` (`EditorChrome`) — owns the toolbar zone, the two status strips,
  the selection toolbar, and the context menu; reads its lists from the engine.
- `toolbar-zone.ts` — renders one `CommandBar` (`.km-group`) per `ToolGroup`,
  divider-separated, wrapping into rows/columns.
- `status-bar.ts` — a dedicated strip of live `StatusItem`s (separate from tool
  groups so it is never draggable); supports `both` via per-item `bar` targeting.
- `command-bar.ts` — the flat button bar reused by the selection toolbar and
  context menu. `selection-toolbar.ts` / `context-menu.ts` use `@floating-ui/dom`
  (via the core positioning helpers) to float over the selection / at the cursor.
- `items.ts` — the item/group/status model (`CommandItem`, `SeparatorItem`,
  `ToolGroup`, `StatusItem`) and the **core constants** (`coreToolbarGroups`,
  `coreHistoryGroups`, `coreSelectionItems`, `coreMenuItems`, `coreStatusItems`).

### Entry point — `index.ts`

Imports `css/editor.css` (→ shipped `dist/style.css` + adopted stylesheet),
registers `<km-editor>` via `registerComponent`, and re-exports the engine,
plugin system, serialization, and schema building blocks.

## Conventions

- **TypeScript is loose** (`tsconfig.base.json`): `strict: false`,
  `strictNullChecks: false`, `noImplicitAny: false` — mirrors the rest of the
  KeenMate component line. `target: ES2020`, `moduleResolution: bundler`,
  `emitDeclarationOnly` (builds go through Vite/Rollup; tsc is types-only).
- **Build:** Vite lib build bundles *everything* (ProseMirror, Prism,
  floating-ui) into the package — `rollupOptions.external: []`. Output: ES
  (`web-editor.js`) + UMD (`web-editor.umd.js`) + `style.css` + `index.d.ts`.
- `src/dev/main.ts` is the dev playground entry (excluded from the build + dts).
- **The serializer contract is load-bearing:** adding a schema node/mark without
  a Markdown serializer throws at engine assembly — never silently drops on
  export. When adding a node/mark to a plugin, add its `markdown` entry too.
- Build-time constants (`__VERSION__`, `__PACKAGE_NAME__`, …) are injected by
  Vite `define` from `package.json`; declare them locally where used.

## Git / release

- Work is committed on branch `prod`. Commit/push **only when asked**.
- Commit messages must end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- `~/.npmrc` holds `@keenmate` GitHub Packages auth tokens — **redact
  `_authToken` values** if its contents are ever displayed.
- Publishing goes through the `Makefile` (`publish`, `publish-rc`, `publish-dry`).
  Nothing is published yet (editor at `0.0.1`).

See [`PLAN.md`](./PLAN.md) for the phased roadmap and [`CHANGELOG.md`](./CHANGELOG.md)
for what has landed.
