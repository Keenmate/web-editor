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
| Typing updates `value` + fires `change` | ✓ | `smoke.spec.ts` | `fixture.html` |
| md / html / json `value` render the same DOM | ✓ | `content.spec.ts` | `content.html` |
| `getHTML()` / `getMarkdown()` / `getJSON()` | ✓ | `content.spec.ts` | `content.html` |
| `setValue(v, fmt)` + `change` | ✓ | `content.spec.ts` | `content.html` |
| `value` property / attribute replace the document without re-firing `ready`; `value` before upgrade | ✓ | `content.spec.ts` | `content.html` |
| `focus()` | ✓ | `content.spec.ts` | `content.html` |
| Form: `name` → light-DOM hidden input (live value in `contentFormat`, one entry) | ✓ | `form.spec.ts` | `form.html` |
| Form reset → `defaultValue`; `<fieldset disabled>` excludes it | ✓ | `form.spec.ts` | `form.html` |
| Form: `getValueFormatCallback` formats the submitted value only (`el.value` unchanged); a throw submits `''`, marks the host invalid (submit blocked, `invalid` fires; `novalidate` submits `''`), fires `value-format-error`; a working callback recovers | ✓ | `form.spec.ts`, unit `web-component.test.ts` | `form.html` |
| Empty document by default; `labels.placeholder` while empty | ✓ | `form.spec.ts` | `form.html` |

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
| Detached editor: `value` live; document listeners released, restored on reconnect | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |
| A move fires no `change` | ✓ | `lifecycle.spec.ts` | `lifecycle.html` |

## 3. Interaction model

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `ready` / `change` twins + DOM events share the detail (controller/element non-enumerable) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| `el.controller` facade (no engine exposed) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
| Toolbar click → command → `onAction` → `action` event (after the fact) | ✓ | `interaction-model.spec.ts` | `interaction.html` |
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
| Shift-Enter hard break (ED-8, fixed) | ✓ | `formatting.spec.ts` | `formatting.html` |
| Bullet / ordered list wrap, Enter split, Tab / Shift-Tab nest, md output | ✓ | `lists.spec.ts` | `lists.html` |
| Undo / redo buttons + Mod-z / Mod-y / Mod-Shift-z, enabled state | ✓ | `history.spec.ts` | `history.html` |
| Links: Mod-k / toolbar prompt, md `[t](u "title")`, toggle off, cancel | ✓ | `links.spec.ts` | `links.html` |
| Links: toolbar disabled on empty selection; Mod-k on empty selection is a silent no-op (ED-5, fixed); created / parsed link JSON identical, title `null` (ED-7, fixed) | ✓ | `links.spec.ts` | `links.html` |
| Tables: insert (toolbar + menu), Tab nav, row/column ops, merge/split, header toggles, html/json round-trip, md raw-HTML | ✓ | `tables.spec.ts` | `tables.html` |
| Code block: prompt + language (cancel), Prism tokens, fenced md, html/json, change-code-language | ✓ | `code-block.spec.ts` | `code-block.html` |
| Images: prompt insert (cancel), md title / html / json round-trip; src with spaces / parentheses survives markdown (ED-6, fixed); inserted image title `null` like a parsed one | ✓ | `images.spec.ts` | `images.html` |
| `image:browser:pick` + `imageBase64Plugin` (http → `data:`, as-is without it, cancel → no insert, lock released) | ✓ | `image-pipeline.spec.ts` | `image-pipeline.html` |
| Paste: HTML keeps marks + blocks, drops unknown elements (keeps text, no script), plain text stays literal | ✓ | `paste.spec.ts` | `paste.html` |

## 5. Modes & states

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `view-mode` edit / split / preview / inline + `view-mode-change` | ✓ | `modes.spec.ts` | `modes.html` |
| Split output is live; output tabs switch format | ✓ | `modes.spec.ts` | `modes.html` |
| Preview is non-editable | ✓ | `modes.spec.ts` | `modes.html` |
| Mode switch keeps doc + selection + undo | ✓ | `modes.spec.ts` | `modes.html` |
| `readonly`: typing ignored, toolbar hidden, native context menu, removal re-enables | ✓ | `readonly.spec.ts` | `readonly.html` |
| Inline mode `anchor`: placement, scroll tracking, detach releases / reattach re-anchors, unmatched selector, re-target | ✓ | `inline-anchor.spec.ts`, `modes.spec.ts` | `inline-anchor.html`, `modes.html` |

## 6. Chrome

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| `toolbar` edges (top/bottom/start/end/none) by bbox; group order; titles with shortcuts | ✓ | `toolbar.spec.ts` | `toolbar.html` |
| Toolbar active state follows the caret; click keeps editor focus | ✓ | `toolbar.spec.ts`, `formatting.spec.ts` | `toolbar.html` |
| `statusbar` Words/Chars live, edges top/bottom/both (split by `bar`), none, read-only | ✓ | `statusbar.spec.ts` | `statusbar.html` |
| Selection toolbar show/hide rules (collapsed, code block, read-only, preview), items, DOM move | ✓ | `selection-toolbar.spec.ts` | `selection-toolbar.html` |
| Context menu at pointer, dismiss (Escape / outside / activation), readonly | ✓ | `context-menu.spec.ts` | `context-menu.html` |

## 7. Plugins & pipelines

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Custom plugin: mark + toolbar button + keybinding + md/html/json + status item; group order; `plugins` getter | ✓ | `plugins.spec.ts` | `plugins.html` |
| `plugins = []` drops link / image / table (toolbar, commands, menu, import); `removeToolbarGroups` | ✓ | `plugins.spec.ts` | `plugins.html` |
| Pipeline stage before / after / replace on toolbar AND keymap AND `runCommand`; halt cancels | ✓ | `pipelines.spec.ts` | `pipelines.html` |
| Serializer contract: node without markdown throws at assembly; a failed `plugins` swap (assembly or `setup()` throw) keeps the live editor, content, undo history and `plugins` (ED-9, fixed) | ✓ | `plugins.spec.ts` | `plugins.html` |

## 8. Infrastructure

| Feature | Status | Spec | Fixture |
| --- | :-: | --- | --- |
| Examples hub + pages open without errors | ✓ | `examples.spec.ts` | (example pages) |
| `theme="dark"` tokens + `--we-accent` on active buttons + live theme property | ✓ | `theming.spec.ts` | `theming.html` |
| Logging silent by default; global enable / disable (EDITOR:INIT) | ✓ | `logging.spec.ts` | `logging.html` |
| Global registration: define, `window.components` (version / config / getInstances), re-import | ✓ | `registration.spec.ts` | `registration.html` |
| Invalid enum attributes → default (silent, ED-11); invalid property rejected + warn; boolean `readonly` | ✓ | `inputs.spec.ts` | `inputs.html` |

## Not implemented (feature gaps — no tests)

- paste / copy / idle pipeline triggers (PIPELINES.md §4)
- form association (`name` + light-DOM hidden input per the form-submission convention)
- `placeholder` input
- blockquote / hr / strike (parser scope: `blockquote` / `hr` disabled in markdown-it, no schema nodes)
