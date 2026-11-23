# Changelog

All notable changes to `@keenmate/web-editor` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-rc01] - 2026-11-22

The first release — nothing has been published to npm before it. Everything below is the work to date; the
BREAKING entries record changes made during development and only matter to code written against an unpublished
build (a `file:` link or a git checkout).

### Added — icons by name: the `icons` map (core 1.0.0-rc26, rulebook C-CA-42, 2026-11-24)

- New **`icons`** input (property object or JSON attribute, applies live): icon overrides by name
  (`{ bold: 'fa-solid fa-bold' }`). The page-wide flat `window.components.icons` (`'km-editor.<name>'` before
  `'<name>'`) works too; both come right after markup in core `renderIcon`'s order and repaint in place.
- The built-in commands carry icon **names** (`bold`, `italic`, `underline`, `heading`, `paragraph`, `bulletList`,
  `orderedList`, `codeBlock`, `undo`, `redo`, `insertLink`, `image`, `cloud`, `table`); `EDITOR_ICONS` answers them
  last (core `renderIcon` `defaults`, the context menu through `openMenu`'s `iconDefaults`), so a
  `renderIconCallback` now also sees these names (return `null` to keep the default). New types `EditorIconName`,
  `EditorIcons`.
- BREAKING (unpublished builds): a command's `icon` is the name, not the SVG markup — a headless `EditorEngine` UI
  looks it up in `EDITOR_ICONS`. `EDITOR_ICONS.link` is now **`EDITOR_ICONS.insertLink`**: `link` is a core built-in
  icon name (it would draw the theme glyph before the editor's own SVG is asked).

### Internal — engine defaults from core `getInputDefaults` (core 1.0.0-rc26, 2026-11-24)

- `ENGINE_DEFAULTS` (the `EditorEngine` option defaults, rulebook C-CA-37) is core `getInputDefaults(INPUTS, keys)`
  instead of a private stubbed-attribute resolution. The `labels` row now declares `default: null` (the value it
  already had as an engine default; the manifest shows it). Same values as before (unit test).

### Changed — command labels on core `{ fallback }` (core 1.0.0-rc26, 2026-11-24)

- The label resolver no longer registers a command's English text in a private copy of the defaults per call:
  it passes it as core `/locale`'s per-call `{ fallback }` (a `translateCallback` still gets it as `template`; a
  built-in key keeps its own default). The resolver is built over core `createLabelsView`.
- The tooltip twin is two plain calls: the customized `tooltips.<name>` (`''` when none) is the fallback of an
  unset `ariaLabels.<name>` / `buttons.<name>` / `menuItems.<name>`, ahead of the command's English text. With a
  `translateCallback`, the text key's callback call gets that tooltip as its `template`.
- BREAKING (`LabelResolver` type, `ctx.label`): the 4th `twins` argument is gone — `(key, params?, fallback?)`.

### Internal — toolbar Escape leaves the tooltip to core (core 1.0.0-rc26, 2026-11-23)

- The toolbar's own "a shown tooltip takes the first Escape" guard is gone: core `createTooltip` now claims that
  Escape itself (hides + `preventDefault()`) when keyboard focus showed the tooltip, and the toolbar already skips
  a prevented Escape. Same behaviour — first Escape hides the tooltip and stays on the button, the second returns
  to the text; a hover-shown tooltip doesn't hold the Escape. New e2e covers it.

### Changed — core 1.0.0-rc26, the final v1 names (2026-11-23)

- `@keenmate/web-components-core` → `^1.0.0-rc26`. The batch write the element inherits from core is now
  **`el.setProperties(props)`** (was `el.setAttributes(props)`, no alias) — the manifest / IDE data follow.
- Internal: core's renamed API — `RenderLoadingCallback` type, `createMenuPresentationInputs()` /
  `getMenuPresentationOptions()`, and the option fields the editor passes follow core's `*Callback` naming
  (`createAsyncRunner` `errorCallback`, floating-toolbar anchor `placedCallback`, context menu `closeCallback`,
  output-format tabs `focusItemCallback`). No behaviour change.

### Changed — BREAKING — labels read the spot's context, `{ctx.*}` (rulebook D-NC-24, 2026-11-23)

- **A dynamic label passes its values as `{ ctx }`**, so the templates read dotted paths: `labels.words` /
  `labels.chars` are `Words: {ctx.count}` / `Chars: {ctx.count}` (was `{count}`), `headers.codeLanguage` /
  `headers.codeLanguageChange` are `Enter language ({ctx.languages})` / `Change language ({ctx.languages})` (was
  `{languages}`). A bare `{count}` / `{languages}` in your `labels` or page dictionary is no longer filled (no alias).
  `ctx.count` is the number the text's noun agrees with (words / characters), so an app's i18n can pluralize; the
  number is still shown formatted for the `locale`.
- A `translateCallback` gets the context as **`params.ctx`** (`params.ctx.count`, raw number), not flat `params.count`;
  an i18next bridge is `t(key, { ...params, count: params.ctx?.count })`.
- New exported types `StatusCountLabelContext` (`{ count }`) and `CodeLanguageLabelContext` (`{ languages, language? }`
  — `language` = the code block's current language in the change prompt). `LabelParams` (the `label()` /
  `formatLabel()` params) is now `{ ctx: object }`; a plugin's own dynamic text calls
  `ctx.label(key, { ctx: { count } }, 'English: {ctx.count}')`.
- The editor's `labels.ts` already delegated to core `/locale` (`createLabels` / `formatLabel`), so dotted paths
  and locale number formatting come from core — no private copy to change.
- Docs: `examples-localization.html` LO03 shows the real i18next setup (`labels.words_one` / `_few` / `_other`) and the
  generic bridge (`const options = { ...params, count: params.ctx?.count }; i18next.exists(key, options) ? i18next.t(key, options) : null`);
  new LO07 renders the status bar's real word count in Czech via `translateCallback` + `Intl.PluralRules('cs')`
  ("1 slovo / 3 slova / 5 slov").

### Added — `required` through core validity (rulebook C-CA-41, core 1.0.0-rc25, 2026-11-22)

- **`required`** (`isRequired`, boolean, reflects): while the document has no content — no text after trimming
  whitespace and no non-text node (image, table, horizontal rule, a plugin's node) — the host is invalid with
  `validity.valueMissing` and the surrounding `<form>` refuses to submit. New label **`errors.required`** ("This
  field is required."). Read-only / disabled (incl. `<fieldset disabled>`) are never missing; core adds
  `aria-required` + `:state(required)` on the host, the editing surface gets `aria-required="true"`, and
  `reportValidity()` anchors the bubble on the surface. Re-checked on every content change (typing, `value`,
  `setValue()`, form reset) and after a `plugins` swap. Example BU09, docs/usage.md → Required and validation.

### Added — accessibility (2026-11-22)

- The editing surface is a WAI-ARIA textbox: `role="textbox"` + `aria-multiline="true"`, `aria-readonly="true"`
  while not editable (read-only, `preview`, a gating lock), `aria-disabled="true"` while disabled. Its accessible
  name comes from the element like a native control's — `aria-labelledby`, else `aria-label`, else a
  `<label for>` (referenced through `ariaLabelledByElements` where supported, its text copied into `aria-label`)
  — else the new label **`ariaLabels.editor`** ("Rich text editor"). `EditorEngineHost` gains the optional
  `getAccessibleName()` / `isDisabled()`; `EditorEngine.refreshAttributes()` re-reads the surface attributes.
- **Alt+F10** moves focus from the text into the selection toolbar while it shows, else into the static
  toolbar; **Escape** in either toolbar returns to the text with the selection kept (a tooltip shown on the
  focused button takes the first Escape).
- **Shift+F10** / the **ContextMenu** key open the context menu at the caret with its first item focused —
  handled by the editor itself (the browser's follow-up `contextmenu` is swallowed, so the native menu never
  shows over it). Off while read-only / `preview`, like the right-click menu.
- The split view's output tabs are a WAI-ARIA **tab list** (`role="tablist"` / `tab` / `tabpanel`,
  `aria-selected`, `aria-controls`, `aria-labelledby`): one tab stop, arrows (wrapping) / Home / End move and
  select (core `createRovingFocus`); the panel is focusable. New label **`ariaLabels.outputTabs`** ("Output format").
- Screen-reader **announcements** through core `announce()`: a view-mode switch that fires `view-mode-change`
  (toolbar, `setViewMode()`, a plugin) says "Edit view" / "Split view" / "Preview" / "Inline view" (new labels
  `ariaLabels.viewModeEdit` / `viewModeSplit` / `viewModePreview` / `viewModeInline`; `''` silences one). The
  status-bar counts are deliberately not a live region (no announcement per keystroke) — docs/accessibility.md →
  Announcements lists what is and isn't announced.

### Fixed — small accessibility items (2026-11-22)

- Clicking the element's `<label for>` / a wrapping `<label>` focuses the editing surface (it did nothing — the
  browser sends the label's click to the host, which isn't focusable). Not while disabled.
- A `<label for>` added, reworded or removed after the editor connected now names the editing surface: the name
  is re-read whenever the surface takes focus (before: only on connect / a `labels` change).
- Visible keyboard focus ring: toolbar / selection-toolbar buttons, the split view's output tabs and its output
  panel draw the new **`--we-focus-outline`** (default the shared `--base-focused-outline`) /
  **`--we-focus-outline-offset`** on `:focus-visible` only (before: the browser default outline) — including the
  button Alt+F10 lands on (Chromium doesn't count Alt+… as keyboard interaction; the bar is marked
  `data-keyboard-focus` until focus leaves it). The manifest lists both + `--base-focused-outline` / `--base-outline-width`.

### Internal — the CSS variables reach the editor tooling (2026-11-22)

- `custom-elements-manifest.config.mjs` runs core's `cssVariablesFromManifestPlugin()` (like the other
  components): the `--we-*` variables from `component-variables.manifest.json` are now `cssProperties` in
  `custom-elements.json`, `web-types.json` and the VS Code custom-data files (CSS autocomplete). The config
  comment and the publish command no longer claim there is no manifest / no `check:vars` step (stale since
  the manifest landed); the publish checks run `npm run check:vars`.

