# Changelog

All notable changes to `@keenmate/web-editor` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Target: **1.0.0-rc01** (first release).

Pre-1.0, pre-publish. Everything below is the work to date; nothing has been
released to a registry yet.

### Changed — BREAKING (core 1.0.0-rc20 alignment)

Requires `@keenmate/web-components-core` `^1.0.0-rc20` (was `^1.0.0-rc15`); validated against the
rc21 pre-release. No compatibility aliases.

- **`menuDivider()` → `createMenuDivider()`** (re-exported from core `/actions`, renamed in core rc18).
- **The default pending loader is `<span class="we__loader">`** (was `.we-loader`; core rc18 BEM
  naming). The `--we-loader-*` tokens and the `we-loader-spin` keyframes keep their names.
- **The page-wide loader hook is `window.components.renderLoadingCallback`** (core rc18; was
  `renderLoaderCallback`) — the same name as the instance `renderLoadingCallback`.
- **`theme` is a closed set: `light` | `dark`** (was free text). Any other value is refused — it warns,
  keeps the previous theme and fires `input-rejected`; `theme="dark"` behaves as before.
- **Importing the element module alone no longer defines `<km-editor>`.** Only the package entry does,
  through core `registerComponent()` (the package `exports` already exposed only the entry).
- **The right-click menu closes on scroll by core's popover rule** (core rc20): only a scroll that
  moves the editor (the page or a scroller around it) closes it; a wheel that scrolls nothing, or a
  scroll inside the menu, no longer does.

### Added (core 1.0.0-rc20 alignment)

- **Custom CSS in the shadow root: `custom-styles` / `customStyles` + `getCustomStylesCallback(ctx)`**,
  plus the page-wide layer `window.components['km-editor'].customStyles` /
  `.getCustomStylesCallback(ctx)` (core `createCustomStyles()`): the page layer styles every editor,
  an instance's own CSS comes after it and wins; the callback wins over the string. An `@import`ed
  font is also linked once in `<head>`. Demo: Basic → BU06.
- **Every input is a typed property on `KmEditorElement`** (TypeScript: `el.viewMode`,
  `el.customStyles`, …), through `interface KmEditorElement extends EditorConfig`. `EditorConfig`
  gains `customStyles` / `getCustomStylesCallback`; `theme` is typed `EditorTheme | null` (new
  exported type `EditorTheme`).

### Changed (core 1.0.0-rc20 alignment)

- `el.value = …` assigned before the element is defined is applied by core (rc20), which replays it
  through the `value` setter; the editor's own rescue code is gone (same behaviour).
- Inline mode: detaching the editor clears only the placement core leaves (`position` / `left` /
  `top`); core rc19 `anchor().destroy()` restores the sizes it wrote, so a host's own inline `width`
  is no longer wiped.
- `@floating-ui/dom` is no longer a direct dependency — positioning goes through core
  `/positioning` only (the dev playground's floating toolbars now use core `anchor()`).
- e2e runs in Chromium, Firefox and WebKit (was Chromium only). Firefox skips the paste specs (a
  script-built `DataTransfer` arrives empty in a synthetic paste event); the CDP listener-count test
  is Chromium-only.
- The CEM reads `src/index.ts` again (the tag comes from `registerComponent()`); core rc21's `/cem`
  writes it deterministically (two builds leave the manifests unchanged).
- Examples: Rich Content cards on the kit `.grid-2` (page-local `.rc-split` removed).

### Fixed (core 1.0.0-rc20 alignment)

- **Read-only is focusable, like a native `readonly` control** (core SPEC §6.4). The read-only
  surface (`readonly`, `view-mode="preview"`) was out of the tab order (`contenteditable="false"`,
  no `tabindex`); it is now reachable by Tab, and Ctrl/⌘+A selects the document so it can be copied
  from the keyboard. Disabled stays unfocusable (`inert`).

### Changed — BREAKING (assigning state is silent)

Suite rule: assigning a value / state property never fires the component's events (like a
native `input.value`); methods and user interaction do.

- **`el.value = …` no longer fires `change`.** The hidden form input (`name`) is still synced.
  Typing / toolbar / paste and `setValue()` still fire it.
- **`setValue(value, format?, options?)`** — new `options.isSilent` (`{ isSilent: true }` skips
  `change`); non-silent by default. Same on `el.controller.setValue`.
- **Switching `contentFormat` (property or attribute) no longer fires `change`.** Read `el.value`
  after switching (it re-serializes on read).
