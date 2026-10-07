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
- Categorised logging (`EDITOR:*`) via the shared core logging module.

### Notes

- Markdown import does not parse tables back into nodes (export is a raw-HTML GFM
  fallback); HTML and JSON round-trip losslessly.
- Deferred: drag-and-drop reordering of tool groups; multiple simultaneous toolbar
  zones; declarative (attribute/registry) plugin loading on the element.