### Fixed — accessibility / doctor (2026-11-22)

- The pending loader keeps spinning under `motion="none"` and OS reduced motion — by design (core SPEC §12.16:
  a loader is an activity indicator, not a decorative animation; base-css-variables slows it to 1.5s under
  reduced motion). Now documented (docs/accessibility.md → Motion) and pinned by an e2e; it was listed as a gap.
- `component-variables.manifest.json`: `--base-duration-fast` is marked `"readBy": "@keenmate/web-components-core"`
  — the tooltip fade it times moved to core `createTooltip` (73d4e31), so the editor CSS no longer reads it
  (doctor `[vars]` + C-BV-6 pass).

### Docs — example pages follow the theme switch (kmwc doctor, 2026-11-22)

- `examples-pipelines.html` (85 hard-coded colours), `examples-plugins.html` (6), `examples-content.html` (3) →
  0: page CSS reads the kit's `--kmwc-*` tokens (the visualizer lanes keep their dark "microscope" look via the
  console tokens; stage states = success / warning / danger); form controls take the kit's own styling instead of
  page-local borders / backgrounds.

### Docs — example pages fit a phone (check-pages 390 / 320 px, 2026-11-22)

- `examples-pipelines.html`: the visualizer's fixed `1fr 460px` columns and its own controls row → the kit's
  `.grid-2` / `.controls` (one column on a phone); was 667 px wide at 390 / 320.