- **Assigning `viewMode` (property or `view-mode` attribute) no longer fires `view-mode-change`.**
  `setViewMode()` and the view-mode toolbar items fire it (see Added).
- **`view-mode-change` detail is `{ viewMode, oldViewMode, source }`** (was `{ viewMode }`);
  `source`: `'user'` | `'plugin'` | `'api'`. `ViewModeChangeEventDetail` updated; new exported type
  `ViewModeChangeSource`.
- **A form reset no longer fires `change`.** `formResetCallback` restores `defaultValue` silently,
  like a native `form.reset()` (no `input` / `change`); the hidden form input is synced.
- **Read-only / `preview` keep the toolbar's view-mode group.** The editing groups are hidden as
  before, but the Edit / Split / Preview group stays so the user can leave `preview`. Disabled still
  hides the whole toolbar.

### Added

- **Responsive rules (core SPEC §6.7).** `<km-editor>` takes the shared core responsive rules — a
  map with a `device` axis (touch phone / tablet by capability) and a `breakpoint` axis (window
  width), `{ device: { mobile: {…} }, breakpoint: { mobile: {…} } }`, or a callback, page-wide (`window.components.responsive*`), per tag
  (`window.components['km-editor'].responsive*`) or per instance (`el.responsive` / JSON attribute
  `responsive`, `el.responsiveCallback`); an attribute / property set on the instance beats page
  rules. New exported types `EditorConfig`, `EditorResponsiveMap`, `EditorResponsiveCallback`.

- **Pending loader (shared KeenMate loader, core `renderLoader()` / SPEC §12.14).** While a deferred
  pipeline (e.g. the cloud-image `image:browser:pick` upload) outlives its loader threshold, a
  loader shows in the top-end corner of the editor body (`.we-pending`, `::part(loader)`,
  `role="status"`, `aria-label` = new label **`loading`** — "Loading…"). Default: the `.we-loader`
  spinner drawn from the new tokens **`--we-loader-icon` / `-rotate` / `-duration` / `-size`**
  (chained to `--base-loader-*`; it slows under reduced motion, never stops). New property-only
  input **`renderLoadingCallback`** `({ component, context: 'pipeline', containerElement, element,
  label }) => void | cleanup` draws it instead and beats the page-wide
  `window.components.renderLoaderCallback`. Engine: `pending` event `{ isPending }` + `isPending`;
  `PipelineRegistry.onAny(listener)`.
- **The loader threshold counts working time only.** While an interactive stage waits for the user (a
  host dialog, e.g. the cloud-image picker) the run reports the new status phase **`waiting`** — no
  pending loader (one already showing is withdrawn); the threshold clock restarts when the dialog
  closes, so the loader shows only if the work after it outlasts the threshold. Registry runs and
  `DeferredRunner` alike (`PendingGate`).
- **`setViewMode(mode, options?)`** on the element and `el.controller` — switches the view mode and
  fires `view-mode-change` (`source: 'api'`) unless `{ isSilent: true }`. No-op when the mode is
  already active; an invalid mode warns and is ignored. `controller.runCommand('view-…')` also
  reports `'api'`.
- **View-mode toolbar items `view-edit` / `view-split` / `view-preview`** — built-in commands /
  core action items forming a radio group: toggled (`aria-pressed`) while their mode is active (by
  any path, assignment included), a click switches with `source: 'user'`. The default toolbar's
  last group (`view`, pushed to the far end; not shown in `inline`). Labels `viewEdit` /
  `viewSplit` / `viewPreview` (`Edit` / `Split` / `Preview`) and `viewGroup` (`View`).
- **Plugin view-mode port:** `SetupContext.setViewMode` (plugin `setup`) and
  `StageServices.setViewMode` (`rt.setViewMode` in a pipeline stage) switch the mode with
  `source: 'plugin'`; absent on a standalone engine. (`ctx.controller` is the public facade —
  identical to `el.controller` — so calls through it report `'api'`.)

### Changed

