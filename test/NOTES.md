# Test infrastructure notes

Running notes from building the e2e harness (`e2e/`, fixtures in `test/*.html`).
Each entry is something in the **component** that looks like a bug, friction
point, or design question — not a problem with the tests. IDs `ED-n` come from
the cross-repo plan (`web-components-core/docs/e2e-coverage-plan.md`, WP-ED).
A spec that pins the correct behaviour of an open entry is marked
`test.fail(true, 'NOTES.md ED-n')`.

---

## ~~ED-1. Tables lost on DOM move / `plugins` reassignment~~ — FIXED (Unreleased)

**Fixed:** the engine stays alive across disconnect/connect (only live resources pause: PM's DOM observer, inline anchor, floating panels); `plugins` swaps carry content over as HTML; a pre-connect `setValue()` is held in `#pendingSet`. Pinned by `e2e/lifecycle.spec.ts`.

**Where:** `src/web-component.ts` `disconnect()` + `set plugins()` snapshot live
content as **markdown** (`engine.serialize(format)`); the table plugin's markdown
serializer writes raw HTML (`plugins/tables.ts`), but the markdown parser runs
with `html: false` (`engine/serialization/markdown.ts`), so the rebuilt engine
gets the table as literal text / drops it.

**Repro:** `el.setValue('<table>…</table>', 'html')`, then
`parent.appendChild(el)` (move) → the table is gone.

**Suggested fix:** keep the engine alive across disconnect/connect (D1) and
snapshot `plugins` reassignment via `getJSON()`.

## ~~ED-2. Undo history / selection lost on every DOM move~~ — FIXED (Unreleased)

**Fixed:** the engine stays alive across disconnect/connect (only live resources pause: PM's DOM observer, inline anchor, floating panels); `plugins` swaps carry content over as HTML; a pre-connect `setValue()` is held in `#pendingSet`. Pinned by `e2e/lifecycle.spec.ts`.

**Where:** `src/web-component.ts` `disconnect()` tears the engine down, `connect()`
rebuilds it. Violates core's build-once + activate/deactivate model (decision D1:
a move must keep content, tables, undo and selection).

## ~~ED-3. `setValue()` before first connect is discarded~~ — FIXED (Unreleased)

**Fixed:** the engine stays alive across disconnect/connect (only live resources pause: PM's DOM observer, inline anchor, floating panels); `plugins` swaps carry content over as HTML; a pre-connect `setValue()` is held in `#pendingSet`. Pinned by `e2e/lifecycle.spec.ts`.

**Where:** `setValue()` stores `#content`, but the first-connect `reinit()`
overwrites `#content` from `config.value`.

## ~~ED-4. `format` changed while detached parses the snapshot in the wrong format~~ — FIXED (Unreleased)

**Fixed:** the engine stays alive across disconnect/connect (only live resources pause: PM's DOM observer, inline anchor, floating panels); `plugins` swaps carry content over as HTML; a pre-connect `setValue()` is held in `#pendingSet`. Pinned by `e2e/lifecycle.spec.ts`.

**Where:** the `disconnect()` snapshot is serialised in the *old* format; a
`format` change while detached lands before `connect()`, so the rebuild parses
e.g. the markdown snapshot as HTML.

## ED-5. Mod-k with an empty selection pops a blocking `alert()`

**Where:** `src/plugins/link.ts` `promptForLink` — `alert('Please select some text
first…')`. The toolbar is guarded by `getIsEnabledCallback`, but keymaps run the
command directly and skip it.

**Suggested fix:** keymap path should honour `getIsEnabledCallback` (or the
command should just return `false` silently).

## ED-6. Image markdown writes `src` unescaped

**Where:** `src/plugins/image.ts` markdown serializer —
`![alt](${src} "title")`. A `src` with spaces or `)` breaks the round-trip.

## ED-7. Link `title` is `''` on create vs `null` on parse

**Where:** `src/plugins/link.ts` — `toggleLink(schema, href, title = '')` vs the
parser's `title: tok.attrGet('title') || null`. The JSON of the same link differs
depending on whether it was typed or loaded.

## ED-8. Shift-Enter does not insert a hard break

**Where:** no keymap binds `Shift-Enter` (nor `Mod-Enter`) to `hard_break`
(`engine/editor-engine.ts` keymap stack: list keymap + `baseKeymap`). The schema
has `hard_break` and the markdown serializer writes it (`\` + newline), but the
key press is swallowed — nothing is inserted.

**Repro:** caret mid-paragraph, press Shift+Enter → no `<br>`, no split.

**Suggested fix:** add a `hard-break` command (`keys: ['Shift-Enter', 'Mod-Enter']`)
that `replaceSelectionWith(schema.nodes.hard_break.create())` (the standard
prosemirror-example-setup binding, `chainCommands(exitCode, …)`).
Pinned by `e2e/formatting.spec.ts` (test.fail).

## ~~ED-9. A plugin set that fails to assemble destroys the editor~~ — FIXED (Unreleased)

**Fixed:** `#rebuildEngine()` constructs the new engine *before* tearing the old
one down; a throw (assembly, or a plugin `setup()` — the engine then destroys its
half-built view) leaves the previous engine, content, undo history and `plugins`
value in place, and the error still reaches the caller. Pinned by
`e2e/plugins.spec.ts`. Side effect: on a successful swap the new set's `setup()`
now runs before the old set's `destroy()`.

**Where:** `src/web-component.ts` `set plugins()` → `#rebuildEngine()` tears the
old engine down *before* building the new one. When the new set throws at
assembly (e.g. a node without a markdown serializer — the documented contract),
the error reaches the caller but the element is left with no engine: the surface
is gone and `getValue()` returns `''` (content lost).

**Suggested fix:** build the new engine first (or catch, then rebuild on the
previous plugin set with the snapshot) and only tear the old one down on success.
Pinned by `e2e/plugins.spec.ts` (test.fail).

## ED-10. (UX, no test) The selection toolbar covers the static toolbar on the first line

**Where:** `src/ui/selection-toolbar.ts` — the floating bar is placed above the
selection; when the selection is on the editor's first line it sits on top of the
editor's own static toolbar (top edge) and intercepts its clicks (seen in
`e2e/pipelines.spec.ts` before the fixture got spacer lines). floating-ui `flip`
only considers the viewport, not the toolbar.

**Suggested fix:** pass the static toolbar as a collision boundary / use
`placement: 'bottom'` fallback when it would overlap the toolbar zone.

## ED-11. ~~(Question, core) Invalid enum attributes fall back silently~~ — RESOLVED in core

Core now warns on a rejected attribute value and keeps the previous value (the
default in markup), the same rule as the property path; `e2e/inputs.spec.ts`
asserts the four warnings. Original note:

The e2e plan expected `mode="bogus"` → default **+ warn**. Core's `toEnum`
(`web-components-core/src/inputs/converters.ts`) returns the default on the
attribute path without any warning; only invalid *property* assignments warn
(`rejected invalid value for property …`). Not an editor bug — the editor uses
core converters as-is. `e2e/inputs.spec.ts` pins the current (silent) behaviour;
if core starts warning on invalid attributes, flip that assertion.