- `examples-playground.html`: the harness's hidden floating toolbars wrap within the viewport; was 517 px wide.

### Docs — full API in docs/usage.md, + examples / accessibility guides (readme-structure C-RS-3 / C-RS-10, 2026-11-22)

- The README's Options / Labels / Forms / Responsive rules / Extending sections moved to **`docs/usage.md`**
  (attributes and properties, property-only inputs, events, methods, slots and lifecycle, labels, forms,
  responsive rules, extending, build your own UI). The README keeps a short `## Usage` overview with links
  (387 → 148 lines).
- New **`docs/examples.md`** — every example page and section code (BU / RC / PP / PV / LO / PG), plus worked
  examples (sanitized form submission, a trimmed toolbar with an own item, a live preview mirror).
- New **`docs/accessibility.md`** — keyboard map (shortcuts, toolbar roving focus, context menu, dialogs), roles /
  ARIA, screen-reader names, focus management, motion, and the known gaps.

### Changed — tooltips fade through core (2026-11-22)

- `.we-tooltip` drops its own opacity / visibility fade (and the `.we-tooltip--visible` rule): core `createTooltip`
  fades it in AND out (`km-tooltip--hiding`, `--base-duration-fast`, follows `motion`) and sets `data-placement` (the
  resolved side) on it. `.we-tooltip--visible` is still the shown-state class (no rule of its own).
- Removed, no alias: `--we-tooltip-duration` (nothing reads it any more — the fade is timed by `--base-duration-fast`).

### Added — icons repaint when the page-wide icon hook changes (2026-11-22)

- Assigning `window.components.renderIconCallback` after the editor rendered repaints the toolbar / selection-toolbar
  item icons in place (core `iconsChanged()`, rulebook C-CA-40) — the document, selection, focus, undo history and an
  open menu are kept. `EditorEngine` renders no icons (your own UI draws them), so it has no icon refresh method.

### Internal — the Custom Elements Manifest lists the public API only (core 1.0.0-rc25, 2026-11-21)

