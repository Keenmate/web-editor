# @keenmate/web-editor

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A framework-agnostic WYSIWYG / Markdown editor, shipped as a `<km-editor>` Web
> Component on [ProseMirror](https://prosemirror.net/).

## What is it

`@keenmate/web-editor` is a custom element (`<km-editor>`) that gives you one
editable document with **Markdown, HTML, and JSON as import/export formats at the
edges**. It's built on [ProseMirror](https://prosemirror.net/) and the shared
`@keenmate/web-components-core` runtime (shadow DOM, adopted styles) — the same
model as the rest of the Keenmate component line. Works in React, Vue, Svelte,
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
- 🛠 [Usage](./docs/usage.md) — the full API: attributes, events, methods, labels, forms, extending,
  the headless `EditorEngine`.
- 🎨 [Theming](./docs/theming.md) · ♿ [Accessibility](./docs/accessibility.md) ·
  🧩 [Examples](./docs/examples.md) — every example page and section.
- 📝 [Changelog](./CHANGELOG.md) — every change (pre-release: the `[Unreleased]` section).
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

<km-editor value="# Hello" content-format="markdown" toolbar="top"></km-editor>
```

**Programmatic — dynamic content + events:**

```js
import '@keenmate/web-editor';

const editor = document.querySelector('km-editor');

editor.addEventListener('ready', () => editor.focus());
editor.addEventListener('change', (e) => {
  console.log(e.detail.value, e.detail.contentFormat);
});
// …or the camelCase twin, called with the same detail:
editor.onChange = ({ value, contentFormat, controller }) => console.log(value, contentFormat);

editor.setValue('## New heading', 'markdown');
editor.value;         // live content in the active `contentFormat` (the `value` attribute is only the initial content)
editor.getMarkdown(); // live content as markdown, whatever `contentFormat` is
editor.controller.runCommand('bold'); // the public facade (also on every event detail)
```

## Usage

Every attribute is also a property (`view-mode` ↔ `el.viewMode`); every event bubbles and has a
camelCase twin (`change` ↔ `el.onChange`, called with the same detail). The full reference is
**[docs/usage.md](./docs/usage.md)**:

- [Attributes and properties](./docs/usage.md#attributes-and-properties) — `value`, `content-format`,
  `view-mode`, `toolbar`, `statusbar`, `readonly`, `disabled`, `labels`, `locale`, `name`, …
- [Events](./docs/usage.md#events) — `change`, `ready`, `view-mode-change`, `lock-change`,
  `value-format-error`, `action`
- [Methods](./docs/usage.md#methods-and-properties) — `getMarkdown()` / `getHTML()` / `getJSON()`,
  `setValue()`, `setViewMode()`, `focus()`, `controller`, `plugins`
- [Labels](./docs/usage.md#labels) (UI strings, i18n) · [Forms](./docs/usage.md#forms) ·
  [Responsive rules](./docs/usage.md#responsive-rules)
- [Extending](./docs/usage.md#extending) — plugins, toolbar / menu items, icons;
  [Build your own UI](./docs/usage.md#build-your-own-ui) — the headless `EditorEngine`

## Theming

Shadow-DOM scoped; dark mode follows the page (or `<km-editor data-theme="dark">`). Re-theme with
`--base-*` on `:root` (every Keenmate component follows) or `--we-*` on the element:

```css
km-editor { --we-accent: #7c3aed; --we-min-height: 320px; }
```

Variables, dark mode, custom CSS in the shadow root, the loader, motion:
**[docs/theming.md](./docs/theming.md)**.

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

## About

Authored and maintained by [Keenmate s.r.o.](https://keenmate.com/).
The component ships standalone with sensible light/dark defaults;
when mounted inside [Pure Admin](https://pureadmin.io/) — or any
host that publishes the `--base-*` taxonomy via
[`@keenmate/theme-designer`](https://www.npmjs.com/package/@keenmate/theme-designer) — it adopts the host's colors,
typography, and sizing automatically. There is no runtime
dependency on Pure Admin; the integration is opt-in via CSS
variables.

## Built with BlissFramework

Follows the [BlissFramework component guidelines](https://blissframework.dev/)
for structure, theming, color-scheme, and accessibility.

## License

MIT © Keenmate s.r.o. — see [`LICENSE`](./LICENSE).
