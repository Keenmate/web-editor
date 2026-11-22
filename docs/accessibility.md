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

Focus does not wrap at the ends; disabled buttons are skipped. Activating a command returns focus to
the editing surface.

### Context menu

Opens on the browser's `contextmenu` event over the editing surface (right click; the keyboard
<kbd>Shift</kbd>+<kbd>F10</kbd> / Menu key where the browser raises that event). Core `/menu`:

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
- **Split view output tabs** (Markdown / HTML / JSON) are plain buttons — each a Tab stop, activated with
  <kbd>Enter</kbd> / <kbd>Space</kbd>.
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
- the loader: `ariaLabels.loading`; the split tabs: `buttons.markdownTab` / `htmlTab` / `jsonTab`;
  the sheet / drawer menu chrome: `buttons.back` / `ariaLabels.close`.

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

- **Selection toolbar:** no key moves focus into it — its commands are reachable by their shortcuts,
  the static toolbar and the context menu.
- **Context menu:** no own keyboard opener; it relies on the browser raising `contextmenu` for
  <kbd>Shift</kbd>+<kbd>F10</kbd> / the Menu key.
- **Announcements:** no live region — the status-bar counts and the split view's output are not announced;
  the split tabs are buttons, not a `tablist`.
- **Loader spin:** not stopped by reduced motion.
- No automated axe audit; the keyboard / ARIA behaviour above is covered by the e2e specs
  (`toolbar`, `context-menu`, `readonly`, `formatting`, `history`, `links`, `tables`, `lists`, `loader`, `modes`).