- Depends on the published `@keenmate/web-components-core@^1.0.0-rc15` (was the local `file:` link).
- **Disabled commands fade by the contract's opacity:** new `--we-disabled-opacity:
  var(--base-disabled-opacity, 0.65)` on `:host`; `.we-cmd:disabled` used a hard-coded `0.4`
  (now `0.65` by default — a lighter fade, the same as every other Keenmate component). The
  context menu's disabled items keep `--we-context-menu-disabled-opacity` → `--km-menu-*` →
  `--base-disabled-opacity`. The editor has no transitions / animations of its own.

### Fixed

- `theme="dark"` sets `color-scheme: dark`, so the core-rendered context menu (and native controls) render dark instead of light.

- **Page-wide menu theming reaches the context menu.** `:host` set
  `--km-menu-bg: var(--we-context-menu-bg, var(--we-bg))` etc., which shadowed a page-level
  `:root { --km-menu-* }`. The `--we-context-menu-*` properties now map onto core's
  private `--_km-menu-*` layer with no fallback, so the chain is `--we-context-menu-*` →
  `--km-menu-*` → `--base-*` → core default. The menu no longer falls back to
  `--we-bg` / `--we-border` / `--we-accent` / `--we-muted-fg` / `--we-danger` or the
  editor's own literals (190px, 13px, 0.4, the 1100 z-index): unthemed, it takes core's
  defaults. New `--we-context-menu-hover-color` (hovered item text).

- **A DOM move no longer destroys the editor** (core build-once + activate/deactivate
  model). Moving / re-parenting a `<km-editor>` used to tear the engine down and
  rebuild it from a markdown snapshot: tables were lost (their markdown is raw HTML,
  which the parser ignores), and undo history and selection were reset. The engine
  now stays alive across `disconnect()` → `connect()`; only live resources pause
  (ProseMirror's document `selectionchange` listener, the inline anchor, open
  floating panels), so content, tables, undo history and selection survive, and a
  detached editor still answers `getValue()` / `getHTML()` / … (ED-1, ED-2).
- **`plugins` reassignment keeps tables** — the live content is carried over as HTML
  (lossless) instead of markdown (ED-1).
- **`setValue()` before the first connect is honoured** — it was overwritten by the
  first build's `value`. A `value` assigned *after* the `setValue()` still wins (ED-3).
- **`format` changed while detached** no longer re-parses the content in the wrong
  format on reconnect (the old markdown snapshot was parsed as HTML) (ED-4).
- **A `plugins` set that fails to assemble no longer empties the editor.** The new
  engine is built before the old one is torn down, so a throw (e.g. a node without a
  markdown serializer, or a plugin `setup()` error) leaves the previous engine — its
  content, undo history and `plugins` value — in place; the error is still thrown to
  the caller. On a successful swap the new set's `setup()` now runs before the old
  set's `destroy()` (ED-9).
- **Mod-k on an empty selection no longer pops a blocking `alert()`** — `insert-link`
  is a silent no-op there, matching the disabled toolbar / menu entry (ED-5).
- **A link created from the prompt has `title: null`**, like a parsed one (it was
  `''`), so the JSON of the same link no longer depends on how it was made (ED-7).
- **Markdown export escapes image `src` / link `href`** — a URL with spaces, `(` / `)`,
  `<` / `>` or `\` was written raw and broke the round-trip (the destination ended
  early). Titles now escape `\` as well as `"` (ED-6).
