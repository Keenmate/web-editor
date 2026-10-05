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

### Phase 1 — Headless engine + serialization
`EditorEngine` owning the PM state/view, a node/mark **registry** (schema built
from it), an event bus, and the **command registry** (built-ins wrap PM
commands; each command gains `isActive`/`isEnabled`/keys). The serialization
layer: `toHTML` / `toJSON` / `toMarkdown` (+ inverses) driving `value`/`format`.

### Phase 2 — `<km-editor>` Web Component
`BlissElement` shell over the engine: inputs (`mode`, `format`, `value`,
`readonly`, `theme`), events (`change`, `ready`, `mode-change`), `adoptStyles`
theming, `createLoggers`, `registerComponent`. First shippable artifact.

### Phase 3 — View modes & mounting (B1 core)
`edit` / `split` (editor + live output panel, format-switchable) / `preview`
(read-only) / `inline` (overlay chrome over a live-page element, using core's
`overlay/` + `positioning/` primitives).

### Phase 4 — Toolbars & context menus (B1 UI)
One command-driven item model consumed by three presenters: static toolbar,
selection floating toolbar, context menu. All reflect command `isActive` /
`isEnabled`. Replaces the provisional Phase 0 toolbar/debug plugins.

### Phase 5 — Plugin system (B2)
`definePlugin({ name, nodes?, marks?, commands?, toolbarItems?, menuItems?,
keymap?, pmPlugins?, serializers, setup?, destroy? })`. Engine merges schema,
commands, PM plugins, and serializers in dependency order. **Contract rule:**
every custom node/mark must declare its serializer for each output target
(html/markdown/json) — the gap that made tui.editor's outputs drift. Dogfood by
moving tables + code-highlight + links/images into first-party plugins.

### Phase 6 — Hardening
cem manifest (web-types/vscode), THEMING.md, examples, e2e — the web-multiselect
release bar.

## Notes / open items

- `@keenmate/web-components-core` is **not yet wired** (added in Phase 2 with the
  element). Requires access to the registry that serves the KeenMate scope.
- Decide ProseMirror externalization vs bundling before first publish (Phase 0
  bundles everything, like web-multiselect bundles floating-ui).
