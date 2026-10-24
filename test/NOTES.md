# Test infrastructure notes

Running notes from building the e2e harness (`e2e/`, fixtures in `test/*.html`).
Each entry is something in the **component** that looks like a bug, friction
point, or design question — not a problem with the tests. IDs `ED-n` come from
the cross-repo plan (`web-components-core/docs/e2e-coverage-plan.md`, WP-ED).
A spec that pins the correct behaviour of an open entry is marked
`test.fail(true, 'NOTES.md ED-n')`.

---

## ED-1. Tables lost on DOM move / `plugins` reassignment

**Where:** `src/web-component.ts` `disconnect()` + `set plugins()` snapshot live
content as **markdown** (`engine.serialize(format)`); the table plugin's markdown
serializer writes raw HTML (`plugins/tables.ts`), but the markdown parser runs
with `html: false` (`engine/serialization/markdown.ts`), so the rebuilt engine
gets the table as literal text / drops it.

**Repro:** `el.setValue('<table>…</table>', 'html')`, then
`parent.appendChild(el)` (move) → the table is gone.

**Suggested fix:** keep the engine alive across disconnect/connect (D1) and
snapshot `plugins` reassignment via `getJSON()`.

## ED-2. Undo history / selection lost on every DOM move

**Where:** `src/web-component.ts` `disconnect()` tears the engine down, `connect()`
rebuilds it. Violates core's build-once + activate/deactivate model (decision D1:
a move must keep content, tables, undo and selection).

## ED-3. `setValue()` before first connect is discarded

**Where:** `setValue()` stores `#content`, but the first-connect `reinit()`
overwrites `#content` from `config.value`.

## ED-4. `format` changed while detached parses the snapshot in the wrong format

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
