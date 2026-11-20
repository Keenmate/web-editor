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

Every attribute is also a property (e.g. `el.viewMode = 'preview'` ↔ `view-mode`), typed on
`KmEditorElement` (TypeScript: `el.viewMode`, `el.customStyles`, … — the `EditorConfig` keys).
An invalid value warns, keeps the previous one and fires `input-rejected`; `el.x = undefined` (or
removing the attribute) resets an input to its default.

| Attribute   | Values                                          | Default      | Description |
| ----------- | ----------------------------------------------- | ------------ | ----------- |
| `value`     | string                                          | —            | Initial content, interpreted per `contentFormat` (property `defaultValue`, like a native input). Changing it replaces the document. The live content is the `value` **property**. |
| `content-format` | `markdown` \| `html` \| `json`                  | `markdown`   | The format of the one document — the lens for content I/O (the `value` attribute and property, the `change` detail). Switching re-reports the same document in the new format — it never rebuilds it, and fires no `change`. |
| `name`      | string                                          | —            | Form field name: a light-DOM hidden `<input name="…">` carries the live content (in `content-format`) and submits with the `<form>` — see [Forms](#forms). |
| `view-mode` | `edit` \| `split` \| `preview` \| `inline`      | `edit`       | Presentation. `preview` forces read-only. `inline` renders a floating card (see `anchor`). Assigning is silent; `setViewMode()` and the toolbar's Edit / Split / Preview items fire `view-mode-change`. |
| `readonly`  | boolean                                         | `false`      | Read-only (`isReadonly`): the content can't change, the editing toolbar groups are hidden (the view-mode group stays), but it stays focusable (in the tab order) / selectable / copyable (Ctrl/⌘+A selects the document). `view-mode="preview"` also forces this on. Reflects. |
| `disabled`  | boolean                                         | `false`      | Disabled (`isDisabled`): no interaction — not editable, focusable or selectable (the surface is `inert`). An ancestor `<fieldset disabled>` disables it too. Reflects, like a native control. |
| `toolbar`   | `top` \| `bottom` \| `start` \| `end` \| `none` | `top`        | Which edge the command toolbar docks to (`none` hides it). Its last group, at the far end, is the view-mode radio group — `view-edit` / `view-split` / `view-preview` (`Edit` / `Split` / `Preview`; toggled = the active mode; not shown in `inline`). While read-only / `preview` only that group shows; disabled hides the toolbar. The selection toolbar and context menu are always available while editing. |
| `statusbar` | `none` \| `top` \| `bottom` \| `both`           | `none`       | A dedicated strip of live indicators (word/char count, plugin items). `both` splits items across two strips. |
| `anchor`    | CSS selector                                    | —            | For `view-mode="inline"` only: the page element the floating card tracks. |
| `labels`    | JSON object                                     | English      | UI strings — see [Labels](#labels). Also a property (object). |
| `menu-presentation` | `auto` \| `floating` \| `sheet` \| `drawer` | `auto`       | How the right-click menu opens (core `/menu`): `auto` = a bottom sheet on a phone, floating otherwise; `drawer` slides in from `menu-side`. Read at every open; responsive rules can set it (`menuPresentation`). |
| `menu-side` | `start` \| `end`                               | `end`        | The edge a `drawer` menu slides in from. |
| `custom-styles` | CSS string                                  | —            | CSS injected into the shadow root (`customStyles`), after the page-wide layer — see [Theming](#theming). Raw CSS: never untrusted input. |

Property-only inputs:

| Property               | Type | Description |
| ---------------------- | ---- | ----------- |
| `getValueFormatCallback` | `(ctx) => string` | Formats the value written into the hidden form input (e.g. sanitizing); `ctx` = `{ value, contentFormat }` + `controller` / `element`. Affects only the submitted value — see [Forms](#forms). |
| `beforeActionCallback` | `(detail) => false \| void \| Promise<…>` | Runs first on every toolbar / selection-toolbar / context-menu activation; `false` cancels (no `onClick`, no `action` event, no command). |
| `renderLoadingCallback` | `(ctx) => void \| cleanup` | Draws the pending loader (shown while a deferred pipeline's work — e.g. a cloud-image upload — outlives its threshold; not while a dialog waits for the user) instead of the default spinner; `ctx` = `{ component, context: 'pipeline', containerElement, element, label }`. Beats the page-wide `window.components.renderLoadingCallback`. See [Theming](#theming). |
| `interactionHost`      | `{ request(ctx) }` | The modal bridge interactive pipeline stages call (`ctx` = request + `signal` + `controller` / `element`). Default: a core `/dialog` confirmation (OK / Cancel, closed when the run is superseded). Survives engine rebuilds. |
| `getCustomStylesCallback` | `(ctx) => string \| null` | Computes the instance CSS (wins over `customStyles`); `ctx` = `controller` / `element`. See [Theming](#theming). |

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

The element's own engine is not exposed on it (`el.controller` is its API); to draw your
own editor UI, use the exported `EditorEngine` — see [Build your own UI](#build-your-own-ui).

## Labels

Every UI string goes through one `labels` object — partial (unset keys stay English),
`{name}` placeholders, applied live (no rebuild). `''` means deliberately empty (renders
nothing); a missing key falls back to English. Every editor label is inserted as **text**
(none is HTML), so there are no HTML-injection labels. Keys are flat `<elementType>.<name>`
(rulebook D-NC-24) — the element type says where the text is shown (`buttons`, `tooltips`,
`ariaLabels`, `placeholders`, `headers`, `labels`, `messages`, `errors`, `menuItems`):

```html
<km-editor labels='{"ariaLabels.bold":"Tučně","ariaLabels.insertLink":"Vložit odkaz","headers.linkUrl":"Adresa odkazu:","labels.words":"Slova: {count}"}'></km-editor>
```

Page-wide, for every editor on the page (core `/locale`): per key the element's `labels` win
(short `tooltips.bold` or full `km-editor.tooltips.bold` keys), then the ONE flat page dictionary
`window.components.locale.labels['km-editor.<key>']`, then English. A page-wide `translateCallback`
(ICU, i18next — gets the full key, the template and the params) translates every key the element
didn't set; assigning `window.components.locale` re-renders live editors:

```js
window.components.locale = { labels: { 'km-editor.ariaLabels.bold': 'Tučně', 'km-editor.labels.words': 'Slova: {count}' } };
```

One editor needs no page setup: its own **`translateCallback`** (property only, same
`({ component, key, template, params, locale }) => string | null` shape) is asked first for every key its
`labels` didn't set, then the page-wide one; `null` / `undefined` = not mine → the next. A standalone
`EditorEngine` (no element) takes the same function as its `translateCallback` option (and the same `labels`
object as its `labels` option), in the same order:

```js
editor.translateCallback = ({ key, params }) => (i18next.exists(key) ? i18next.t(key, params) : null);
```

| Key | English default |
| --- | --------------- |
| `<name>` = the command id camel-cased (`bold`, `insertLink`, `insertTable`, `bulletList`, `undo`, `viewEdit`, a plugin's `imageBrowserPick`, …): `ariaLabels.<name>` (an icon toolbar button's accessible name), `buttons.<name>` (a toolbar button showing its text — `viewEdit` / `viewSplit` / `viewPreview`; named by that text, no `aria-label`), `menuItems.<name>` (the context-menu entry). Twins share `<name>`: an `ariaLabels.<name>` you didn't set follows a customized `tooltips.<name>` | the command's own text (`Bold`, `Insert link`, …) |
| `tooltips.<name>` | the command's tooltip, else `<text> (<shortcut>)` (the text as translated) |
| `ariaLabels.<groupId>Group` — `ariaLabels.formatGroup`, `blockGroup`, `listGroup`, `insertGroup`, `historyGroup`, `viewGroup`, `linkGroup`, `imageGroup`, `tableGroup`, `imageBrowserGroup` | toolbar group accessible names (`Format`, `Block`, `Lists`, …) |
| `placeholders.document` | `''` (off) — shown (as text) while the document is empty |
| `labels.words` / `labels.chars` | `Words: {count}` / `Chars: {count}` (status bar) |
| `buttons.ok` / `buttons.cancel` | `OK` / `Cancel` (prompt and confirmation dialog buttons; the ✕ takes `ariaLabels.close`) |
| `headers.linkUrl` | `Enter link URL` (prompt title) |
| `headers.imageUrl` / `headers.imageAlt` | `Enter image URL` / `Enter alt text (optional)` |
| `headers.codeLanguage` / `headers.codeLanguageChange` | `Enter language ({languages})` / `Change language ({languages})` |
| `ariaLabels.cloudImage` / `tooltips.cloudImage` / `menuItems.cloudImage` | `Cloud image` / `Insert image from the cloud` / `Insert cloud image…` — the cloud-image plugin's toolbar button, its tooltip, its menu entry |
| `headers.cloudImagePicker` / `messages.cloudImagePicker` | `Choose a cloud image` / `Pick an image to insert.` — the default picker confirmation |
| `buttons.markdownTab` / `buttons.htmlTab` / `buttons.jsonTab` | `Markdown` / `HTML` / `JSON` — the split view's output tabs |
| `buttons.back` / `ariaLabels.close` | `Back` / `Close` — the context menu's submenu back button and ✕ close button when it opens as a sheet / drawer (`menu-presentation`); `ariaLabels.close` is also the dialogs' ✕ |
| `ariaLabels.loading` | `aria-label` of the pending loader ("Loading…") |
| `errors.valueFormat` | validation message while `getValueFormatCallback` throws ("The value could not be formatted.") |

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
  <km-editor name="body" content-format="html" labels='{"placeholders.document":"Write your post…"}'></km-editor>
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

## Responsive rules

Tune any input per device class or window width without app-side resize code — the shared
`@keenmate/web-components-core` mechanism
([SPEC §6.7](https://github.com/KeenMate/web-components-core/blob/main/docs/SPEC.md)).
A **map** has two axes, each keyed `mobile | tablet | desktop` → partial config:

- `device` — what the device *is*: a touch phone (`mobile`) / tablet by capability; a mouse /
  trackpad device is `desktop` at any width.
- `breakpoint` — the window width (768 / 1024 px lines), so a narrowed desktop window is `mobile`.

Both apply; on the same key `device` wins. Own widths or combinations (device AND width,
orientation, …) go in a **callback** (`(ctx) => partial config`,
`ctx` = `{ env, deviceClass, breakpoint, element, component, config }`). Either can be set at
three levels:

```js
window.components.responsive = { device: { mobile: { toolbar: 'bottom' } } };  // page — every component
window.components['km-editor'].responsiveCallback = ({ env }) =>               // page — every <km-editor>
  env.viewportWidth < 600 ? { toolbar: 'bottom' } : undefined;
editor.responsive = { breakpoint: { mobile: { toolbar: 'none' } } };            // this instance
// or <km-editor responsive='{"breakpoint":{"mobile":{"toolbar":"none"}}}'>
```

Precedence (later wins, key by key): page map → page callback → per-tag map → per-tag
callback → **attributes / properties set on the instance** → instance map → instance
callback. So `<km-editor toolbar="top">` keeps its toolbar on top whatever the page rules
say; only the instance's own rules beat it. Overrides never reflect to attributes, `el.config`
/ the property getters return the effective value, and a key a rule stops returning goes
back to its base value. Rules re-run when the device class / breakpoint / orientation
changes (callbacks also on every viewport-width change). Types: `EditorResponsiveMap`, `EditorResponsiveCallback` (over `EditorConfig`).

## Theming

The component is shadow-DOM scoped, so its styles don't leak and page styles don't
bleed in. Ship the stylesheet once:

```html
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />
```

**Dark mode follows the page.** Every color is a `--we-*` variable chained to the shared
`--base-*` contract with `light-dark()` fallbacks, so the editor resolves whichever scheme its
host is in:

- **No signal** — the editor inherits the page's `color-scheme` (`html { color-scheme: light dark }`
  follows the OS).
- **Page signal** — `data-theme` / `data-bs-theme` / `.dark` / `.light` on `<html>` or `<body>`, a
  `theme-source` section, or core `setThemeMode()`: core mirrors it onto the host as
  `data-context-theme`.
- **Per instance** — `<km-editor data-theme="dark">` (or `"light"`) wins over the page.

The selection toolbar and the toolbar / status tooltips (core `createTooltip`: hover and keyboard focus,
`--we-tooltip-bg` / `--we-tooltip-color`) are dark in both modes (the shared tooltip tokens), and code blocks
stay dark in both (the syntax highlighting is Prism's dark theme). Re-theme with `--base-*` on
`:root` (every Keenmate component follows), or `--we-*` on the element:

```css
km-editor { --we-accent: #7c3aed; --we-min-height: 320px; }
```

All variables are listed in `component-variables.manifest.json`
(`import manifest from '@keenmate/web-editor/manifest'`).

**Custom CSS (shadow root).** Page CSS can't reach inside the shadow root; inject it instead
(core `createCustomStyles()`). Two layers, each a `<style>` in the shadow root, the instance one
last so it wins:

```js
// every <km-editor> on the page (one file, fetched once)
window.components['km-editor'].customStyles = "@import url('/css/editor-overrides.css');";
// or computed per instance (wins over the page-wide customStyles)
window.components['km-editor'].getCustomStylesCallback = ({ element }) =>
  element.classList.contains('notes') ? '.ProseMirror { font-family: Georgia, serif; }' : null;
```

```html
<!-- this editor only: attribute custom-styles / property customStyles, or getCustomStylesCallback(ctx) -->
<km-editor custom-styles=".ProseMirror { letter-spacing: .02em; }"></km-editor>
```

An `@import`ed font (`@font-face`) is also linked once in the document `<head>`, since Chromium
ignores `@font-face` inside a shadow root (`window.components.shouldHoistImports = false` turns
that off). Custom CSS is raw — never put untrusted input there.

The editor's own classes and custom properties use the `we-` prefix (`--we-bg`,
`--we-border`, `--we-accent`, …). Disabled commands fade by `--we-disabled-opacity`
(default `var(--base-disabled-opacity, 0.65)`). While a deferred pipeline outlives its threshold a
loader shows in the body's top-end corner (`::part(loader)`, `role="status"`, label `loading`): the
shared Keenmate loader, drawn from `--we-loader-icon` / `--we-loader-rotate` / `--we-loader-duration`
/ `--we-loader-size` (each chained to `--base-loader-*`, so one page-level change restyles every
component's loader; it slows under reduced motion). For a richer loader set `renderLoadingCallback`
on the element or `window.components.renderLoadingCallback` for the page. Apart from that spinner
the editor has no transitions or animations of its own; the right-click menu's motion follows core's `--km-menu-*` / `--base-duration-*`
(`--base-duration-*: 0s` turns it off page-wide). The right-click menu is the shared Keenmate menu
from `@keenmate/web-components-core` (`.km-menu*`, `::part(context-menu)`); restyle it
with the `--we-context-menu-*` properties on the element — `bg`, `text-color`,
`border`, `border-radius`, `shadow`, `min-width`, `padding`, `font-size`,
`item-padding`, `hover-bg`, `hover-color`, `toggled-color`, `shortcut-color`,
`danger-color`, `divider-color`, `disabled-opacity`, `z-index`.

Each menu value resolves, highest precedence first: **`--we-context-menu-*`** (this
editor) → **`--km-menu-*`** (every Keenmate menu on the page) → **`--base-*`** (theme)
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
`{ divider: true }` (or `createMenuDivider()`):

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

**Icons** (`icon` on an item or a command) follow core `renderIcon`, like every Keenmate component, in order:
markup (starts with `<` — an `<svg>`, an `<img>`) is inserted as-is; a built-in name (`'check'`, `'close'`,
`'settings'`, `'delete'`, … — core `BUILT_IN_ICON_NAMES`) is a glyph masked from the `--base-icon-<name>` token in
`currentColor` (reserved: no hook sees it); then the element's own **`renderIconCallback(name, ctx)`** (property
only), then the page-wide `window.components.renderIconCallback` — each returns markup, `''` = no icon,
`null` / `undefined` = not mine (`ctx` = `{ component: 'km-editor', element, prefix: 'we', item }`); an ASCII
class list (`'fa-solid fa-floppy-disk'`, `'bi-gear'`) is an icon font `<i class="we__icon fa-solid fa-floppy-disk"
aria-hidden="true">`; anything else (an emoji, `'¶'`) is text.

```js
editor.renderIconCallback = (name) => (name === 'save' ? mySaveSvg : null); // null → the page-wide hook
```

 The built-in buttons use inline SVGs — `EDITOR_ICONS` (exported) has them for
your own items. The button's accessible name is always the item `text` (an icon button's `aria-label`; a button without an icon shows the text itself).

Writing plugins (schema nodes/marks, commands, keybindings, toolbar/menu items,
the Markdown-serializer contract) and the content-pipeline layer are covered in
[`docs/`](./docs/) — see the **[Pipelines guide](./docs/pipelines/README.md)** (with
diagrams) — plus [`PLAN.md`](./PLAN.md) and the [`PIPELINES.md`](./PIPELINES.md)
design note.

## Build your own UI

`EditorEngine` is the headless editor behind `<km-editor>` — exported so you can drive the
same document from **your own** toolbar, menus and status line (any framework). It is a seam
for your own UI; if you just want the editor without writing UI, use `<km-editor>`.

**What the engine does:** owns the ProseMirror document + view in the element you give it
(`mount`), assembles schema, commands, keybindings, Markdown I/O and pipelines from the plugin
set (`editorPlugins`, default `defaultPlugins()`), runs commands through their pipelines
(`engine.commands.run(id)` / `engine.run(name)`), answers command state
(`commands.isEnabled(id)` / `isToggled(id)` / `shortcut(id)`, `get(id)` → `text` / `icon` /
`tooltip`), serializes (`getMarkdown()` / `getHTML()` / `getJSON()`, `setContent(value, format)`),
resolves UI strings (`engine.label(key, params?, fallback?)`), and emits `change`,
`selection-change`, `lock` and `pending` on `engine.events`. The assembled item lists
(`toolbarGroups`, `selectionItems`, `menuItems`, `statusItems`) are data for your UI.

**What you draw:** every control — buttons, menus, the status line, a loader while
`pending` is true — and the CSS of your container (the element's stylesheet targets its
shadow root; a ProseMirror surface needs at least `white-space: pre-wrap`). The built-in
prompts (`insert-link`, `insert-image`, code language) open core `/dialog` prompts for you;
interactive pipeline stages (the cloud-image picker) ask the `interactionHost` option.

**Options = the element's settings**, same names and same defaults (rulebook C-CA-37):
`isReadonly` (`false`), `labels` (`null` = English, live: `engine.labels = …`),
`translateCallback` (`null`, live; asked before the page-wide
`window.components.locale.translateCallback`), `interactionHost` (`null` = the core dialog).
Content: one of `markdown` / `html` / `json` / `doc`. The element's chrome settings
(`toolbar`, `statusbar`, `viewMode`, `anchor`, `menu-presentation`, `renderIconCallback`,
`renderLoadingCallback`, `beforeActionCallback`, `customStyles`, `name`, …) have no engine
option — they configure UI the engine does not draw.

```js
import { EditorEngine, labelKey } from '@keenmate/web-editor';

const engine = new EditorEngine({
  mount: document.querySelector('#surface'),
  markdown: '# Hello',
  labels: { 'ariaLabels.bold': 'Tučně' },
});

const bar = document.querySelector('#bar');
const ids = ['bold', 'italic', 'bullet-list', 'undo', 'redo'];
for (const id of ids) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = id;
  button.textContent = engine.label(`ariaLabels.${labelKey(id)}`, undefined, engine.commands.get(id)?.text ?? id);
  button.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor selection
  button.addEventListener('click', () => engine.commands.run(id));
  bar.append(button);
}
const refresh = () => {
  for (const button of bar.children) {
    button.disabled = !engine.commands.isEnabled(button.dataset.id);
    button.setAttribute('aria-pressed', String(engine.commands.isToggled(button.dataset.id)));
  }
};
engine.events.on('selection-change', refresh);
engine.events.on('change', () => save(engine.getMarkdown()));
refresh();
// later: engine.setEditable(false); engine.destroy();
```

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
