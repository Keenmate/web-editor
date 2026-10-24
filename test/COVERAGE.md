# E2E Test Coverage Checklist

Tracks which features of `<km-editor>` have end-to-end coverage in `e2e/`. Each
row is one user-observable feature. Status legend:

- `✗` — no coverage
- `△` — partial coverage (some paths)
- `✓` — covered
- `F` — covered by a `test.fail` row pinning the correct behaviour of an open bug (see `test/NOTES.md`)

**Spec** points at the file under `e2e/`, **Fixture** at the dedicated page under
`test/` (behaviour specs hit fixtures only; `examples.spec.ts` alone loads the
example pages). Shared harness: `e2e/fixtures.ts` (pageerror guard + native
dialog stub), `e2e/helpers.ts`.

---

## 1. Content I/O

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `value` attribute renders a ProseMirror document | ✓ | `smoke.spec.ts` | `fixture.html` |
| Typing updates `getValue()` + fires `change` | ✓ | `smoke.spec.ts` | `fixture.html` |
| md / html / json `value` render the same DOM | ✓ | `content.spec.ts` | `content.html` |
| `getHTML()` / `getMarkdown()` / `getJSON()` | ✓ | `content.spec.ts` | `content.html` |
| `setValue(v, fmt)` + `change` | ✓ | `content.spec.ts` | `content.html` |
| `value` reassignment rebuilds without re-firing `ready` | ✓ | `content.spec.ts` | `content.html` |
| `focus()` | ✓ | `content.spec.ts` | `content.html` |

## 2. Lifecycle

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| DOM move keeps content incl. tables (ED-1, fixed) | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| DOM move keeps undo history + selection (ED-2, fixed) | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| `plugins` reassignment preserves content (incl. tables) | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| `setValue()` before first connect (ED-3, fixed) | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| `format` change while detached (ED-4, fixed) | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| `ready` fires once per element lifetime | ✓ | `lifecycle.spec.ts`, `content.spec.ts` | `lifecycle.html`, `content.html` |
| `destroy()` | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| Detached editor: `getValue()` live; document listeners released, restored on reconnect | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| A move fires no `change` | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |

## 3. Interaction model

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `ready` / `change` twins + DOM events share the detail (controller/element non-enumerable) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| `el.controller` facade (no engine exposed) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Toolbar click → `onAction` → `action` event → command | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| `beforeActionCallback` veto (sync / async) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Custom action item (`onClick`, id) + ctx | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Context menu source + shortcuts | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Selection toolbar source | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Keyboard shortcuts bypass the action event | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| `interactionHost.request(ctx)` + `lock-change` | ✓ | `interaction-model.spec.ts` | `interaction.html` |

## 4. Editing

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Bold / italic / underline via toolbar + Mod-b/i/u, `aria-pressed`, md output, stored marks | ✓ | `formatting.spec.ts` | `formatting.html` |
| Inline code (md round-trip; no toolbar command exists) | ✓ | `formatting.spec.ts` | `formatting.html` |
| H1 / paragraph block type | ✓ | `formatting.spec.ts` | `formatting.html` |
| Shift-Enter hard break (ED-8) | F | `formatting.spec.ts` | `formatting.html` |
| Bullet / ordered list wrap, Enter split, Tab / Shift-Tab nest, md output | ✓ | `lists.spec.ts` | `lists.html` |
| Undo / redo buttons + Mod-z / Mod-y / Mod-Shift-z, enabled state | ✓ | `history.spec.ts` | `history.html` |
| Links: Mod-k / toolbar prompt, md `[t](u "title")`, toggle off, cancel | ✓ | `links.spec.ts` | `links.html` |
| Links: toolbar disabled on empty selection ✓; Mod-k alert (ED-5) F; title `''` vs `null` (ED-7) F | △ | `links.spec.ts` | `links.html` |
| Tables: insert (toolbar + menu), Tab nav, row/column ops, merge/split, header toggles, html/json round-trip, md raw-HTML | ✓ | `tables.spec.ts` | `tables.html` |
| Code block: prompt + language (cancel), Prism tokens, fenced md, html/json, change-code-language | ✓ | `code-block.spec.ts` | `code-block.html` |
| Images: prompt insert (cancel), md title / html / json round-trip ✓; src escaping (ED-6) F | △ | `images.spec.ts` | `images.html` |
| `image:browser:pick` + `imageBase64Plugin` (http → `data:`, as-is without it, cancel → no insert, lock released) | ✓ | `image-pipeline.spec.ts` | `image-pipeline.html` |
| HTML paste keeps marks, drops unknown nodes | ✗ | | |

## 5. Modes & states

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `mode` edit / split / preview / inline + `mode-change` | ✓ | `modes.spec.ts` | `modes.html` |
| Split output is live; output tabs switch format | ✓ | `modes.spec.ts` | `modes.html` |
| Preview is non-editable | ✓ | `modes.spec.ts` | `modes.html` |
| Mode switch keeps doc + selection + undo | ✓ | `modes.spec.ts` | `modes.html` |
| `readonly`: typing ignored, toolbar hidden, native context menu, removal re-enables | ✓ | `readonly.spec.ts` | `readonly.html` |
| Inline mode `anchor` placement + cleared on leaving inline (tracking on scroll / detach: P2) | △ | `modes.spec.ts` | `modes.html` |

## 6. Chrome

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `toolbar` edges (top/bottom/start/end/none) by bbox | ✗ | | |
| Toolbar active state follows the caret | ✗ | | |
| `statusbar` Words/Chars live + edges | ✗ | | |
| Selection toolbar show/hide rules | ✗ | | |
| Context menu dismiss + readonly | ✗ | | |

## 7. Plugins & pipelines

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Custom plugin button + serialization | ✗ | | |
| `plugins = []` hides link / image / table | ✗ | | |
| Pipeline stage before / after / replace on toolbar AND keymap; halt cancels | ✗ | | |

## 8. Infrastructure

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Examples hub + pages open without errors | ✓ | `examples.spec.ts` | (example pages) |
| `theme="dark"` + `--km-accent` | ✗ | | |
| Logging silent by default | ✗ | | |
| Global registration | ✗ | | |
| `mode="bogus"` → default + warn | ✗ | | |

## Not implemented (feature gaps — no tests)

- paste / copy / idle pipeline triggers (PIPELINES.md §4)
- form association (`name` + light-DOM hidden input per the form-submission convention)
- `placeholder` input
- blockquote / hr / strike (parser scope: `blockquote` / `hr` disabled in markdown-it, no schema nodes)
