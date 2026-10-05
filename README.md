# KeenMate Web Editor

A framework-agnostic WYSIWYG / Markdown editor, built on
[ProseMirror](https://prosemirror.net/) and delivered as a Web Component on the
shared `@keenmate/web-components-core` runtime — the same model as the rest of
the KeenMate component line.

> **Status: Phase 5.** The headless engine + HTML/Markdown/JSON serialization
> (Phase 1), the `<km-editor>` Web Component (Phase 2), the four view modes —
> `edit` / `split` / `preview` / `inline` (Phase 3), the command-driven toolbars +
> context menu (Phase 4), and the plugin system (Phase 5) are in place. Only
> hardening (cem manifest / theming docs / examples / e2e) remains. See
> [`PLAN.md`](./PLAN.md).

## Usage

```html
<script type="module" src="@keenmate/web-editor"></script>
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />

<km-editor value="# Hello" format="markdown"></km-editor>
```

```js
const editor = document.querySelector('km-editor');
editor.addEventListener('change', (e) => console.log(e.detail.value)); // in `format`
editor.addEventListener('ready', () => editor.focus());

editor.getMarkdown();          // live content (getValue reads live edits, not the `value` attr)
editor.setValue('## New', 'markdown');
editor.setAttribute('readonly', '');   // or mode="preview"
```

Inputs: `value`, `format` (`markdown`|`html`|`json`), `mode`
(`edit`|`split`|`preview`|`inline`), `readonly`, `toolbar` (`top`|`none`),
`theme`, `anchor` (CSS selector the `inline` card tracks). Events: `change`,
`ready`, `mode-change`.

A command-driven **static toolbar** (above the editor), a **selection toolbar**
(floats over a text selection), and a **context menu** (right-click) all reflect
each command's active / enabled state. The toolbar item lists are assembled from
the active plugin set (core items + each plugin's items).

## Plugins

The editor assembles itself from a **plugin set**. Links, images, tables, and code
highlighting are first-party plugins; the engine uses them by default. A plugin
contributes schema nodes/marks, commands, keybindings, ProseMirror plugins,
toolbar/menu items — and, for every node/mark it adds, a **Markdown serializer**
(HTML + JSON come from the schema). That serializer contract is enforced at engine
assembly: a node/mark with no Markdown form throws immediately, rather than
silently dropping on export.

```js
import { definePlugin, defaultPlugins, EditorEngine } from '@keenmate/web-editor';
import { toggleMark } from 'prosemirror-commands';

const strike = definePlugin({
  name: 'strike',
  marks: { strike: { parseDOM: [{ tag: 's' }], toDOM: () => ['s', 0] } },
  markdown: { marks: { strike: { open: '~~', close: '~~' } } },
  commands: ({ schema }) => [{ id: 'strike', run: toggleMark(schema.marks.strike) }],
  toolbarItems: [{ type: 'command', command: 'strike', label: 'Strike', icon: 'S' }],
});

const engine = new EditorEngine({ mount, editorPlugins: [...defaultPlugins(), strike] });
```

## Monorepo layout

| Package | Description |
| --- | --- |
| [`packages/editor`](./packages/editor) — `@keenmate/web-editor` | Editor engine + `<km-editor>` element |

## Develop

```bash
npm install                 # from the repo root (npm workspaces)
npm run dev                 # dev playground for @keenmate/web-editor (Vite)
npm run build               # build all packages
npm test                    # run unit tests
```

Per package:

```bash
npm run dev        -w @keenmate/web-editor
npm run build      -w @keenmate/web-editor
npm run test:unit  -w @keenmate/web-editor
```

## License

MIT © Keenmate s.r.o.