- `custom-elements.json` is regenerated through core's `blissAnalyzerConfig` public-API filter: private / protected /
  `#` / `_` members and modules that `src/index.ts` does not re-export (the internal `src/ui/*` chrome, `src/inputs.ts`,
  `src/dialogs.ts`, `src/predicates.ts`, …) are dropped. The element's attributes, properties, events and public
  methods, and every export of the package entry, are unchanged; `web-types.json` /
  `vscode.html-custom-data.json` follow.

### Changed — BREAKING: `EditorEngine` takes settings one way (rulebook C-CA-39)

- **`new EditorEngine(mount, options)`** — the mount element is the first argument (the `mount` option is gone):
  `new EditorEngine({ mount, markdown })` → `new EditorEngine(mount, { markdown })`.
- **`engine.setOptions(partial)`** merges into the current settings and applies only what changed, in place (no
  rebuild — document, selection and undo history stay); a key set to `undefined` resets it to the element's default.
  **`engine.getOptions()`** returns the merged options (read-only; the initial content is not kept). Settings:
  `isReadonly`, `labels`, `locale`, `translateCallback`, `interactionHost`; `plugins` / `prosemirrorPlugins` /
  `schema` / `host` stay construction-only (`setOptions` ignores them with a warning).
- Removed, no aliases: `engine.setEditable(x)` → `engine.setOptions({ isReadonly: !x })`;
  `engine.setInteractionHost(host)` → `engine.setOptions({ interactionHost: host })`; the writable
  `engine.labels` / `engine.locale` / `engine.translateCallback` properties → `setOptions({ … })` /
  `getOptions().…`; the `getLabels` / `getLocale` live-source options → `setOptions({ labels })` /
  `setOptions({ locale })` (`<km-editor>` now pushes its settings from `update()`).
- `engine.isEditable()` stays: `!isReadonly` AND not locked by a gating pipeline run. The lock is now separate
  state — it no longer overwrites `isReadonly`, and a read-only change during a locked run is kept on unlock.
