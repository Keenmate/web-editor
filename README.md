# @keenmate/web-editor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A framework-agnostic WYSIWYG / Markdown editor, shipped as a `<km-editor>` Web
> Component on [ProseMirror](https://prosemirror.net/).

## What is it

`@keenmate/web-editor` is a custom element (`<km-editor>`) that gives you one
editable document with **Markdown, HTML, and JSON as import/export formats at the
edges**. It's built on [ProseMirror](https://prosemirror.net/) and the shared
`@keenmate/web-components-core` runtime (shadow DOM, adopted styles) — the same
model as the rest of the KeenMate component line. Works in React, Vue, Svelte,
Blazor, or plain HTML.

**Headline features:**

- Single document model — Markdown / HTML / JSON are just the I/O lens, switchable
  without rebuilding the content.
- Four view modes — `edit`, `split` (editor + live output), `preview` (read-only),
  and `inline` (a floating card that can anchor to a page element).
- A command-driven toolbar that docks to any edge, a floating selection toolbar, a
  right-click context menu, and a status bar with live word/char counts.
- Plugin-assembled — links, images, tables, and code highlighting are first-party
  plugins; you can add your own.
- Framework-agnostic: declarative attributes for the simple case, a small
  imperative API for dynamic content and events.

## Demos & docs

- 🧪 [Live examples](https://examples.web-editor.keenmate.dev) — the hosted example
  site (basic usage, rich content, plugins, the pipeline lab, and the playground).
- 📘 [Pipelines guide](./docs/pipelines/README.md) — how pipelines work, with diagrams.
- 📚 [Examples guide](./EXAMPLES.md) — the example-site convention.

## Install

```bash
npm install @keenmate/web-editor
```

## Quick start

**Declarative — just attributes:**

```html
<script type="module">
  import '@keenmate/web-editor';
</script>
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />

<km-editor value="# Hello" format="markdown" toolbar="top"></km-editor>
```

**Programmatic — dynamic content + events:**

```js
import '@keenmate/web-editor';

const editor = document.querySelector('km-editor');

editor.addEventListener('ready', () => editor.focus());
editor.addEventListener('change', (e) => {
  console.log(e.detail.value, e.detail.format);
});
// …or the camelCase twin, called with the same detail:
editor.onChange = ({ value, format, controller }) => console.log(value, format);

editor.setValue('## New heading', 'markdown');
editor.getMarkdown(); // live content — getValue reads live edits, not the `value` attribute
editor.controller.runCommand('bold'); // the public facade (also on every event detail)
```

## Options

Every attribute is also a property (e.g. `el.mode = 'preview'`).

| Attribute   | Values                                          | Default      | Description |
| ----------- | ----------------------------------------------- | ------------ | ----------- |
| `value`     | string                                          | —            | Initial content, interpreted per `format`. Reassigning replaces the document. Reading `el.value` returns the **assigned** value, not live edits — use `getValue()`. |
| `format`    | `markdown` \| `html` \| `json`                  | `markdown`   | Serialization lens for content I/O (`value`, `getValue()`, the `change` detail). Switching re-reports the same document in the new format — it never rebuilds it. |
| `mode`      | `edit` \| `split` \| `preview` \| `inline`      | `edit`       | Presentation. `preview` forces read-only. `inline` renders a floating card (see `anchor`). |
| `readonly`  | boolean                                         | `false`      | Make the editor read-only. `mode="preview"` also forces this on. |
| `toolbar`   | `top` \| `bottom` \| `start` \| `end` \| `none` | `top`        | Which edge the command toolbar docks to (`none` hides it). The selection toolbar and context menu are always available while editing. |
| `statusbar` | `none` \| `top` \| `bottom` \| `both`           | `none`       | A dedicated strip of live indicators (word/char count, plugin items). `both` splits items across two strips. |
| `theme`     | string                                          | —            | Theme name, reflected to the host for CSS theming (`:host([theme="…"])`). |
| `anchor`    | CSS selector                                    | —            | For `mode="inline"` only: the page element the floating card tracks. |

Property-only inputs:

| Property               | Type | Description |
| ---------------------- | ---- | ----------- |
| `beforeActionCallback` | `(detail) => false \| void \| Promise<…>` | Runs first on every toolbar / selection-toolbar / context-menu activation; `false` cancels (no `onClick`, no `action` event, no command). |
| `interactionHost`      | `{ request(ctx) }` | The modal bridge interactive pipeline stages call (`ctx` = request + `signal` + `controller` / `element`). Default: `window.confirm`. Survives engine rebuilds. |

**Events** — bubble, not composed. Each has a camelCase twin property (`onChange`,
`onReady`, `onModeChange`, `onLockChange`, `onAction`) called with the **same detail**
before the DOM event. Every detail carries `controller` and `element` (non-enumerable —
`JSON.stringify(detail)` shows only the data).

| Event         | `detail`              | Fires when |
| ------------- | --------------------- | ---------- |
| `change`      | `{ value, format }`   | Content changes (serialized in the active `format`), or `format` switches. |
| `ready`       | the context only      | The engine has mounted and is ready (once). |
| `mode-change` | `{ mode }`            | The `mode` changes. |
| `lock-change` | `{ isLocked }`        | A gating pipeline (e.g. the cloud-image picker) locks / unlocks the editor. |
| `action`      | `{ action, id, item, source, sourceEvent, triggerElement, dataset, state }` | A toolbar / selection-toolbar / context-menu item was activated (`source`: `toolbar` \| `selection-toolbar` \| `context-menu`). After the item's `onClick` and the command (a notification after the fact; `state` is the snapshot from activation). Keyboard shortcuts don't fire it. |

**Methods & properties:**

| Member                    | Returns              | Description |
| ------------------------- | -------------------- | ----------- |
| `getValue(format?)`       | `string`             | Live content in `format` (defaults to the active `format`). |
| `getMarkdown()` / `getHTML()` | `string`         | Live content in that format. |
| `getJSON()`               | `unknown`            | Live content as the ProseMirror JSON document. |
| `setValue(value, format?)`| `void`               | Replace the document from `value`. |
| `focus()`                 | `void`               | Focus the editing surface. |
| `isReady`                 | `boolean`            | Whether the engine is mounted. |
| `plugins`                 | `EditorPlugin[]`     | The active plugin set — assign to compose with `defaultPlugins()` (rebuilds, preserving content). |
| `controller`              | `EditorController`   | The public facade (also `detail.controller` / `ctx.controller`): `getValue` / `getContent` / `getHTML` / `getMarkdown` / `getJSON`, `setValue`, `focus`, `isReady`, `runCommand(name \| ProseMirror command)`, `isCommandToggled(name)`, `isCommandEnabled(name)`. Programmatic — no `action` event. |
| `destroy()`               | `void`               | Tear down the element and its engine. |

The internal engine is not exposed on the element; `EditorEngine` is exported for
standalone (headless) use.

## Theming

The component is shadow-DOM scoped, so its styles don't leak and page styles don't
bleed in. Ship the stylesheet once:

```html
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />
```

Set `theme="…"` to target a theme from your own CSS via `:host([theme="…"])`.

## Extending

The editor assembles itself from a **plugin set**. Links, images, tables, and code
highlighting are first-party plugins used by default; you can add your own with
`definePlugin(...)` and compose them with `defaultPlugins()`:

```js
import { definePlugin, defaultPlugins } from '@keenmate/web-editor';
// …define a plugin, then:
document.querySelector('km-editor').plugins = [...defaultPlugins(), myPlugin];
```

**Toolbar / menu items** are web-components-core action items. A registered command
name is a built-in (`'bold'`, `{ action: 'insert-link', text: 'Insert link' }`) — its
text, icon, tooltip, shortcut and toggled / disabled state come from the command. Custom
items use `action: 'custom'` + `id` and `onClick(detail)`; dividers are
`{ divider: true }` (or `menuDivider()`):

```js
const myPlugin = definePlugin({
  name: 'save',
  toolbarGroups: [{
    id: 'save',
    text: 'Save',
    items: ['undo', 'redo', { divider: true }, {
      action: 'custom', id: 'save', text: 'Save', icon: '💾',
      getIsDisabledCallback: ({ state }) => state.doc.textContent.length === 0,
      onClick: ({ controller }) => api.save(controller.getMarkdown()),
    }],
  }],
});
editor.beforeActionCallback = ({ action }) => (action === 'insert-image' ? false : undefined); // false cancels
```

Writing plugins (schema nodes/marks, commands, keybindings, toolbar/menu items,
the Markdown-serializer contract) and the content-pipeline layer are covered in
[`docs/`](./docs/) — see the **[Pipelines guide](./docs/pipelines/README.md)** (with
diagrams) — plus [`PLAN.md`](./PLAN.md) and the [`PIPELINES.md`](./PIPELINES.md)
design note.

## Browser support

Modern evergreen browsers — anything with native `customElements` and Shadow DOM
(Chrome/Edge, Firefox, Safari 15.4+). No polyfills are shipped.

## Develop

```bash
npm install
npm run dev                 # examples hub + pages on http://localhost:12700
npm run build               # CEM analyze + library build (dist/)
npm test                    # unit tests (Vitest)
npm run test:e2e            # e2e tests (Playwright)
```

The example site (hub + per-feature pages) runs on
[`@keenmate/web-components-devkit`](https://github.com/keenmate/web-components):
`npm run build:examples` produces the static `dist-examples/` site, and `make
image-build` packages it with nginx. `make` lists every target.

## License

MIT © Keenmate s.r.o. — see [`LICENSE`](./LICENSE).