- **Shift-Enter inserts a hard break** (`<br>`, markdown `\` + newline) — it did
  nothing. New core command `hard-break` (not in code blocks) (ED-8).
- **An image inserted from the prompt or `image:browser:pick` has `title: null`**, like
  a parsed one (it was `''`) — same inconsistency as ED-7, for images.

### Changed — BREAKING (naming round 2)

- **Pipeline booleans take the `is`/`should` prefix:** `PipelineStage.interactive` →
  `isInteractive`, `PipelinePolicy.lock` → `shouldLock`, `InteractionResult.cancelled` →
  `isCancelled` (an `InteractionHost.request()` now resolves `{ isCancelled, value? }`).
- **`format` → `contentFormat`** (attribute `content-format`; `markdown` | `html` | `json`) —
  the format of the one document: the lens for `value` / `defaultValue` / the `change`
  detail. The **`change` detail is `{ value, contentFormat }`** (was `{ value, format }`).
  `setValue(value, format?)` keeps its explicit-format argument (without one, assign `value`).
- **The editor starts empty.** With no `value` the document is one empty paragraph
  (was a two-paragraph "Welcome to the KeenMate Web Editor…" text); `createEditorState()`
  defaults to an empty document too. `createDefaultDoc()` stays exported as demo content.

### Changed — BREAKING (suite-wide naming unification)

Clean breaks, no aliases (rulebook `naming-conventions.md` D-NC-13..27).

- **Ready / defer / destroy come from core `BlissElement`** (D-NC-19). The host
  attribute `is-ready` is gone — use the core `ready` attribute or `:state(ready)`;
  `el.isReady` / `el.whenReady()` / the `ready` event (+ `onReady`) are core's.
  `controller.isReady` is removed (read `el.isReady`). New: `defer` attribute /
  `el.shouldDefer` holds the first build until `el.release()` (or removing `defer`).
  `el.destroy()` is core's (final, idempotent; `el.isDestroyed`): it releases the engine
  and the shadow layout, and the element stays inert — re-inserting it no longer
  rebuilds a fresh editor (create a new element instead).
- **`mode` → `viewMode`** (attribute `view-mode`; no bare `mode`, D-NC-27): the
  edit / split / preview / inline presentation. The event `mode-change` → `view-mode-change`
  with detail `{ viewMode }` (was `{ mode }`), twin `onModeChange` → `onViewModeChange`.
  Types: `EditorMode` → `EditorViewMode`, `ModeChangeEventDetail` → `ViewModeChangeEventDetail`.
  CSS hook `:host([mode='inline'])` → `:host([view-mode='inline'])`.
- **Root CSS part `root` → `container`** (`::part(container)`, D-NC-27).
- **`value` is live state** (D-NC-14): `el.value` reads the live content serialized in
  `format` and assigning it replaces the document in place (no engine rebuild, the
  attribute is not written); `controller.value` is its read-only twin. The `value`
  ATTRIBUTE is the initial / default content — its property is now `el.defaultValue`
  (was `el.value`, which returned the assigned string, not live edits); changing it still
  rebuilds. **Removed:** `getValue(format?)` and its alias `getContent(format?)` on the
  element and the controller — read `value`, or `getHTML()` / `getMarkdown()` /
  `getJSON()` for a fixed format. `setValue(value, format?)` stays (explicit format; the
  controller's write path).
- **`readonly` reflects and uses native presence semantics** (D-NC-16): `el.isReadonly`
  writes the `readonly` attribute back, and any value means on (`readonly="false"` is now
  read-only, like a native control; remove the attribute instead).
- **Built-in item texts follow their command** (one label per command, D-NC-24): the
  command texts are now `Insert link` / `Insert image` / `Insert table` /
  `Insert code block` (were `Link` / `Image` / `Table` / `Code block` — visible as
  toolbar `aria-label`s; the context menu already said `Insert …`). The default
  selection-toolbar / context-menu lists no longer carry per-item text / tooltip
  copies, and `insert-link` / `insert-image` / `insert-table` / `insert-code-block`
  lost their fixed tooltips (now `<text> (<shortcut>)`, e.g. `Insert link (Ctrl+K)`;
  the old `Insert link (select text first)` hint is gone).
- **`promptForCodeBlock` / `changeCodeBlockLanguage`** (exported) are now factories
  `(label?) => Command` (were `Command` constants), so their prompts are translatable.

### Added (round 2)

- **Form participation (suite convention):** `name` attribute → a light-DOM hidden
  `<input name="…">` child carrying the live content in `content-format`, kept in sync on
  every change; `form.reset()` restores `defaultValue` (attribute `value`); disabled
  (`disabled` or an ancestor `<fieldset disabled>`, via core) → the input is disabled and
  not submitted. No `setFormValue` (one entry per name).
- **`getValueFormatCallback(ctx) => string`** (property): formats the value written into
  the hidden form input (e.g. sanitizing HTML); `ctx` = `{ value, contentFormat }` +
  `controller` / `element`. Only the submitted value — `el.value` and the `change` detail
  stay the document in `contentFormat`. A throw is logged (error level), the hidden input
  gets `''`, the host turns invalid via core `setFormatError` (validation message = new label
  `valueFormatError`, default "The value could not be formatted."), so the form refuses to
  submit (`<form novalidate>` submits `''`), and the new **`value-format-error`** event
  `{ error, value }` (twin `onValueFormatError`) fires. The next successful format clears it.
  Core's `el.validity` / `validationMessage` / `checkValidity()` / `reportValidity()` apply.
- **`labels.placeholder`** (default `''` = off): text shown while the document is empty
  (CSS `attr()` + `aria-placeholder`), applied live.

### Added (naming unification)

- **`disabled` / `el.isDisabled`** (D-NC-16): no interaction — not editable, not focusable
  or selectable (the shadow container is `inert`), toolbar hidden. Reflects to `disabled`.
  The element is now **form-associated** (`static formAssociated = true`), so an ancestor
  `<fieldset disabled>` disables it too (core `isEffectivelyDisabled`, without touching
  `isDisabled`) and `el.form` resolves. The editor still submits nothing with a form.
- **`labels`** (property or JSON attribute, D-NC-24): every UI string — command item
  texts / tooltips (key = camel-cased command id, `<key>Tooltip`), toolbar group names
  (`<groupId>Group`), status items (`words`, `chars`), the link / image / code-language
  prompts and the cloud-image picker texts. Partial over built-in English, `{name}`
  placeholders, applied live. One resolver seam (`engine.label`, `ctx.label`, plugin
  builder `label`, stage `rt.label`) for the future core `/locale`. Exported:
  `DEFAULT_LABELS`, `labelKey`, `formatLabel`, types `EditorLabels`, `LabelResolver`, ….

### Changed — BREAKING (interaction model, web-components-core rc15)

Callbacks, events and every clickable item (static toolbar, selection toolbar, context menu)
follow the shared KeenMate interaction model (web-components-core `/actions`). No aliases —
rename on upgrade.

**Every callback takes ONE `ctx` argument.** Every ctx and every event detail carries
`controller` (the public `EditorController`, also `el.controller`) and `element` (the host) —
both non-enumerable, so `JSON.stringify` / logs see only the data. Contexts built by a
standalone `EditorEngine` (no `<km-editor>` around it) carry only their fields.

| Old | New |
|---|---|
| `el.engine` (the internal `EditorEngine`) | `el.controller` — the public facade: `getValue(format?)`, `getContent`, `getHTML`, `getMarkdown`, `getJSON`, `setValue(value, format?)`, `focus()`, `isReady`, `runCommand(name \| ProseMirror Command)`, `isCommandToggled(name)`, `isCommandEnabled(name)`. `EditorEngine` stays exported for standalone use |
| `el.engine.setInteractionHost(host)` (lost on every engine rebuild, e.g. a `plugins` change) | `el.interactionHost = host` — a property input; survives rebuilds |
| `el.engine.events.on('lock', …)` | the `lock-change` event / `onLockChange({ isLocked })` |
| `el.engine.run(name)` / `el.engine.view` (to dispatch a transaction) | `el.controller.runCommand(name)` / `el.controller.runCommand((state, dispatch) => …)` |
| `CommandSpec.isActive(state)` / `isEnabled(state)` | `getIsToggledCallback({ state })` / `getIsEnabledCallback({ state })` |
| — | `CommandSpec.text` / `icon` / `tooltip` — display defaults for any item naming the command |
| `StatusItem.render(state)` | `render({ state })` (+ `controller` / `element`); `title` → `tooltip` |
| `InteractionHost.request(req, signal)` | `request(ctx)` — `ctx` = the request (`kind`, `title`, `message`, `payload`) + `signal` (+ `controller` / `element` inside `<km-editor>`). Stages call `rt.ui.request({ ...req, signal: rt.signal })` |
| `imageBrowserPlugin({ upload(asset, signal) })` | `upload({ asset, signal })` |
| engine bus event `selectionUpdate` | `selection-change` |

**Items — toolbar / selection-toolbar / context-menu entries are core action items**

| Old | New |
|---|---|
| `CommandItem { type: 'command', command, label, icon?, title? }` | `ActionItem` (`EditorActionItem`): `{ action, id?, text, icon, tooltip, shortcut, cssClass, isVisible, isDisabled, isToggled, isDanger, get*Callback(ctx), onClick(detail) }` — `command` → `action`, `label` → `text`, `title` → `tooltip` |
| — | string shorthand: `'bold'` = `{ action: 'bold' }`; text / icon / tooltip / shortcut / toggled / disabled default from the registered command (`tooltip` = `text (Ctrl+B)` from its first key). An unknown command renders disabled |
| `SeparatorItem { type: 'separator' }` | a divider entry `{ divider: true, text? }` (or `menuDivider(text)`, exported) — leading / trailing / doubled dividers and hidden items are trimmed |
| `ToolbarItem` (union) | `EditorToolbarEntry` = `EditorActionItem \| MenuDivider \| string` |
| `ToolGroup { id, label?, items: CommandItem[] }` | `ToolGroup { id, text?, items: EditorToolbarEntry[] }` — still a layout cluster (not a submenu); `text` is its `aria-label` |
| active state = `CommandSpec.isActive` only | toggle state: item `isToggled` / `getIsToggledCallback(ctx)` wins over the command's; rendered as `.toggled` + `aria-pressed="true"` on toolbar buttons, and as `role="menuitemcheckbox"` + `aria-checked` on context-menu items |
| — | custom items: `action: 'custom'` (or none) + `id`; they run `onClick` and fire `action`, no command |
| a click ran the command synchronously, no event, no veto | every activation: `beforeActionCallback(detail)` (`false` cancels, async OK) → item `onClick(detail)` → the command → the `action` event (a notification after the fact — the listener sees the formatted document; `detail.state` is the snapshot from activation). Runs on a microtask (core `runAction`) |
| — | `beforeActionCallback` — a new property input |
| button `data-command="bold"` | `data-action="bold"` (+ `data-id` for custom items) |
| — | context-menu items show the display shortcut (`.km-menu-shortcut`) |

**BREAKING (2026-10-26, core rename `isActive` → `isToggled`, no aliases):** the toggle
state is `isToggled` everywhere — `CommandSpec.getIsActiveCallback` → `getIsToggledCallback`,
item `isActive` / `getIsActiveCallback` → `isToggled` / `getIsToggledCallback`,
`controller.isCommandActive(name)` → `isCommandToggled(name)`, the `.active` class on toolbar /
menu buttons → `.toggled` (`.km-cmd.toggled`, `.km-menu-item.toggled`). Toolbar buttons keep
`aria-pressed`; a context-menu item for a toggle command is `role="menuitemcheckbox"` +
`aria-checked="true|false"`, other items `role="menuitem"`.

Keyboard shortcuts are ProseMirror keymaps bound to the command pipelines: they run the
command directly — no `action` event, no `beforeActionCallback`. Submenus (`children`) are not
supported in the editor's menus.

Built-in action names are the registered command ids — already kebab-case (`bold`,
`insert-link`, `bullet-list`, `add-row-after`, …). Plugin pipelines keep their `:`-namespaced
names (`image:browser:pick`); each segment is kebab.

**Events** — DOM events (bubble, not composed) + a camelCase `on*` twin called with the SAME
detail first (the twin no longer receives the `CustomEvent`).

| Old | New |
|---|---|
| `change` — `EditorChangeDetail { value, format }`; `onChange(event)` | `change` — `ChangeEventDetail { value, format }` + context; `onChange(detail)` |
| `ready` — no detail; `onReady(event)` | `ready` — `ReadyEventDetail` (the context only); `onReady(detail)` |
| `mode-change` — `EditorModeChangeDetail { mode }`; `onModeChange(event)` | `mode-change` — `ModeChangeEventDetail { mode }`; `onModeChange(detail)` |
| — | `lock-change` — `LockChangeEventDetail { isLocked }`; `onLockChange(detail)` |
| — | `action` — `EditorActionEventDetail`: `action`, `id`, `item`, `source` (`toolbar` \| `selection-toolbar` \| `context-menu`), `sourceEvent`, `triggerElement`, `dataset`, `state`; `onAction(detail)` |
| types `EditorChangeDetail`, `EditorModeChangeDetail`, `ToolbarItem`, `CommandItem`, `SeparatorItem` | removed — see the new types above (`EditorController`, `EditorActionItem`, `EditorToolbarEntry`, `CommandContext`, `StatusContext`, `EditorEventMap`, …) |

**Fixed:** the Plugins example's lock badge read `e.locked` (the engine reports `isLocked`), so
it never left "idle"; it now uses `onLockChange({ isLocked })`.

### Changed

- **CSS prefix `km-` → `we-`** (BREAKING for custom styling). Every class and
  custom property of the editor's own chrome is renamed with the same BEM shape:
  `.km-root` → `.we-root`, `.km-surface` → `.we-surface`, `.km-toolbar-zone` →
  `.we-toolbar-zone`, `.km-cmd` → `.we-cmd`, `.km-status-item` → `.we-status-item`, …;
  `--km-border` / `--km-bg` / `--km-accent` / `--km-danger` / … → `--we-*`.
  `km-` is reserved for shared UI rendered by `@keenmate/web-components-core` (its
  `/menu` renders `.km-menu*` / `--km-menu-*`), which the editor's own `.km-menu`
  collided with. The tag stays `<km-editor>`.
- **The context menu is core `openMenu()`** (`@keenmate/web-components-core/menu`),
  like web-treeview's. Core renders it (`.km-menu` / `.km-menu__item` /
  `.km-menu__shortcut` / `.km-menu__divider`; the root keeps the `.we-context-menu`
  class and `part="context-menu"`) and owns positioning, dismissal (outside press,
  scroll, window blur, another KM overlay, Escape, Tab) and the WAI-ARIA keyboard
  (↑ / ↓ / Home / End skip disabled items, Enter / Space activate, focus returns to
  the editor). Toggles stay `menuitemcheckbox` + `aria-checked` (the toggled class
  is now `km-menu__item--toggled`; disabled items are `aria-disabled` divs).
  Theme it with the new `--we-context-menu-*` properties (mapped onto core's
  `--km-menu-*`). The editor's own menu markup (formerly `.km-menu-item`, `.km-menu-label`,
  `.km-menu-shortcut`, `.km-menu-sep`) and the `CommandBar` `variant` option are
  gone.
- **Built on `@keenmate/web-components-core` 1.0.0-rc15** — the input table uses its renamed
  `shouldReflect` flag (the interaction-model change above is the only API change).
- **Moved onto `@keenmate/web-components-devkit` and flattened to a single-package
  repo.** The npm-workspaces layout had one package (`packages/editor`); `src/`,
  `test/`, the example pages and the configs now live at the root (moved with
  history). The Vite and Playwright configs are the devkit presets, configured in
  `package.json#kmwc`; `Dockerfile`, `nginx.conf`, `Makefile` and `.dockerignore`
  are generated by `kmwc sync` (vitest targets in `Makefile.local`). Library output
  is unchanged: `dist/web-editor.js`, `.umd.js`, `style.css`, `index.d.ts` (now
  rolled up into one file).
- **Vite 7** (from 5) and **Vitest 3** (from 2). **Dev port 12700** (examples image
  12710), the repo's block in the Keenmate component registry (was 21113).
- **Example pages are fragments** on the devkit layout and kit (shared styles,
  chapter nav, copy-link, light / dark / auto theme switch, version badge); the hub
  is `renderExamplesIndex({ pages })`. Saved control state survives (same storage
  keys). The examples site is the devkit's multi-page build (`vite.examples.config.ts`
  is gone). `EXAMPLES.md` now points to the devkit.

