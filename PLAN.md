# KeenMate Web Editor — Build Plan

A framework-agnostic WYSIWYG / Markdown editor, delivered as a Web Component
(`<km-editor>`) built on **ProseMirror** and the shared
**`@keenmate/web-components-core`** (`BlissElement`), consistent with the rest of
the KeenMate component line (web-multiselect, web-grid, web-treeview, …).

## Background & decisions

- **Origin.** Lifted from the `web-wysiwyg` POC (modern ProseMirror + Vite). The
  abandoned `tui.editor` was evaluated as a base and rejected: it is frozen on an
  un-upgradeable ProseMirror (hand-written `@types/prosemirror` shims + a
  "temporary" version pin), maintains a bespoke CommonMark fork (`toastmark`,
  stuck at alpha), ships a hand-rolled VDOM, and rides a dead toolchain
  (snowpack/lerna3). We mine its ideas (especially markdown↔WYSIWYG edge cases),
  not its code.
- **Single model.** One ProseMirror document. Markdown and HTML are **import /
  export at the edges** (via `prosemirror-markdown` / `DOMSerializer`), *not* a
  second editing surface. This deliberately avoids the round-trip "convertor
  treadmill" that generated most of tui.editor's bug tail. (A live raw-markdown
  editing mode is explicitly out of scope for v1.)
- **UI model.** Headless engine (zero UI-framework dependency) + a thin
  `BlissElement` Web Component shell. The custom element is the universal wrapper
  — natively consumable by plain JS/TS, React, Vue, and Blazor — so there are
  **no per-framework wrapper packages**.
- **Repo.** Monorepo (npm workspaces): a core editor package plus `plugins/*`.

## Target structure

```
web-editor/
  packages/
    editor/            @keenmate/web-editor            engine + <km-editor> element
    plugin-*/          @keenmate/web-editor-plugin-*    official plugins
  examples/            examples-*.html showcase (parity with web-multiselect)
```

Toolchain per package mirrors the KeenMate line: Vite library build, TypeScript,
Vitest (+ happy-dom) for unit, Playwright for e2e, `cem analyze` →
web-types/vscode custom data, CSS-variable theming.

## Phases (infrastructure first)

### Phase 0 — Repo & tooling  ✅ (this commit)
Scaffold the monorepo on the KeenMate toolchain and port the POC `main.js` into
TypeScript modules with **behaviour unchanged**. No new features.
- `packages/editor` with Vite lib build, tsconfig (extends root base), Vitest.
- POC split into: `schema.ts`, `commands.ts`, `editor.ts`,
  `plugins/syntax-highlight.ts`, and provisional playground-only
  `plugins/floating-toolbar.ts` + `plugins/debug.ts`.
- `src/dev/main.ts` + `index.html`: the playground, running exactly like the POC.
- Smoke unit test for schema/state assembly.

> Provisional code: `floating-toolbar.ts` and `debug.ts` are DOM-id-coupled
> playground ports; they are replaced in Phases 3–4 and are **not** part of the
> shipped library surface (`src/index.ts`).

### Phase 1 — Headless engine + serialization  ✅
`EditorEngine` (`engine/editor-engine.ts`) owns the PM view/state, schema,
command registry, and event bus, and exposes the serialization API.
- `engine/event-emitter.ts` — typed event bus (`change`, `selectionUpdate`,
  `transaction`, `ready`, `destroy`).
- `engine/command-registry.ts` + `engine/default-commands.ts` — commands carry
  `run` + optional `keys` / `isActive` / `isEnabled`; the registry builds the
  keymap plugin. Structural keys (Enter/Tab) stay in `editor.ts`.
- `engine/serialization/` — `html` + `json` (lossless round-trip), `markdown`
  (prosemirror-markdown serializer for the full node set, tables via raw-HTML
  fallback; markdown-it CommonMark parser for the core set). Public helpers
  `serialize()` / `parse()`.
- `schema.ts` refactored to `baseNodes` / `baseMarks` / `buildSchema()` — the
  seam the plugin system grows into.
- Dev playground dogfoods the engine (toolbar → `engine.commands`) and shows a
  live HTML/Markdown/JSON output panel. 13 unit tests.

> Known limitations (deferred): Markdown **import** does not parse tables or
> blockquotes back into nodes (export emits tables as raw HTML). Schema is not
> yet plugin-extensible at the engine boundary (Phase 5). HTML/JSON are lossless.

