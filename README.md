# KeenMate Web Editor

A framework-agnostic WYSIWYG / Markdown editor, built on
[ProseMirror](https://prosemirror.net/) and delivered as a Web Component on the
shared `@keenmate/web-components-core` runtime — the same model as the rest of
the KeenMate component line.

> **Status: Phase 2.** The headless engine + HTML/Markdown/JSON serialization
> (Phase 1) and the `<km-editor>` Web Component (Phase 2) are in place — the
> element is the primary entry point. View modes (`split`/`inline`), toolbars,
> context menus, and the plugin system are next. See [`PLAN.md`](./PLAN.md).

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
(`edit`|`split`|`preview`|`inline`), `readonly`, `theme`.
Events: `change`, `ready`, `mode-change`.

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