### Removed

- `examples-shared.css`, `examples-chapter-nav.js`, `examples-copy-link.js`,
  `examples-controls-store.js` (now in the devkit), `vite.examples.config.ts`,
  `tsconfig.base.json` and the workspace root `package.json`.

### Added

- **Custom Elements Manifest** (`npm run analyze`, part of the build):
  `custom-elements.json`, `web-types.json` and the VS Code custom-data files.
- **Playwright e2e suite**: `e2e/smoke.spec.ts` (render + typing + `change` on
  `test/fixture.html`) and `e2e/examples.spec.ts` (hub + every example page).
- `LICENSE`, `.claude/commands/publish.md`.
- **Headless `EditorEngine`** — owns the ProseMirror view/state, schema, command
  registry, and a typed event bus (`change` / `selection-change` / `transaction` /
  `ready` / `destroy`), with an HTML / Markdown / JSON serialization API
  (`serialize` / `parse`, lossless HTML+JSON; Markdown import/export at the edges).
- **`<km-editor>` Web Component** on `@keenmate/web-components-core` (`BlissElement`,
  shadow DOM, adopted styles). Inputs: `value`, `format` (`markdown`/`html`/`json`),
  `mode`, `isReadonly` (attribute `readonly`), `toolbar`, `statusbar`, `theme`, `anchor`, `beforeActionCallback`,
  `interactionHost`. Events: `change`, `ready`, `mode-change`, `lock-change`, `action`.
  Content API: `getValue`/`getHTML`/`getMarkdown`/`getJSON`, `setValue`, `focus`,
  `isReady`, `controller`.
