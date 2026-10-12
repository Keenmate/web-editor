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

Scripts are in the root/package `package.json` (npm workspaces; the `Makefile`
wraps them). There is **no ESLint config** (the `lint` Makefile target is a
no-op placeholder). The real pre-change gate is: `npm run build:types` (tsc)
clean + `npm run test:unit -w @keenmate/web-editor` green + `npm run build`.

## Architecture notes (`packages/editor/src`)

Two layers: a headless `engine/` (`EditorEngine`, the primary programmatic API)
and the `<km-editor>` Web Component (`web-component.ts`) wrapping it, plus a
small framework-free chrome layer in `ui/`. Things the code won't tell you:

- **Keybindings live on commands** (`CommandSpec`), not in a central keymap.
- **Chrome layering is id-keyed:** toolbar groups / status items assemble as
  core-leading → plugins → core-trailing; a matching `id` replaces in place
  (later plugin wins), `removeToolbarGroups` / `removeStatusItems` drop entries.
- `serialization/markdown.ts` is a **leaf** (no plugin imports) to avoid cycles.
- The exported `schema` singleton is the **full** set (core + default
  features); `buildSchema` + the default plugin set must reproduce it exactly.
- Status items are a separate strip from tool groups so they are never draggable.
- Reassigning the element's `plugins` property rebuilds the engine and must
  preserve live content.

> **BlissElement gotcha:** the core installs instance-own accessors for every
> declared `input`, shadowing subclass prototype getters for those keys — so live
> reads of inputs must go through `this.config`. Non-input properties (like
> `plugins`) use plain class accessors safely.

## Conventions

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
