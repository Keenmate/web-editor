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

## Options

Every attribute is also a property (e.g. `el.viewMode = 'preview'` ↔ `view-mode`).

| Attribute   | Values                                          | Default      | Description |
| ----------- | ----------------------------------------------- | ------------ | ----------- |
| `value`     | string                                          | —            | Initial content, interpreted per `contentFormat` (property `defaultValue`, like a native input). Changing it replaces the document. The live content is the `value` **property**. |
| `content-format` | `markdown` \| `html` \| `json`                  | `markdown`   | The format of the one document — the lens for content I/O (the `value` attribute and property, the `change` detail). Switching re-reports the same document in the new format — it never rebuilds it, and fires no `change`. |
| `name`      | string                                          | —            | Form field name: a light-DOM hidden `<input name="…">` carries the live content (in `content-format`) and submits with the `<form>` — see [Forms](#forms). |
| `view-mode` | `edit` \| `split` \| `preview` \| `inline`      | `edit`       | Presentation. `preview` forces read-only. `inline` renders a floating card (see `anchor`). Assigning is silent; `setViewMode()` and the toolbar's Edit / Split / Preview items fire `view-mode-change`. |
| `readonly`  | boolean                                         | `false`      | Read-only (`isReadonly`): the content can't change, the editing toolbar groups are hidden (the view-mode group stays), but it stays focusable / selectable / copyable. `view-mode="preview"` also forces this on. Reflects. |
| `disabled`  | boolean                                         | `false`      | Disabled (`isDisabled`): no interaction — not editable, focusable or selectable (the surface is `inert`). An ancestor `<fieldset disabled>` disables it too. Reflects, like a native control. |
| `toolbar`   | `top` \| `bottom` \| `start` \| `end` \| `none` | `top`        | Which edge the command toolbar docks to (`none` hides it). Its last group, at the far end, is the view-mode radio group — `view-edit` / `view-split` / `view-preview` (`Edit` / `Split` / `Preview`; toggled = the active mode; not shown in `inline`). While read-only / `preview` only that group shows; disabled hides the toolbar. The selection toolbar and context menu are always available while editing. |
| `statusbar` | `none` \| `top` \| `bottom` \| `both`           | `none`       | A dedicated strip of live indicators (word/char count, plugin items). `both` splits items across two strips. |
| `theme`     | string                                          | —            | Theme name, reflected to the host for CSS theming (`:host([theme="…"])`). |
| `anchor`    | CSS selector                                    | —            | For `view-mode="inline"` only: the page element the floating card tracks. |
| `labels`    | JSON object                                     | English      | UI strings — see [Labels](#labels). Also a property (object). |

Property-only inputs:

| Property               | Type | Description |
| ---------------------- | ---- | ----------- |
| `getValueFormatCallback` | `(ctx) => string` | Formats the value written into the hidden form input (e.g. sanitizing); `ctx` = `{ value, contentFormat }` + `controller` / `element`. Affects only the submitted value — see [Forms](#forms). |
| `beforeActionCallback` | `(detail) => false \| void \| Promise<…>` | Runs first on every toolbar / selection-toolbar / context-menu activation; `false` cancels (no `onClick`, no `action` event, no command). |
| `renderLoadingCallback` | `(ctx) => void \| cleanup` | Draws the pending loader (shown while a deferred pipeline's work — e.g. a cloud-image upload — outlives its threshold; not while a dialog waits for the user) instead of the default spinner; `ctx` = `{ component, context: 'pipeline', containerElement, element, label }`. Beats the page-wide `window.components.renderLoaderCallback`. See [Theming](#theming). |
| `interactionHost`      | `{ request(ctx) }` | The modal bridge interactive pipeline stages call (`ctx` = request + `signal` + `controller` / `element`). Default: `window.confirm`. Survives engine rebuilds. |

**Events** — bubble, not composed. Each has a camelCase twin property (`onChange`,
`onReady`, `onViewModeChange`, `onLockChange`, `onValueFormatError`, `onAction`) called with the **same detail**
before the DOM event. Every detail carries `controller` and `element` (non-enumerable —
`JSON.stringify(detail)` shows only the data).

| Event         | `detail`              | Fires when |
| ------------- | --------------------- | ---------- |
| `change`      | `{ value, contentFormat }`   | Content changes by the user, a plugin or `setValue()` (unless `{ isSilent: true }`), serialized in the active `contentFormat`. Assigning `value` / `contentFormat` is silent, like a native `input.value`; so is a form reset (like a native `form.reset()`). |
| `ready`       | the context only      | The engine has mounted and is ready (once). |
| `view-mode-change` | `{ viewMode, oldViewMode, source }` | The view mode was switched — `source`: `'user'` (the Edit / Split / Preview toolbar items), `'api'` (`setViewMode()` on the element or `controller`, incl. `controller.runCommand('view-…')`), `'plugin'` (a plugin's `setup` ctx / a pipeline stage's `rt.setViewMode`). Assigning `viewMode` / `view-mode` is silent. |
| `lock-change` | `{ isLocked }`        | A gating pipeline (e.g. the cloud-image picker) locks / unlocks the editor. |
| `value-format-error` | `{ error, value }` | `getValueFormatCallback` threw (`value` = the unformatted document). The field is invalid until the next successful format — see [Forms](#forms). |
| `action`      | `{ action, id, item, source, sourceEvent, triggerElement, dataset, state }` | A toolbar / selection-toolbar / context-menu item was activated (`source`: `toolbar` \| `selection-toolbar` \| `context-menu`). After the item's `onClick` and the command (a notification after the fact; `state` is the snapshot from activation). Keyboard shortcuts don't fire it. |

**Methods & properties:**

| Member                    | Returns              | Description |
| ------------------------- | -------------------- | ----------- |
| `value`                   | `string`             | The live content, serialized in the active `contentFormat`. Assigning replaces the document silently — no `change`, like a native `input.value`; the hidden form input is synced (the `value` attribute is not written). |
| `getMarkdown()` / `getHTML()` | `string`         | Live content in that format. |
| `getJSON()`               | `unknown`            | Live content as the ProseMirror JSON document. |
| `setValue(value, format?, options?)`| `void` | Replace the document from `value`, parsed in `format` (default: the active `contentFormat`). Fires `change` unless `options.isSilent` (`{ isSilent: true }`); also on `el.controller`. |
| `setViewMode(mode, options?)` | `void`           | Switch the view mode; fires `view-mode-change` (`source: 'api'`) unless `options.isSilent`. No-op when already active; an invalid mode warns and is ignored. Also on `el.controller`. |
| `focus()`                 | `void`               | Focus the editing surface. |
| `isReady` / `whenReady()` | `boolean` / `Promise<void>` | Core: the first build is live (`ready` attribute, `:state(ready)`, `ready` event). |
| `shouldDefer` / `release()` | `boolean` / `void` | Core: hold the first build (attribute `defer`) until `release()` / removing `defer`. |
| `plugins`                 | `EditorPlugin[]`     | The active plugin set — assign to compose with `defaultPlugins()` (rebuilds, preserving content). |
| `controller`              | `EditorController`   | The public facade (also `detail.controller` / `ctx.controller`): `value` (read-only), `getHTML` / `getMarkdown` / `getJSON`, `setValue`, `setViewMode`, `focus`, `runCommand(name \| ProseMirror command)`, `isCommandToggled(name)`, `isCommandEnabled(name)`. Programmatic — no `action` event. |
| `destroy()`               | `void`               | Core: final teardown of the engine and shadow layout (idempotent; `isDestroyed`). The element stays inert — create a new one instead of re-inserting it. |

The internal engine is not exposed on the element; `EditorEngine` is exported for
standalone (headless) use.

## Labels

Every UI string goes through one `labels` object — partial (unset keys stay English),
`{name}` placeholders, applied live (no rebuild). `''` means deliberately empty (renders
nothing); a missing key falls back to English. Every editor label is inserted as **text**
(none is HTML), so there are no HTML-injection labels:

```html
<km-editor labels='{"bold":"Tučně","insertLink":"Vložit odkaz","linkUrlPrompt":"Adresa odkazu:","words":"Slova: {count}"}'></km-editor>
```

| Key | English default |
| --- | --------------- |
| `<commandKey>` — the command id camel-cased (`bold`, `insertLink`, `insertTable`, `bulletList`, `undo`, a plugin's `imageBrowserPick`, …) | the command's own text (`Bold`, `Insert link`, …) — item text, menu label, button `aria-label` |
| `<commandKey>Tooltip` | the command's tooltip, else `<text> (<shortcut>)` |
| `<groupId>Group` — `formatGroup`, `blockGroup`, `listGroup`, `insertGroup`, `historyGroup`, `viewGroup`, `linkGroup`, `imageGroup`, `tableGroup`, `imageBrowserGroup` | toolbar group accessible names (`Format`, `Block`, `Lists`, …) |
| `placeholder` | `''` (off) — shown (as text) while the document is empty |
| `words` / `chars` | `Words: {count}` / `Chars: {count}` (status bar) |
| `linkUrlPrompt` | `Enter link URL:` |
| `imageUrlPrompt` / `imageAltPrompt` | `Enter image URL:` / `Enter alt text (optional):` |
| `codeLanguagePrompt` / `codeLanguageChangePrompt` | `Enter language ({languages}):` / `Change language ({languages}):` |
| `cloudImage`, `cloudImageTooltip`, `insertCloudImage`, `cloudImagePickerTitle`, `cloudImagePickerMessage` | cloud-image plugin texts |
| `loading` | `aria-label` of the pending loader ("Loading…") |
| `valueFormatError` | validation message while `getValueFormatCallback` throws ("The value could not be formatted.") |

Plugin code resolves strings with `label(key, params?, fallback?)` — on the plugin
builder ctx (`commands: ({ schema, label }) => …`), on every callback ctx (`ctx.label`)
and on pipeline stages (`rt.label`). `DEFAULT_LABELS` and `labelKey()` are exported.

## Forms

`<km-editor name="body">` inside a `<form>` submits the live content under `body`,
serialized in `content-format` (`markdown` by default). Like the suite's other form
components it uses a **light-DOM hidden input** (a child of the host) — not
`ElementInternals.setFormValue` — so there is exactly one entry. The editor starts
**empty** unless `value` is given; `form.reset()` restores the `value` attribute
(`defaultValue`) silently — no `change`, like a native control — and a disabled editor (`disabled`, or an ancestor
`<fieldset disabled>`) is left out of the submission.

```html
<form>
  <km-editor name="body" content-format="html" labels='{"placeholder":"Write your post…"}'></km-editor>
</form>
```

To change what is **submitted** (e.g. sanitize the HTML), set `getValueFormatCallback`.
It formats only the hidden input's value: `el.value` and the `change` detail stay the
document in `contentFormat`. If the callback throws, the error is logged, the hidden
input gets an empty value, the host turns **invalid** (`customError`, message = label
`valueFormatError`) and `value-format-error` `{ error, value }` fires — so the form refuses
to submit (`invalid` fires on the editor; `<form novalidate>` submits the empty value).
The next successful format clears it. The standard `el.validity` / `validationMessage` /
`checkValidity()` / `reportValidity()` and `:invalid` work (core).

```js
editor.getValueFormatCallback = ({ value, contentFormat }) =>
  contentFormat === 'html' ? DOMPurify.sanitize(value) : value;
```

## Theming

The component is shadow-DOM scoped, so its styles don't leak and page styles don't
bleed in. Ship the stylesheet once:

```html
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />
```

Set `theme="…"` to target a theme from your own CSS via `:host([theme="…"])`.

The editor's own classes and custom properties use the `we-` prefix (`--we-bg`,
`--we-border`, `--we-accent`, …). Disabled commands fade by `--we-disabled-opacity`
(default `var(--base-disabled-opacity, 0.65)`). While a deferred pipeline outlives its threshold a
loader shows in the body's top-end corner (`::part(loader)`, `role="status"`, label `loading`): the
shared KeenMate loader, drawn from `--we-loader-icon` / `--we-loader-rotate` / `--we-loader-duration`
/ `--we-loader-size` (each chained to `--base-loader-*`, so one page-level change restyles every
component's loader; it slows under reduced motion). For a richer loader set `renderLoadingCallback`
on the element or `window.components.renderLoaderCallback` for the page. Apart from that spinner
the editor has no transitions or animations of its own; the right-click menu's motion follows core's `--km-menu-*` / `--base-duration-*`
(`--base-duration-*: 0s` turns it off page-wide). The right-click menu is the shared KeenMate menu
from `@keenmate/web-components-core` (`.km-menu*`, `::part(context-menu)`); restyle it
with the `--we-context-menu-*` properties on the element — `bg`, `text-color`,
`border`, `border-radius`, `shadow`, `min-width`, `padding`, `font-size`,
`item-padding`, `hover-bg`, `hover-color`, `toggled-color`, `shortcut-color`,
`danger-color`, `divider-color`, `disabled-opacity`, `z-index`.

Each menu value resolves, highest precedence first: **`--we-context-menu-*`** (this
editor) → **`--km-menu-*`** (every KeenMate menu on the page) → **`--base-*`** (theme)
→ core's default. The `--we-context-menu-*` properties are unset by default, so a
page-wide `--km-menu-*` reaches the editor's menu:

```css
:root { --km-menu-bg: #fffbe6; }                /* every menu on the page */
km-editor.notes { --we-context-menu-bg: #eef; } /* just this editor's menu */
```

The list of `--km-menu-*` variables ships in core's
`@keenmate/web-components-core/component-variables.manifest.json`.

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