- **View modes** — `edit`, `split` (editor + live md/html/json output), `preview`
  (read-only), and `inline` (overlay card that can anchor to a live-page element).
  The editor mount is persistent, so the document/selection survive a mode switch.
- **Command-driven chrome** — one command model behind a static zone toolbar, a
  selection floating toolbar, and a right-click context menu; all reflect each
  command's `getIsToggledCallback` / `getIsEnabledCallback`.
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
- **Pipeline layer (Phase 7) — "commands ARE pipelines".** A named, trigger/
  command-bound chain of async-by-default stages threading a context `{ doc, extra }`
  (outcomes `resolve` / `halt` / `skip`). The engine assembles one `PipelineRegistry`:
  every `CommandSpec` auto-wraps into a one-stage **sync** pipeline named by its id,
  so a toolbar button, a keybinding, and `engine.run(name)` all fire the same named
  pipeline — and anything triggerable is extensible the same way. Plugins declare
  pipelines (`EditorPlugin.pipelines`) and splice stages into any pipeline by anchor
  (`EditorPlugin.stages` — `before` / `after` / replace-in-place / `remove`); an
  unknown pipeline or a missing anchor throws at assembly (same strictness as the
  serializer contract). **Deferred** pipelines get the async machinery (abort /
  supersede, loader threshold, optional surface **lock** via `setEditable(false)`)
  and a host-injected `InteractionHost` for interactive (modal) stages; a stage
  writes to the document through `rt.dispatch` / `rt.runCommand`. New engine surface:
  `engine.pipelines`, `engine.run(name)`, `engine.setInteractionHost(host)`, a `lock`
  event, and an `interactionHost` option.