### Phase 2 — `<km-editor>` Web Component  ✅
`BlissElement` shell over the engine (`src/web-component.ts`). First shippable
artifact — the element is now the package's primary entry point.
- **Inputs** (`static inputs` table): `value` (content source, `reinit`),
  `format` (markdown/html/json I/O lens, `update`, reflected), `mode`
  (edit/split/preview/inline, `update`, reflected), `readonly` (`update`),
  `theme` (`update`, reflected). `preview` forces read-only.
- **Events** (`static events` → managed `onChange`/`onReady`/`onModeChange`):
  `change` (`{ value, format }`), `ready`, `mode-change` (`{ mode }`).
- **Content API** (not inputs, since core's input accessors shadow a subclass
  getter): `getValue()/getContent()/getHTML()/getMarkdown()/getJSON()`,
  `setValue()`, `engine`, `isReady`, `focus()`, `destroy()`.
- Engine gained `editable` option + `setEditable()`/`isEditable()`.
- Shadow DOM + `adoptStyles` (editor.css inlined), `createLoggers('EDITOR')`
  shim, `registerComponent('km-editor', …)` with build metadata. 10 element
  unit tests (23 total).

> Known limitations (deferred): `split`/`inline` modes store + reflect + announce
> only — real layouts land in Phase 3. Prism code-highlight CSS is still
> JS-injected into the document head, so token colours don't reach the shadow
> root yet (fixed when highlighting becomes a plugin in Phase 5). Content isn't
> re-serialized across a `format` switch mid-edit (the document is single-model,
> so the lens just changes; no data loss).

### Phase 3 — View modes & mounting (B1 core)  ✅
`src/ui/view-layout.ts` (`ViewLayout`) owns the shadow structure for all four
modes; the element delegates to it and re-renders on `mode`/`anchor` change.
- `edit` — editor surface alone.
- `split` — editor + a live output panel with md/html/json tabs (independent of
  the I/O `format`), refreshed on every engine `change`.
- `preview` — editor surface, read-only (the element forces editable off).
- `inline` — the host floats as an overlay card; with an `anchor` CSS-selector
  input it tracks that live-page element via core `anchor()` (`@keenmate/
  web-components-core/positioning`), else renders in normal flow.
- The editor **mount node is persistent** — switching modes re-parents it, so the
  live document + selection survive (covered by a test).
