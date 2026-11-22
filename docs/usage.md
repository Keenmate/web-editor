# Usage — `<km-editor>`

The full public API of the element — attributes, properties, events, methods — and of the
headless `EditorEngine`. Install and the quick start are in the [README](../README.md);
theming in [theming.md](./theming.md); keyboard / ARIA / focus in
[accessibility.md](./accessibility.md); runnable pages in [examples.md](./examples.md).

- [Attributes and properties](#attributes-and-properties) · [Property-only inputs](#property-only-inputs)
- [Events](#events) · [Methods and properties](#methods-and-properties)
- [Slots and lifecycle](#slots-and-lifecycle)
- [Labels](#labels) · [Forms](#forms) · [Responsive rules](#responsive-rules)
- [Extending](#extending) — plugins, toolbar / menu items, icons
- [Build your own UI](#build-your-own-ui) — the headless `EditorEngine`

## Attributes and properties

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
| `required`  | boolean                                         | `false`      | Required (`isRequired`): while the document has no content, the form validity is `valueMissing` and the `<form>` refuses to submit — see [Required and validation](#required-and-validation). Never missing while read-only or disabled. Reflects, like a native control. |
| `toolbar`   | `top` \| `bottom` \| `start` \| `end` \| `none` | `top`        | Which edge the command toolbar docks to (`none` hides it). Its last group, at the far end, is the view-mode radio group — `view-edit` / `view-split` / `view-preview` (`Edit` / `Split` / `Preview`; toggled = the active mode; not shown in `inline`). While read-only / `preview` only that group shows; disabled hides the toolbar. The selection toolbar and context menu are always available while editing. |
| `statusbar` | `none` \| `top` \| `bottom` \| `both`           | `none`       | A dedicated strip of live indicators (word/char count, plugin items). `both` splits items across two strips. |
| `anchor`    | CSS selector                                    | —            | For `view-mode="inline"` only: the page element the floating card tracks. |
| `labels`    | JSON object                                     | English      | UI strings — see [Labels](#labels). Also a property (object). |
| `locale`    | BCP-47 tag                                      | —            | The locale of the numbers the editor formats — the status-bar word / char counts (`1234` → `1,234` / `1.234` for `de` / `1 234` for `cs`) — and the `locale` a `translateCallback` gets. Unset (or `auto`): the page-wide `window.components.locale.locale`, else the browser language. UI strings are `labels`. Live. |
| `menu-presentation` | `auto` \| `floating` \| `sheet` \| `drawer` | `auto`       | How the right-click menu opens (core `/menu`): `auto` = a bottom sheet on a phone, floating otherwise; `drawer` slides in from `menu-side`. Read at every open; responsive rules can set it (`menuPresentation`). |
| `menu-side` | `start` \| `end`                               | `end`        | The edge a `drawer` menu slides in from. |
| `custom-styles` | CSS string                                  | —            | CSS injected into the shadow root (`customStyles`), after the page-wide layer — see [Theming](./theming.md#custom-css-shadow-root). Raw CSS: never untrusted input. |

### Property-only inputs

| Property               | Type | Description |
| ---------------------- | ---- | ----------- |
| `getValueFormatCallback` | `(ctx) => string` | Formats the value written into the hidden form input (e.g. sanitizing); `ctx` = `{ value, contentFormat }` + `controller` / `element`. Affects only the submitted value — see [Forms](#forms). |
| `beforeActionCallback` | `(detail) => false \| void \| Promise<…>` | Runs first on every toolbar / selection-toolbar / context-menu activation; `false` cancels (no `onClick`, no `action` event, no command). |
| `renderLoadingCallback` | `(ctx) => void \| cleanup` | Draws the pending loader (shown while a deferred pipeline's work — e.g. a cloud-image upload — outlives its threshold; not while a dialog waits for the user) instead of the default spinner; `ctx` = `{ component, context: 'pipeline', containerElement, element, label }`. Beats the page-wide `window.components.renderLoadingCallback`. See [Theming](./theming.md). |
| `interactionHost`      | `{ request(ctx) }` | The modal bridge interactive pipeline stages call (`ctx` = request + `signal` + `controller` / `element`). Default: a core `/dialog` confirmation (OK / Cancel, closed when the run is superseded). Survives engine rebuilds. |
| `getCustomStylesCallback` | `(ctx) => string \| null` | Computes the instance CSS (wins over `customStyles`); `ctx` = `controller` / `element`. See [Theming](./theming.md). |

## Events

Bubble, not composed. Each has a camelCase twin property (`onChange`,
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

## Methods and properties

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

## Slots and lifecycle

**Slots:** none — the content is the `value` (or `setValue()`), never light-DOM children. The only
light-DOM child the editor adds is the hidden form `<input>` (with `name`, see [Forms](#forms)).

**Lifecycle** (core `BlissElement`): the engine is built on the first connect — or on `release()` when
the element starts with `defer` / `shouldDefer`. After that first build the `ready` attribute,
`:state(ready)` and the `ready` event follow on the next microtask (`isReady` / `whenReady()`).
Moving the element in the DOM re-activates it without a rebuild (the document and undo history stay);
`destroy()` is the final teardown. Assigning `plugins` rebuilds the engine, preserving the content.

## Labels

Every UI string goes through one `labels` object — partial (unset keys stay English),
`{ctx.*}` placeholders, applied live (no rebuild). `''` means deliberately empty (renders
nothing); a missing key falls back to English. Every editor label is inserted as **text**
(none is HTML), so there are no HTML-injection labels. Keys are flat `<elementType>.<name>`
(rulebook D-NC-24) — the element type says where the text is shown (`buttons`, `tooltips`,
`ariaLabels`, `placeholders`, `headers`, `labels`, `messages`, `errors`, `menuItems`):

```html
<km-editor labels='{"ariaLabels.bold":"Tučně","ariaLabels.insertLink":"Vložit odkaz","headers.linkUrl":"Adresa odkazu:","labels.words":"Slova: {ctx.count}"}'></km-editor>
```

Page-wide, for every editor on the page (core `/locale`): per key the element's `labels` win
(short `tooltips.bold` or full `km-editor.tooltips.bold` keys), then the ONE flat page dictionary
`window.components.locale.labels['km-editor.<key>']`, then English. A page-wide `translateCallback`
(ICU, i18next — gets the full key, the template and the params) translates every key the element
didn't set; assigning `window.components.locale` re-renders live editors:

```js
window.components.locale = { labels: { 'km-editor.ariaLabels.bold': 'Tučně', 'km-editor.labels.words': 'Slova: {ctx.count}' } };
```

One editor needs no page setup: its own **`translateCallback`** (property only, same
`({ component, key, template, params, locale }) => string | null` shape) is asked first for every key its
`labels` didn't set, then the page-wide one; `null` / `undefined` = not mine → the next. A standalone
`EditorEngine` (no element) takes the same function as its `translateCallback` option (and the same `labels`
object as its `labels` option), in the same order:

```js
editor.translateCallback = ({ key, params }) => {
  const options = { ...params, count: params.ctx?.count };
  return i18next.exists(key, options) ? i18next.t(key, options) : null;
};
```

A dynamic label passes its values as **`{ ctx }`** — the spot's context: the template reads dotted paths
(`{ctx.count}`, `{ctx.languages}`; a number is shown formatted for the `locale`), a `translateCallback` gets
the raw object as `params.ctx`. `ctx.count` is the number the text's noun agrees with, so an app's i18n can
pick a plural form (the editor never does; the English defaults put the number after a colon, `Words: 3`).
The contexts are exported types: `StatusCountLabelContext` (`{ count }`) for `labels.words` / `labels.chars`,
`CodeLanguageLabelContext` (`{ languages, language? }`) for the code-language prompts. A plugin resolves its own
dynamic text the same way: `ctx.label('labels.matches', { ctx: { count } }, 'Matches: {ctx.count}')` (the third argument = its English default).

| Key | English default |
| --- | --------------- |
| `<name>` = the command id camel-cased (`bold`, `insertLink`, `insertTable`, `bulletList`, `undo`, `viewEdit`, a plugin's `imageBrowserPick`, …): `ariaLabels.<name>` (an icon toolbar button's accessible name), `buttons.<name>` (a toolbar button showing its text — `viewEdit` / `viewSplit` / `viewPreview`; named by that text, no `aria-label`), `menuItems.<name>` (the context-menu entry). Twins share `<name>`: an `ariaLabels.<name>` you didn't set follows a customized `tooltips.<name>` | the command's own text (`Bold`, `Insert link`, …) |
| `tooltips.<name>` | the command's tooltip, else `<text> (<shortcut>)` (the text as translated) |
| `ariaLabels.<groupId>Group` — `ariaLabels.formatGroup`, `blockGroup`, `listGroup`, `insertGroup`, `historyGroup`, `viewGroup`, `linkGroup`, `imageGroup`, `tableGroup`, `imageBrowserGroup` | toolbar group accessible names (`Format`, `Block`, `Lists`, …) |
| `placeholders.document` | `''` (off) — shown (as text) while the document is empty |
| `labels.words` / `labels.chars` | `Words: {ctx.count}` / `Chars: {ctx.count}` (status bar; ctx `StatusCountLabelContext`, `count` = the words / characters) |
| `buttons.ok` / `buttons.cancel` | `OK` / `Cancel` (prompt and confirmation dialog buttons; the ✕ takes `ariaLabels.close`) |
| `headers.linkUrl` | `Enter link URL` (prompt title) |
| `headers.imageUrl` / `headers.imageAlt` | `Enter image URL` / `Enter alt text (optional)` |
| `headers.codeLanguage` / `headers.codeLanguageChange` | `Enter language ({ctx.languages})` / `Change language ({ctx.languages})` (ctx `CodeLanguageLabelContext`: `languages` = the list, `language` = the block's current one on a change) |
| `ariaLabels.cloudImage` / `tooltips.cloudImage` / `menuItems.cloudImage` | `Cloud image` / `Insert image from the cloud` / `Insert cloud image…` — the cloud-image plugin's toolbar button, its tooltip, its menu entry |
| `headers.cloudImagePicker` / `messages.cloudImagePicker` | `Choose a cloud image` / `Pick an image to insert.` — the default picker confirmation |
| `buttons.markdownTab` / `buttons.htmlTab` / `buttons.jsonTab` | `Markdown` / `HTML` / `JSON` — the split view's output tabs |
| `ariaLabels.viewModeEdit` / `viewModeSplit` / `viewModePreview` / `viewModeInline` | `Edit view` / `Split view` / `Preview` / `Inline view` — announced to screen readers (core `announce()`) when the view mode switches with a `view-mode-change` event; `''` silences one |
| `ariaLabels.outputTabs` | `Output format` — the split view's tab list (`role="tablist"`) |
| `buttons.back` / `ariaLabels.close` | `Back` / `Close` — the context menu's submenu back button and ✕ close button when it opens as a sheet / drawer (`menu-presentation`); `ariaLabels.close` is also the dialogs' ✕ |
| `ariaLabels.editor` | `Rich text editor` — the editing surface's accessible name when the element has none of its own (`aria-labelledby`, `aria-label`, a `<label for>`) |
| `ariaLabels.loading` | `aria-label` of the pending loader ("Loading…") |
| `errors.valueFormat` | validation message while `getValueFormatCallback` throws ("The value could not be formatted.") |
| `errors.required` | validation message (`valueMissing`) while a `required` editor has no content ("This field is required.") |

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

### Required and validation

`required` (`isRequired`) works like a native control's: while the editor has **no content** the host is
invalid with `validity.valueMissing` (message = label `errors.required`, "This field is required."), the
`<form>` refuses to submit and `invalid` fires on the editor. "No content" = no text after trimming whitespace
**and** no non-text node — an image, a table (even with empty cells), a horizontal rule or another node a plugin
adds counts as content; empty headings, list items, quotes, code blocks and line breaks don't. Typing, `value`,
`setValue()` and a form reset re-check it at once.

A **read-only** (`readonly`, not `view-mode="preview"`) or **disabled** (`disabled`, `<fieldset disabled>`)
editor is never missing, like a native control. The host gets `aria-required` and matches `:state(required)`
(the native `:required` doesn't match a custom element); the editing surface (`role="textbox"`) says
`aria-required="true"` too. `reportValidity()` points the browser's bubble at the editing surface.

```html
<form>
  <km-editor name="body" required labels='{"errors.required":"Write the message first."}'></km-editor>
  <button>Send</button>
</form>
```

```css
km-editor:state(required) { border-inline-start: 3px solid currentColor; }
```

`el.validity` / `validationMessage` / `checkValidity()` / `reportValidity()` and `:invalid` are core's; a
throwing `getValueFormatCallback` (above) is a separate flag (`customError`) — both can be set at once.

## Responsive rules

Tune any input per device class or window width without app-side resize code — the shared
`@keenmate/web-components-core` mechanism
([SPEC §6.7](https://github.com/KeenMate/web-components-core/blob/prod/docs/SPEC.md)).
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
aria-hidden="true">`; anything else (an emoji, `'¶'`) is text. Changing `window.components.renderIconCallback`
later repaints the icons. The icon font's CSS must reach the shadow root — load it through `customStyles` (or the
page-wide `window.components['km-editor'].customStyles`); a stylesheet in the page `<head>` alone doesn't style it.

```js
editor.renderIconCallback = (name) => (name === 'save' ? mySaveSvg : null); // null → the page-wide hook
```

 The built-in buttons use inline SVGs — `EDITOR_ICONS` (exported) has them for
your own items. The button's accessible name is always the item `text` (an icon button's `aria-label`; a button without an icon shows the text itself).

Writing plugins (schema nodes/marks, commands, keybindings, toolbar/menu items,
the Markdown-serializer contract) and the content-pipeline layer are covered in
[`docs/`](./README.md) — see the **[Pipelines guide](./pipelines/README.md)** (with
diagrams) — plus [`PLAN.md`](../PLAN.md) and the [`PIPELINES.md`](../PIPELINES.md)
design note.

## Build your own UI

`EditorEngine` is the headless editor behind `<km-editor>` — exported so you can drive the
same document from **your own** toolbar, menus and status line (any framework). It is a seam
for your own UI; if you just want the editor without writing UI, use `<km-editor>`.

**What the engine does:** owns the ProseMirror document + view in the element you give it
(the first constructor argument), assembles schema, commands, keybindings, Markdown I/O and pipelines from the plugin
set (`plugins`, default `defaultPlugins()`), runs commands through their pipelines
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

**Settings go one way** (rulebook C-CA-39): `new EditorEngine(mount, options)` →
`engine.setOptions(partial)` (merges into the current settings and applies only what changed, in place — the
document and undo history stay) → `engine.getOptions()` (the merged options, read-only).

**Options = the element's settings**, same names and same defaults (rulebook C-CA-37). Live through
`setOptions()`: `isReadonly` (`false`), `labels` (`null` = English), `locale` (`null` = the page locale, then
the browser — the `{ctx.count}` numbers `engine.label()` formats), `translateCallback` (`null`; asked before the
page-wide `window.components.locale.translateCallback`), `interactionHost` (`null` = the core dialog). After a
`labels` / `locale` / `translateCallback` change, redraw your own UI. Construction-only (build a new engine to
change them): `plugins` (the editor plugin list, `defaultPlugins()`; raw ProseMirror plugins go in `prosemirrorPlugins`).
Content: one of `markdown` / `html` / `json` / `doc` (data, not kept in `getOptions()`; later `setContent()`). The element's chrome settings
(`toolbar`, `statusbar`, `viewMode`, `anchor`, `menu-presentation`, `renderIconCallback`,
`renderLoadingCallback`, `beforeActionCallback`, `customStyles`, `name`, …) have no engine
option — they configure UI the engine does not draw.

```js
import { EditorEngine, labelKey } from '@keenmate/web-editor';

const engine = new EditorEngine(document.querySelector('#surface'), {
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
// later: engine.setOptions({ isReadonly: true }); engine.destroy();
```