- **Cloud-image plugins** — `imageBrowserPlugin({ upload })` (a deferred, locking
  `image:browser:pick` pipeline: pick → upload → insert, with a toolbar ☁ button)
  and `imageBase64Plugin` (splices a `to-base64` stage **before** `insert` without
  importing the browser plugin — the extension-bus proof). Dev visualizer page
  (`pipelines.html`) gains a command-triggered image lane, a cloud picker, and a
  base64 toggle.
- Categorised logging (`EDITOR:*`) via the shared core logging module.
- **Examples site + `EXAMPLES.md`** — a hub `index.html` (page registry → cards +
  a floating jump-nav) with per-feature pages (Basic Usage, Rich Content, Plugins &
  Pipelines, Pipeline Lab, Playground) on a shared skeleton (`examples-shared.css` +
  self-initializing JS: chapter-nav / copy-link / controls-store). A multi-page
  Vite build (`build:examples` → `dist-examples/`) packages it as a self-contained
  static site; `EXAMPLES.md` is the portable guide for reproducing the convention.
- **Real-editor example pages.** A new **Rich Content** page puts the first-party
  content plugins on a small live `<km-editor>` — links, images, tables, and code
  with syntax highlighting — each card showing the feature land in the document,
  with a page-wide **Markdown / HTML / JSON output-lens toggle** on the readouts
  (one document, any serialization; the table card shows the raw-HTML-vs-clean-
  `<table>` contrast, HTML/JSON lossless). **Plugins & Pipelines** gains PP03
  **Cloud image → crop → insert**: a second plugin splices an interactive `crop`
  stage after `upload` into `image:browser:pick` (the browser plugin untouched),
  landing the cropped image in the editor. The former **Pipeline Visualizer** page
  becomes the **Pipeline Lab** — the run visualizer plus the (design-stage)
  phase/config-cell and image use-case prototypes folded in as sections; the two
  standalone prototype pages are removed.