- Component-scoped CSS (`:host` / `.km-*`, theme vars, `theme="dark"`) added to
  `editor.css` (inert in the playground's light DOM). New `anchor` input.
- Playground now dogfoods the shipped `<km-editor>` (mode / format / readonly /
  theme controls + status line) above the raw-engine harness. 29 unit tests.

> Known limitations (deferred): `inline` doesn't yet sync edits back to the
> anchored target (consumers read `getValue()` on `change`) or trap focus /
> dismiss on outside-click — that chrome lands with the overlay work in Phase 4.
> Prism highlight CSS still JS-injects to the document head (Phase 5 plugin).

### Phase 4 — Toolbars & context menus (B1 UI)  ✅
One command-driven item model (`ui/items.ts`: `ToolbarItem` = command ref +
display metadata, or separator) consumed by three presenters, all binding to the
engine's `CommandRegistry` and reflecting `isActive` / `isEnabled`:
- `ui/command-bar.ts` — the shared renderer (`variant: 'bar'` icons / `'menu'`
  labels); `refresh()` toggles `active` + `disabled` per command.
- `ui/toolbar` (static) — a `CommandBar` in the layout's persistent `toolbarMount`
  slot (new `toolbar` input: `top` | `none`; hidden in read-only / preview).
- `ui/selection-toolbar.ts` — floating formatting bar over a non-empty text
  selection, positioned via core `createPopover` against a live selection-rect
  virtual element; suppressed in code blocks / when not editable.
- `ui/context-menu.ts` — right-click editing menu at the cursor (core
  `createPopover` point reference), dismiss on outside-pointerdown / Escape / run;
  suppressed when not editable (native menu shows through).
- `ui/chrome.ts` (`EditorChrome`) — owns the three presenters, refreshes them on
  `selectionUpdate` / `change`; lifetime tied to the engine (rebuilt with it). The
  floating panels portal into a persistent shadow `overlayLayer` (theme-scoped,
  survives view-mode re-renders).
- `default-commands.ts` — prompt-driven commands (`insert-link`/`-image`/
  `-code-block`, `change-code-language`) gained explicit `isEnabled` so a toolbar
  refresh never dry-runs them into a `prompt()`/`alert()`; list commands gained
  `isActive`. 11 new unit tests (40 total).

> Known limitations (deferred): the selection toolbar + context menu are always
> on while editing (no per-presenter input yet). Insert commands still use
> `prompt()` dialogs (real link/image popovers are a later pass). Context menu is
> a fixed general-editing list — not yet context-aware (e.g. table-row ops in a
> table). The provisional Phase 0 `floating-toolbar.ts` / `debug.ts` playground
> ports remain for the raw-engine harness and are still out of the shipped
> surface.

#### Phase 4.1 — Zones, tool groups & status bar  ✅
Generalised the single static toolbar into **edge zones** + a dedicated **status
bar**:
- The `toolbar` input gained all four edges (`top`/`bottom`/`start`/`end`/`none`);
  the toolbar + editor are wrapped in one bordered `.km-shell` frame so the
  toolbar sits flush (a divider, not a detached card). `start`/`end` render a
  vertical strip.
- The toolbar lays out **tool groups** (`ToolGroup`): contiguous, divider-separated
  button clusters that wrap into rows/columns — the Word-style grouped toolbar and
  the self-contained unit a future drag-and-drop will reorder. `ToolbarZone`
  renders one `CommandBar` (class `km-group`) per group.
- New **status bar** (`statusbar` input: `none`/`top`/`bottom`/`both`) — a
  dedicated strip of live `StatusItem` indicators (`Words`/`Chars`, + plugin
  items) that **hugs the editor body** (toolbar stays on the outside), deliberately
  separate from the tool zones so group drag-and-drop never has to exclude
  non-draggable status. `both` renders two strips, split by `item.bar`.
- Plugins contribute `toolbarGroups` / `statusItems` (alongside
  `selectionItems`/`menuItems`); the engine assembles + exposes
  `toolbarGroups`/`statusItems`/… and the chrome consumes them. 52 tests.

> Deferred: drag-and-drop reordering of groups (groups are already the unit);
> multiple simultaneous toolbar zones (one toolbar edge + one status edge today);
> cursor line/col status item.

### Phase 5 — Plugin system (B2)  ✅
`definePlugin({ name, dependencies?, nodes?, marks?, markdown?, commands?,
keymap?, pmPlugins?, toolbarItems?, selectionItems?, menuItems?, setup?,
destroy? })` (`engine/plugin.ts`). The engine assembles itself from a plugin set
(`editorPlugins`, default `defaultPlugins()`) in dependency order
(`orderPlugins`, topological): schema (`buildSchema(mergeSchemaSpecs(...))`),
commands (core + plugin), ProseMirror plugins + structural keymaps, Markdown I/O,
and toolbar/selection/menu item lists are all merged.
- **Contract rule, enforced.** HTML + JSON are schema-driven (a node/mark's
  `toDOM`/`parseDOM` already serve them); Markdown is the one target needing
  explicit wiring. `engine/markdown-io.ts` (`buildMarkdownIO`) merges the core
  Markdown maps with each plugin's `markdown` contribution and **throws at engine
  assembly** if any schema node/mark lacks a Markdown serializer — the gap that
  made tui.editor's outputs drift, now a loud failure.
- **Dogfooded.** Links, images, tables, and code-highlight are first-party
  plugins (`src/plugins/{link,image,tables,code-highlight}.ts`); `schema.ts` is
  split into `coreNodes`/`coreMarks` + the feature specs the plugins contribute.
  The default plugin set reproduces the full editor exactly (48 tests, incl. 8 new
  plugin-system tests: ordering, contract enforcement, a custom `strike` plugin,
  a trimmed set, default parity).
- The chrome consumes the engine-assembled `toolbarItems`/`selectionItems`/
  `menuItems`, so a custom plugin set drives the toolbars automatically.

> Known limitations (deferred): Markdown *import* still doesn't parse tables back
> into nodes (export is the raw-HTML fallback; HTML/JSON round-trip losslessly).
> `setup`/`destroy` are called but there's no per-plugin state container yet. The
> back-compat `schema` singleton / `createEditorState` still expose the full set
> directly (used only by the provisional playground harness).

### Phase 6 — Hardening
cem manifest (web-types/vscode), THEMING.md, examples, e2e — the web-multiselect
release bar.

## Notes / open items

- `@keenmate/web-components-core` is **not yet wired** (added in Phase 2 with the
  element). Requires access to the registry that serves the KeenMate scope.
- Decide ProseMirror externalization vs bundling before first publish (Phase 0
  bundles everything, like web-multiselect bundles floating-ui).
