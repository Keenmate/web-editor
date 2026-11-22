# Accessibility — `<km-editor>`

What ships today: the keyboard model, roles / ARIA, accessible names, focus management and motion —
plus the known gaps. Labels (every accessible name is translatable) are in [usage.md → Labels](./usage.md#labels).

## Keyboard

### Editing surface

`Mod` = Ctrl (Windows / Linux) or ⌘ (macOS). Command shortcuts run the command's pipeline, like the
toolbar button — but skip `beforeActionCallback` and fire no `action` event. A button's tooltip shows its
first shortcut ("Bold (Ctrl+B)").

| Key | Action |
| --- | ------ |
| <kbd>Mod</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Bold / italic / underline |
| <kbd>Mod</kbd>+<kbd>K</kbd> | Insert link (opens the link prompt; needs a non-empty selection) — on a linked selection, removes the link |
| <kbd>Mod</kbd>+<kbd>Z</kbd> | Undo |
| <kbd>Mod</kbd>+<kbd>Y</kbd> / <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Line break (not inside a code block) |
| <kbd>Enter</kbd> | New paragraph; in a list, split the list item |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | In a table: next / previous cell. In a list: nest / lift the item. Elsewhere: the browser's focus move |
| <kbd>Mod</kbd>+<kbd>A</kbd> | Select the whole document (also while read-only) |
| <kbd>Alt</kbd>+<kbd>F10</kbd> | Focus the selection toolbar while it shows (a text selection), else the static toolbar |
| <kbd>Shift</kbd>+<kbd>F10</kbd> / <kbd>ContextMenu</kbd> | Open the context menu at the caret, its first item focused (not while read-only / `preview`) |
| Backspace / Delete, arrows, Home / End | ProseMirror's base editing keys |

Headings, lists, code blocks, tables and the view modes have no shortcut — use the toolbar or the
context menu. There are no Markdown-style input rules (typing `# ` does not make a heading).

### Toolbar

The static toolbar is **one tab stop** (roving `tabindex`) for all its groups:

| Key | Action |
| --- | ------ |
| <kbd>Tab</kbd> | Into / out of the toolbar |
| <kbd>←</kbd> / <kbd>→</kbd> (`toolbar="top"` / `"bottom"`) | Previous / next button |
| <kbd>↑</kbd> / <kbd>↓</kbd> (`toolbar="start"` / `"end"`) | Previous / next button |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last button |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Activate the button |
| <kbd>Escape</kbd> | Back to the editing surface, the selection kept (a tooltip shown on the focused button takes the first <kbd>Escape</kbd>) |

Focus does not wrap at the ends; disabled buttons are skipped. Activating a command returns focus to
the editing surface. <kbd>Alt</kbd>+<kbd>F10</kbd> from the text lands on the toolbar's current tab stop.

### Selection toolbar

Shown over a non-empty text selection; <kbd>Alt</kbd>+<kbd>F10</kbd> moves focus into it (the selection stays).
Same keys as the static toolbar: one tab stop (`role="toolbar"`, roving `tabindex`), <kbd>←</kbd> / <kbd>→</kbd>,
<kbd>Home</kbd> / <kbd>End</kbd>, <kbd>Enter</kbd> / <kbd>Space</kbd> run the command (focus returns to the text),
<kbd>Escape</kbd> goes back to the text with the selection kept.

### Context menu

Opens on right click (the browser's `contextmenu` event over the editing surface) at the pointer, and on
<kbd>Shift</kbd>+<kbd>F10</kbd> / the <kbd>ContextMenu</kbd> key at the caret with its first item focused — the
editor handles those keys itself (the `contextmenu` event a browser may raise right after is swallowed, so the
native menu never shows over it). Core `/menu`:

| Key | Action |
| --- | ------ |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Previous / next enabled item (the first <kbd>↓</kbd> reaches the first item) |
| <kbd>Home</kbd> / <kbd>End</kbd> | First / last enabled item |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Run the item (Space toggles a checkbox item) |
| <kbd>Escape</kbd> | Close, focus back to the editor |
| <kbd>Tab</kbd> | Close and move on |

Read-only and `preview` editors show the browser's own menu instead.

### Dialogs, tooltips, other surfaces

- **Prompts / confirmations** (link URL, image URL, code language, the cloud-image picker) are core
  `/dialog` modals: the page is inert, <kbd>Tab</kbd> is trapped, <kbd>Enter</kbd> confirms, <kbd>Escape</kbd>
  cancels and returns focus to the editor.
- **Tooltips** show on hover and on keyboard focus; <kbd>Escape</kbd> hides one (WCAG 1.4.13).
- **Split view output tabs** (Markdown / HTML / JSON) are a WAI-ARIA tab list — one tab stop;
  <kbd>←</kbd> / <kbd>→</kbd> (wrapping), <kbd>Home</kbd> / <kbd>End</kbd> move to a tab and select it
  (automatic activation); <kbd>Tab</kbd> moves on to the output panel (focusable, so its text can be scrolled).
- **Inline view mode** is a positioned card, not a dialog — no focus trap, no Escape handling.

## Roles and ARIA

| Surface | Markup |
| ------- | ------ |
| Static toolbar | `role="toolbar"` + `aria-orientation` (`horizontal` top / bottom, `vertical` start / end) |
| Toolbar group | `role="group"` + `aria-label` (`ariaLabels.<groupId>Group`, e.g. `formatGroup`) |
| Separator inside a group | `role="separator"` |
| Toolbar button | native `<button>`; `aria-pressed="true"` while toggled (bold under the caret, the active view mode); `disabled` + `aria-disabled` |
| Icon | the built-in SVGs are `aria-hidden="true" focusable="false"` |
| Tooltip | core tooltip (`role="tooltip"`), wired as `aria-describedby` while shown; buttons carry no `title` |
| Selection toolbar | `role="toolbar"` (horizontal), shown for a non-empty text selection while editable |
| Context menu | `role="menu"`; items `menuitem`, toggles `menuitemcheckbox` + `aria-checked`, disabled `aria-disabled` |
| Editing surface | ProseMirror `contenteditable` (`true` / `false`), `tabindex="0"`, `role="textbox"` + `aria-multiline="true"` + an accessible name (see below); `aria-readonly="true"` while not editable (read-only, `preview`, a gating pipeline lock), `aria-disabled="true"` while disabled; `aria-placeholder` while empty (from `placeholders.document`) |
| Split view output | `role="tablist"` (`aria-label` = `ariaLabels.outputTabs`) of `role="tab"` buttons (`aria-selected`, `aria-controls`, roving `tabindex`) over one `role="tabpanel"` (`aria-labelledby` the selected tab, `tabindex="0"`) |
| Pending loader | `role="status"` + `aria-label` (`ariaLabels.loading`) |
| Dialogs | core `/dialog` — modal, titled by the prompt header (`headers.*`) |

**Disabled** (`disabled`, or an ancestor `<fieldset disabled>`): the whole editor is `inert` — not
editable, not focusable, not selectable; the toolbar is hidden. **Read-only** (`readonly`, or
`view-mode="preview"`): `contenteditable="false"` but still in the tab order, selectable and copyable;
only the view-mode toolbar group stays; the selection toolbar and the custom context menu are off.

## Screen-reader names

Every name comes from `labels` (English defaults, translatable per key — see
[usage.md → Labels](./usage.md#labels)):

- an icon toolbar button: `ariaLabels.<name>` (`<name>` = the command id camel-cased — `bold`,
  `insertLink`, …); a text button (the view-mode buttons): its visible `buttons.<name>`;
- the tooltip: `tooltips.<name>`; a context-menu entry: `menuItems.<name>`. An unset `ariaLabels.x`
  follows a customized `tooltips.x` (and the reverse), so translating one of the pair is enough;
- toolbar groups: `ariaLabels.<groupId>Group`;
- dialogs: `headers.*` (titles), `buttons.ok` / `buttons.cancel`, `ariaLabels.close` (the ✕);
- the editing surface (`role="textbox"`), like a native control: the element's `aria-labelledby` elements,
  else its `aria-label`, else its `<label for>` / wrapping `<label>` — else `ariaLabels.editor`
  ("Rich text editor"). A label element is referenced through `ariaLabelledByElements` where the browser
  has ARIA element reflection (the label sits outside the shadow root), and its text is copied into the
  surface's `aria-label` everywhere. Re-read on connect and on a `labels` / locale change — a label added
  later takes effect on the next of those;
- the loader: `ariaLabels.loading`; the split tabs: `buttons.markdownTab` / `htmlTab` / `jsonTab`, their
  tab list `ariaLabels.outputTabs`;
  the sheet / drawer menu chrome: `buttons.back` / `ariaLabels.close`.

## Announcements

Screen-reader announcements go through core `announce()` — the page's one polite live region (shared by
every Keenmate component). Only explicit actions are announced, never typing:

| When | Text (`labels` key; `''` silences it) |
| ---- | ------------------------------------- |
| The view mode switches with a `view-mode-change` event (a view-mode toolbar button, `setViewMode()`, a plugin) — not a plain `viewMode` assignment or `setViewMode(…, { isSilent: true })` | `ariaLabels.viewModeEdit` / `viewModeSplit` / `viewModePreview` / `viewModeInline` ("Edit view" / "Split view" / "Preview" / "Inline view") |

Deliberately **not** announced: the status-bar counts (words / characters) — they change on every keystroke,
so the status bar is no live region (read it by navigating to it); the split view's output — it follows every
edit; the selected output tab is conveyed by `aria-selected`. A running pipeline's loader is its own
`role="status"` (named by `ariaLabels.loading`).

## Focus management

- `el.focus()` / `controller.focus()` focus the editing surface (after applying pending writes).
- Toolbar and selection-toolbar buttons don't take focus on mouse press, so a click keeps the editor's
  focus and selection; every command refocuses the editor afterwards.
- A prompt returns focus to the editor (applied or cancelled); so does closing the context menu.
- Switching the view mode keeps the document, selection and undo history (the editing surface is
  re-parented, not rebuilt).
- Disabled removes the editor from the focus order (`inert`); read-only keeps it there.

## Motion

The editor animates through the core motion tokens: tooltip, dialog and menu transitions use
`--base-duration-*`, set by the core `motion` input (`auto | none | snappy | smooth`) or the page-wide
`window.components.motion`; the OS reduced-motion setting always wins. The only own animation is the
pending loader's spin (`--we-loader-duration`, chained to `--base-loader-duration`).

## Known gaps

- **Loader spin:** not stopped by reduced motion.
- No automated axe audit; the keyboard / ARIA behaviour above is covered by the e2e specs
  (`toolbar`, `context-menu`, `readonly`, `formatting`, `history`, `links`, `tables`, `lists`, `loader`, `modes`).