- One settings type: `setOptions()` takes `Partial<EditorEngineOptions>` (the constructor's type) — no separate
  `*Settings` / `*Config` type (C-CA-39). The element's API is unchanged.

### Added — `locale` input (rulebook C-CA-38)

- **`locale` input (attribute + property):** the BCP-47 locale of the numbers the editor formats — the status-bar
  `{count}` of `labels.words` / `labels.chars` (`locale="de"`: `Words: 1.234`) — and the `locale` a
  `translateCallback` gets. Unset (default; `'auto'` / empty = unset): the page-wide
  `window.components.locale.locale`, else the browser language. Applies live (no rebuild), not reflected.
- **The status-bar `{count}` is locale-formatted** — the counts go to core `/locale` as raw numbers, so 1234 words
  read `Words: 1,234` in `en-US`, `1.234` in `de-DE`, `1 234` in `cs`, and a `translateCallback` receives
  `params.count === 1234` (plural rules work).
- **`EditorEngine` `locale` option** (live: `setOptions({ locale })`, read: `getOptions().locale`): the element's
  default (`null`) from the same input table (C-CA-37); `<km-editor>` passes its `locale` through.
- `examples-localization.html` LO05 has a `locale` toggle (`de` / `cs` / unset) next to the page-locale one.

### Docs — README under the 400-line cap (readme-structure C-RS-2)

- **"Build your own UI"** (the `EditorEngine` guide + own-toolbar example) moved to **`docs/usage.md`**; the full
  theming guide (dark mode, variables, custom CSS, loader / motion, context-menu properties) to **`docs/theming.md`**.
  The README keeps a short section with a link for each, and gains the canonical `## About` / `## Built with
  BlissFramework` sections and a CHANGELOG link.

### Docs — the shared localization page

- **`examples-localization.html`** — the shared localization page (LO01–LO06): instance `labels` (short + full keys),
  the page-wide dictionary (toolbar names, group name, view buttons, status bar, the code-block prompt),
  `translateCallback` (the element's own first, then the page-wide one; instance `labels` still win), and the
  screen-reader name / tooltip following a translated caption, the status-bar counts formatted per page locale
  (LO05, a locale toggle). LO06 says why it doesn't apply (every label is text).

### Changed — BREAKING (label keys, rulebook D-NC-24 / core 1.0.0-rc25 `/locale`)

- **`labels` keys are flat `<elementType>.<name>`** — the element type says where the text is shown. The
  page-wide dictionary is ONE flat object of full keys: `window.components.locale.labels['km-editor.tooltips.bold']`
  (was the nested `labels: { 'km-editor': { boldTooltip } }`); the instance `labels` takes short
  (`tooltips.bold`) or full keys. `window.components.locale.formatLabelCallback` is gone — use
  **`translateCallback({ component, key: '<full key>', template, params, locale })`**. English defaults unchanged.
  The ONE command text is now split per surface:

  | Old key | New key |
  | --- | --- |
  | `<command>` (e.g. `bold`, `insertLink`) | `ariaLabels.<command>` (icon toolbar button), `buttons.<command>` (text toolbar button: `buttons.viewEdit` / `viewSplit` / `viewPreview`), `menuItems.<command>` (context menu) |
  | `<command>Tooltip` | `tooltips.<command>` |
  | `<groupId>Group` (`formatGroup`, …) | `ariaLabels.<groupId>Group` |
  | `placeholder` | `placeholders.document` |
  | `words` / `chars` | `labels.words` / `labels.chars` |
  | `ok` / `cancel` | `buttons.ok` / `buttons.cancel` |
  | `linkUrlPrompt` | `headers.linkUrl` |
  | `imageUrlPrompt` / `imageAltPrompt` | `headers.imageUrl` / `headers.imageAlt` |
  | `codeLanguagePrompt` / `codeLanguageChangePrompt` | `headers.codeLanguage` / `headers.codeLanguageChange` |
  | `cloudImage` / `cloudImageTooltip` / `insertCloudImage` | `ariaLabels.cloudImage` / `tooltips.cloudImage` / `menuItems.cloudImage` |
  | `cloudImagePickerTitle` / `cloudImagePickerMessage` | `headers.cloudImagePicker` / `messages.cloudImagePicker` |
  | `markdownTab` / `htmlTab` / `jsonTab` | `buttons.markdownTab` / `buttons.htmlTab` / `buttons.jsonTab` |
  | `back` / `close` | `buttons.back` / `ariaLabels.close` |
  | `loading` | `ariaLabels.loading` |
  | `valueFormatError` | `errors.valueFormat` |

- **One text, one key**: a TEXT toolbar button (`buttons.<command>`, e.g. the view-mode buttons) is named by its
  visible text and no longer carries an `aria-label` copy of it (same accessible name). `ariaLabels.*` stays only
  where nothing visible names the element: icon toolbar buttons, toolbar groups, the dialogs' / sheet's ✕, the
  loader. Twins share `<name>` (`ariaLabels.bold` + `tooltips.bold`, `ariaLabels.cloudImage` + `tooltips.cloudImage`
  + `menuItems.cloudImage`), so an `ariaLabels.x` / `tooltips.x` you didn't set follows a customized twin (core
  `/locale`): translate only `tooltips.bold` and the icon button's name follows. A command tooltip you didn't set is
  still its (translated) text + the shortcut. The prompt dialogs are named by their visible title (`headers.*`,
  `aria-labelledby`). No key was removed.

### Changed — `EditorEngine` takes the element's settings with the element's defaults (rulebook C-CA-37)

- **BREAKING:** the `EditorEngine` option `isEditable` is now **`isReadonly`** — the name of `<km-editor>`'s
  setting, same default (`false`, editable). No alias: `new EditorEngine({ mount, isEditable: false })` →
  `new EditorEngine({ mount, isReadonly: true })`. The `isEditable()` / `setEditable()` methods are unchanged.
- **BREAKING:** the `EditorEngine` option **`plugins`** is now the editor plugin list — the name and default
  (`defaultPlugins()`) of `<km-editor>`'s `plugins` (rulebook C-CA-37). The old editor-list option
  `editorPlugins` is gone, and the raw ProseMirror plugin option (was `plugins`) is now **`prosemirrorPlugins`**.
  No aliases: `new EditorEngine({ mount, editorPlugins: [...defaultPlugins(), myPlugin], plugins: [pmPlugin] })` →
  `new EditorEngine({ mount, plugins: [...defaultPlugins(), myPlugin], prosemirrorPlugins: [pmPlugin] })`.
- New `EditorEngine` option **`labels`** (the element's `labels`, same keys, default `null` = English); `labels` and
  `translateCallback` apply live through `engine.setOptions({ … })` (read back with `getOptions()`).
- Every option the engine shares with `<km-editor>` (`isReadonly`, `labels`, `translateCallback`,
  `interactionHost`) defaults from ONE source: the element's input table moved to `src/inputs.ts` and the engine
  reads `ENGINE_DEFAULTS`, derived from its rows the way the element seeds its config. The element is unchanged.
- README **"Build your own UI"**: what `EditorEngine` does, what you draw, a minimal own-toolbar example
  (also a unit test); stale "the engine is internal" / `plugins:` engine snippets fixed.

### Added — `translateCallback` (rulebook C-CA-33, core 1.0.0-rc25)

- **`translateCallback`** (property only, core `/locale` `TranslateCallback`:
  `({ component, key: 'km-editor.<key>', template, params, locale }) => string | null | undefined`, applies live):
  this element's own translation seam — asked for every label key its `labels` didn't set, BEFORE the page-wide
  `window.components.locale.translateCallback`; `null` / `undefined` = not mine → the page-wide one. Instance
  `labels` still beat both.
- **`EditorEngine` `translateCallback` option** — a standalone engine (no `<km-editor>` host) asks it too, in
  the element's order: `labels` → page dictionary → `translateCallback` → the page-wide
  `window.components.locale.translateCallback` → built-in English (`null` = not mine; a throw is logged → the
  next rule).
  The standalone path now goes through core `createLabels(null, …, { tag: 'km-editor', getTranslateCallback })`
  (core rc25) instead of the editor's own copy of the chain: same order; numeric `{count}`-style params are
  locale-formatted like the element's, and a throwing callback is logged by core.

### Added — `renderIconCallback` (rulebook C-CA-33, core 1.0.0-rc25)

- **`renderIconCallback`** (property only, `(name, ctx) => string | null | undefined`, applies live): this
  element's own icon hook — asked for an item `icon` after markup and the reserved built-in names, BEFORE the
  page-wide `window.components.renderIconCallback`; `null` / `undefined` = not mine → the page-wide one.
  `ctx` = `{ component: 'km-editor', element, prefix: 'we', item }`. One editor on a page needs no
  `window.components` setup.

### Changed — BREAKING (icon order, core 1.0.0-rc25 `renderIcon`)

- **A one-word icon name that is not a core built-in now renders an icon-font `<i class="we__icon gear"
  aria-hidden="true">`**, no longer a `--base-icon-gear` mask. The mask is reserved for the built-in names
  (`check`, `close`, `settings`, `delete`, … — core `BUILT_IN_ICON_NAMES`); an ASCII class list
  (`'fa-solid fa-star'`) is an icon font. Upgrade: `icon: 'gear'` → a built-in name (`'settings'`), markup, an
  icon-font class list, or draw it in `renderIconCallback`. `.we__icon` is `flex: none` and sized like the mask.

### Changed — BREAKING (icons, rulebook C-CA-33)

- **Item icons go through core `renderIcon`** (SPEC §12.33): an `icon` string starting with `<` is inserted as
  markup (was: shown as text), an ASCII name (`'gear'`, `'HL'`, `'N'`) is now a glyph masked from
  `--base-icon-<name>` in `currentColor` — **it no longer shows the letters** (nothing is drawn while the token
  is unset); anything else (an emoji, `'¶'`, `'✎'`) is text as before. Upgrade: a text "icon" made of ASCII
  letters → an SVG, a `--base-icon-*` token name, or a non-ASCII glyph. `ICON_CSS` is adopted in the shadow root.
- **The built-in toolbar icons are inline SVGs** (1em, `currentColor`, `aria-hidden`; were the text glyphs
  `B` / `I` / `U` / `H1` / `P` / `• List` / `1. List` / `</>` / `↶` / `↷` and the emoji `🔗` / `🖼` / `☁` / `⊞`),
  exported as **`EDITOR_ICONS`**. The button is named by its `aria-label` (the item text), as before.

### Changed — core 1.0.0-rc25 adoption

- **Shortcut display is core's `formatShortcut`** (`/actions`, also the exported `formatShortcut`): on
  Apple platforms a shortcut now reads `⇧⌘Z` (was `Cmd+Shift+Z`), like every Keenmate component; elsewhere
  unchanged (`Ctrl+Shift+Z`). `Mod` resolves through core's `getEnvironment().isApple` (no own
  `navigator.platform` sniffing).
- **Stacking uses core's z-index tiers:** the inline-mode card and the selection toolbar sit on
  `--we-popover-z-index` → `var(--base-z-popover, 7600)` (were the literals `1000` / `1100`); tooltips on
  `--we-tooltip-z-index` → `--base-z-tooltip`.
- **The hidden form input is core's `createFormInputs`** (SPEC §12.21) — same `<input type="hidden" name>`
  child, same value / disabled sync; the editor keeps its own serialization (`contentFormat` +
  `getValueFormatCallback`).
- **Prompts and confirmations are core `/dialog` modals** (SPEC §12.19), no longer `window.prompt` /
  `window.confirm`: the link URL, image URL + alt text and code-block language prompts, and the default
  `interactionHost` (a pipeline stage's confirmation, closed when the run is superseded). Styled, a bottom
  sheet on a phone, inert page + Tab trap, focus back in the editor. A prompting command answers `true` at
  once and applies its edit after the answer. New labels **`ok`** / **`cancel`** (the ✕ takes `close`); the
  prompt texts lost their trailing colon (they are the dialog title now: `Enter link URL`, …).
- **Labels resolve through core `/locale`** (SPEC §12.24): per key the element's `labels` → the page-wide
  `window.components.locale.labels['km-editor']` → English, then the page's `formatLabelCallback` (ICU /
  i18next) if set. Assigning `window.components.locale` re-renders every live editor (`localeChanged()`).
  New keys **`markdownTab`** / **`htmlTab`** / **`jsonTab`** — the split view's output tabs were hard-coded
  English. `formatLabel` is core's.
- **Toolbar keyboard (WAI-ARIA toolbar, core `createRovingFocus`):** the static toolbar is ONE tab stop
  (was: every button); the arrows along the docked edge (Left / Right on `top` / `bottom`, Up / Down on
  `start` / `end`, `aria-orientation`) and Home / End move focus across every group; disabled buttons are
  skipped. The groups are `role="group"` (were nested `role="toolbar"`). The selection toolbar is one tab
  stop with Left / Right too.
- **Toolbar / status tooltips are core `createTooltip`** (one delegated tooltip over `[data-tooltip]`), no
  longer native `title`: themed (`--we-tooltip-bg` / `--we-tooltip-color` → the shared `--base-tooltip-*`
  tokens, `--base-z-tooltip`), shown on keyboard focus too, `aria-describedby` while shown, Escape hides it.
  The button's `title` attribute is gone — its text is `data-tooltip`.
- **Right-to-left:** list indent, the code-block language label, table header alignment, the empty-document
  placeholder and the start / end toolbar border use logical CSS (`padding-inline-start`, `inset-inline-end`,
  `text-align: start`, …) instead of left / right — they mirror under `dir="rtl"`.
- **Split view stacks by the editor's own width**, not the viewport: below 720 px of EDITOR width the output
  goes under the editor (a CSS container query on the host in split mode; was `@media (max-width: 720px)`),
  so a narrow editor in a wide sidebar stacks and a wide one on a tablet doesn't.
- Examples: BU08 (page-wide labels through `window.components.locale`, live); BU03 describes the toolbar keyboard
  and tooltips.

### Internal — core 1.0.0-rc25
- Deferred pipelines debounce / supersede / drop stale runs through core `createAsyncRunner` (SPEC §12.22);
  the loader threshold that pauses while a dialog waits (`PendingGate`) stays the editor's.
- Inline mode: core `anchor({ shouldRestorePlacement: true })` puts the host's position / left / top back on
  teardown (was cleared by hand).
- `el.controller` is built by core `createControllerFacade` (SPEC §12.34) — same frozen method list + live `value`.
- Needs `@keenmate/web-components-core` `^1.0.0-rc25` (unpublished at the time of writing; bump the
  dependency when it ships).

### Added — context menu presentation (core rc24)

- **`menu-presentation`** (`auto` | `floating` | `sheet` | `drawer`, property `menuPresentation`) and
  **`menu-side`** (`start` | `end`, property `menuSide`) — core's standard menu-host inputs
  (`menuPresentationInputs()`), read at every right-click menu open (effective config, so responsive
  rules apply). The sheet / drawer back and close buttons take the new labels **`back`** (`Back`)
  and **`close`** (`Close`).

### Internal — core 1.0.0-rc24 (2026-11-15)
- core `^1.0.0-rc24` (was `^1.0.0-rc22`) — needs `@keenmate/web-components-core` `^1.0.0-rc24` (the context menu presentation above).

### Internal — core 1.0.0-rc22 (2026-11-13)
- **Requires `@keenmate/web-components-core` `^1.0.0-rc22`** (was `^1.0.0-rc21`).

### Internal — devkit 1.0.0-rc14 (2026-11-13)
- **`@keenmate/web-components-devkit` `^1.0.0-rc14`** (was `^1.0.0-rc01`): synced Makefile / CLAUDE.md, new
  `check:pages` script. Example pages: prose named the retired `format` attribute — now `content-format`;
  every section `<h2>` carries its code (pipelines PV01–PV03, playground PG01; the pipelines column titles are `<h3>`).

### Changed — BREAKING (theming)

- **The `theme` input is removed** (attribute, property, `EditorConfig.theme` and the exported
  `EditorTheme` type). The editor now follows the page like every KeenMate component: core detects
  `data-theme` / `data-bs-theme` / `.dark` / `.light` on `<html>` / `<body>`, a `theme-source`
  section or `setThemeMode()`, and mirrors it onto the host as `data-context-theme`; with no signal
  the host inherits the page's `color-scheme`. Force one editor with
  **`<km-editor data-theme="dark">`** (or `"light"`) — replace `theme="dark"` with
  `data-theme="dark"`. No alias: a leftover `theme` attribute does nothing.

### Changed (theming)

- **The stylesheet is split into the standard files** under `src/css/` — `main.css` (layer order +
  imports only) → `variables.css` (`variables` layer), `base` / `controls` / `floating` / `states` /
  `content` / `output` / `animations.css` (`component` layer), `dark-mode.css` (`overrides` layer).
  `src/css/editor.css` is gone; `dist/style.css` is still the one bundled file. Being layered, any
  unlayered consumer rule now beats the editor's own rules.
- **Every color is a `--we-*` variable chained to the shared `--base-*` contract** (with the
  contract's defaults as `light-dark()` fallbacks), so a `:root` theme reaches the editor. The look
  moves to the KeenMate defaults: **`--we-accent` defaults to the contract primary `#3b82f6`** (was
  `#0066cc`), `--we-danger` to `--base-danger-text-color` (was `#c62828`), body text to
  `--base-text-color-1` (was `#333`), muted text (status bar, placeholder) to `--base-text-color-2`, shadows to `--base-shadow-color`, the font to
  `--base-font-family`. The focused-node outline is the accent (was `#8cf`).

### Added (theming)

- **Dark-mode e2e suite** (`e2e/dark-mode.spec.ts`, fixture `test/dark-mode.html`): every signal of
  the rulebook's testing table, non-switches, WCAG contrast of text / chrome / content in both
  schemes, and the floating layers in a dark editor on a light page. `npm run check:vars` added
  (the devkit's manifest check).
- **`component-variables.manifest.json`** at the package root (exported as
  `@keenmate/web-editor/manifest` and `/component-variables.manifest.json`, shipped in `files`):
  every `--base-*` the editor reads (plus the `--base-*` core's context menu reads, marked
  `readBy`), every `--we-*` it declares, and the 17 `--we-context-menu-*` pass-through inputs
  (`"input": true` — unset by design, so the page-wide `--km-menu-*` and the theme flow through).
- **Dark mode the KeenMate way** — `dark-mode.css` carries the four canonical rules
  (`:host([data-context-theme])`, then `:host([data-theme])`, each only `color-scheme`); every
  color resolves through its `light-dark()` pair, so a page's `--base-*` theme keeps flowing in
  both modes. The selection toolbar and the context menu (both in the shadow root) follow the
  host. Before, the editor ignored the page: white on a dark page. Demo: Basic → BU04.
- **New `--we-*` variables:** `--we-text-color`, `--we-text-on-accent`, `--we-hover-bg`,
  `--we-shadow-color`, `--we-font-family`, `--we-selection-toolbar-bg` / `-color` (the pill stays
  dark in both modes — the shared tooltip tokens), `--we-link-color` / `-hover`,
  `--we-selected-outline-color`, `--we-selected-cell-bg`, `--we-inline-code-bg` / `-color`, and
  `--we-code-block-bg` / `-color` / `-label-color` + `--we-code-toolbar-label-color` (code blocks
  stay dark in both modes on purpose — the highlighting is Prism's dark "tomorrow" theme).

### Changed — BREAKING (core 1.0.0-rc20 alignment)

Requires `@keenmate/web-components-core` `^1.0.0-rc21` (was `^1.0.0-rc15`). No compatibility aliases.

- **`menuDivider()` → `createMenuDivider()`** (re-exported from core `/actions`, renamed in core rc18).
- **The default pending loader is `<span class="we__loader">`** (was `.we-loader`; core rc18 BEM
  naming). The `--we-loader-*` tokens and the `we-loader-spin` keyframes keep their names.
- **The page-wide loader hook is `window.components.renderLoadingCallback`** (core rc18; was
  `renderLoaderCallback`) — the same name as the instance `renderLoadingCallback`.
- **`theme` is a closed set: `light` | `dark`** (was free text). Any other value is refused — it warns,
  keeps the previous theme and fires `input-rejected`; `theme="dark"` behaves as before.
  *(Superseded: `theme` is removed — see "Changed — BREAKING (theming)".)*
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
  exported type `EditorTheme`; both removed again with `theme`, see "Changed — BREAKING (theming)").

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