- **Static examples image** — a two-stage `Dockerfile` (node build → nginx serve)
  + `nginx.conf` that serves `dist-examples/` and silently drops vulnerability-
  scanner traffic.
- **Pipeline ordering & configuration — design + dev prototype (design-stage).**
  `PIPELINES.md` gains the phase model: a pipeline-owned ordered **phase**
  vocabulary; the **propose/dispose** ladder (a plugin proposes a stage's `phase`,
  the app owner disposes via per-phase `order` / `assign`); soft intra-phase
  anchors (`afterIfPresent` / `beforeIfPresent`); and the **config cell** — config
  as a property of the `(stage × pipeline)` pair, resolved default ← factory ←
  per-pipeline and read by a stage as `rt.config`. Also: plugin **public API** as a
  first-class contract with wrapper/adapter plugins, and batch-as-a-wrapper. Two
  dev-only visualizations (now sections of the **Pipeline Lab** example page)
  prototype it end to end against the real assembler without touching the shipped
  engine — **Phases & Config Cell** (ordering + config
  resolution + the assembly throw cases) and **Image Pipeline Use Cases** (an
  interactive crop-editor stage, a planner driving the same crop stage headless,
  and the API-wrapper + batch + gallery flow, with real `Blob`s). Not yet promoted
  into the engine.

### Notes

- Markdown import does not parse tables back into nodes (export is a raw-HTML GFM
  fallback); HTML and JSON round-trip losslessly.
- Deferred: drag-and-drop reordering of tool groups; multiple simultaneous toolbar
  zones; declarative (attribute/registry) plugin loading on the element.
