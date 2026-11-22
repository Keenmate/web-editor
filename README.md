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

## What's New in v1.0.0-rc01

Upgrade guide: the [1.0.0-rc01 release notes](release-notes/1.0.0-rc01.md); full list: the
[CHANGELOG 1.0.0-rc01 section](CHANGELOG.md).

- **First release — one document, three lenses** — This is the first version of `@keenmate/web-editor` on npm, so there is nothing to migrate. `<km-editor>` holds one ProseMirror document; `content-format` (`markdown` | `html` | `json`) only picks the lens for I/O, so switching it never rebuilds the content. The `value` attribute is the initial content and the `value` property the live content, like a native input; `getMarkdown()` / `getHTML()` / `getJSON()` read a fixed format. HTML and JSON round-trip losslessly; Markdown import does not parse tables back (export writes them as raw HTML).
- **View modes — edit, split, preview, inline** — `view-mode` switches between the editor, the editor next to a live Markdown / HTML / JSON output (a tab list), a read-only preview, and a floating card that tracks the page element named by `anchor`. The document, selection and undo history survive a mode switch and a DOM move, because the engine is built once and only its live resources pause on disconnect. `setViewMode()` and the toolbar's Edit / Split / Preview group fire `view-mode-change` with a `source`; assigning `viewMode` is silent. The split view stacks by the editor's own width (a container query), not the viewport.
- **Toolbars and menus — core action items** — A static toolbar docks to any edge (`toolbar`), a selection toolbar floats over a selection, and the right-click menu is core `openMenu()` (a bottom sheet on a phone through `menu-presentation`). Every entry is a core action item, so a click runs `beforeActionCallback` → the item's `onClick` → the command → the `action` event. Tooltips are core `createTooltip`, shortcuts display through core `formatShortcut`, and prompts are core `/dialog` modals instead of `window.prompt`.
- **Plugins and pipelines — commands ARE pipelines** — `definePlugin()` contributes schema, commands, keymaps, Markdown I/O and toolbar / menu / status items; the first-party set is `defaultPlugins()` (links, images, tables, code highlighting) plus the cloud-image `imageBrowserPlugin` / `imageBase64Plugin`. A toolbar button, a key binding and `controller.runCommand()` all fire the same named pipeline, and a plugin can splice stages into any pipeline by anchor. Deferred pipelines get abort / supersede, a pending loader (`renderLoadingCallback`) and an optional lock (`lock-change`).
- **Forms, localization, icons — the suite conventions** — `name` submits the live content through a light-DOM hidden input, and `getValueFormatCallback` formats (e.g. sanitizes) only the submitted value, marking the field invalid when it throws. Every UI string is a flat `labels` key (`tooltips.bold`, `headers.linkUrl`, …) over English, with the page-wide `window.components.locale` dictionary, `translateCallback` and a `locale` for the status-bar counts. Built-in icons are inline SVGs (`EDITOR_ICONS`); item icons go through core `renderIcon` and `renderIconCallback`.
- **Theming and accessibility — the shared contracts** — Every colour is a `--we-*` variable chained to the `--base-*` contract with `light-dark()` fallbacks, dark mode follows the page (or `data-theme` on the element), and `custom-styles` injects CSS into the shadow root; `component-variables.manifest.json` lists every variable. The surface is a named WAI-ARIA textbox, the toolbars are one tab stop with arrow keys, Alt+F10 jumps into the toolbar and Shift+F10 opens the context menu at the caret, and view-mode switches are announced. `readonly` stays focusable and copyable; `disabled` (or a `<fieldset disabled>`) makes the surface inert.
- **Headless `EditorEngine` — build your own UI** — The engine behind `<km-editor>` is exported: ProseMirror view and state, schema, commands, pipelines, serialization and a typed event bus, without any chrome. It takes the element's settings with the element's defaults: `new EditorEngine(mount, options)`, then `setOptions()` applies `isReadonly`, `labels`, `locale`, `translateCallback` and `interactionHost` in place (document, selection and undo history kept) and `getOptions()` reads them back. [docs/usage.md → Build your own UI](./docs/usage.md#build-your-own-ui) has a minimal own-toolbar example.

Earlier releases: [CHANGELOG](CHANGELOG.md).

## Demos & docs

- 🧪 [Live examples](https://examples.web-editor.keenmate.dev) — the hosted example
  site (basic usage, rich content, plugins, the pipeline lab, and the playground).
- 📘 [Pipelines guide](./docs/pipelines/README.md) — how pipelines work, with diagrams.
- 🛠 [Usage](./docs/usage.md) — the full API: attributes, events, methods, labels, forms, extending,
  the headless `EditorEngine`.
- 🎨 [Theming](./docs/theming.md) · ♿ [Accessibility](./docs/accessibility.md) ·
  🧩 [Examples](./docs/examples.md) — every example page and section.
- 📝 [Changelog](./CHANGELOG.md) — every change, per version.
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

Modern evergreen browsers: Chrome/Edge 123+, Firefox 128+, Safari 18+ — the floor of the stylesheet's
`light-dark()` and relative-colour (`oklch(from …)`) fallbacks. No polyfills are shipped.

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
