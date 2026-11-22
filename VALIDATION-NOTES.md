# Validation notes — accepted deviations

This file records deviations from the BlissFramework component guidelines
(`C:\Git\BlissFramework\guidelines\web-components\`) that the team has
accepted for this component. `kmwc doctor` reads the `##` headings: every
`C-XX-N` check id in a heading turns that rulebook failure into an accepted
deviation (prose mentions don't count).

Two kinds of entries live here:

- **Permanent** — the rule does not apply (a name we don't own).
- **Temporary** — deferred to the web-editor normalization pass after rc25
  (user decision 2026-11-10, plan `_agent-progress/web-editor-theming-plan.md`).
  That pass fixes the code and **deletes these entries**; they are not
  architectural decisions and must not outlive it.

## C-NC-8 / C-CSS-7 — BEM class names (third-party permanent, own classes TEMPORARY)

The checks report 42 classes that don't follow BEM with prefix `.we`.

**Permanent — third-party class names (3).** We don't own these names; the
library's own CSS and DOM target them, so renaming is impossible:

- `.code-toolbar` — Prism's toolbar plugin wrapper (syntax-highlight plugin,
  `src/plugins/syntax-highlight.ts`).
- `.column-resize-handle`, `.resize-cursor` — rendered by
  `prosemirror-tables` (`columnResizing`) and styled by its CSS contract.

**Temporary — the editor's own classes (39).** Deferred to the web-editor
normalization pass after rc25 (user decision 2026-11-10):

- 34 single-dash `.we-*` blocks: `.we-body .we-cmd .we-command-bar .we-danger
  .we-floating .we-group .we-group-sep .we-group-view .we-inline .we-output
  .we-output-pre .we-output-tabs .we-overlays .we-pending .we-placeholder
  .we-preview .we-root .we-selection-toolbar .we-sep .we-split .we-status
  .we-status-end .we-status-item .we-status-start .we-statusbar .we-surface
  .we-tb-bottom .we-tb-end .we-tb-none .we-tb-start .we-tb-top .we-toolbar
  .we-toolbar-zone .we-tooltip` → `.we__*` / `.we--*` BEM.
- 5 bare state / content classes: `.active .selected .toggled .toolbar-label
  .table` → `.we__*--*` modifiers.

When the pass lands, this heading shrinks to the three third-party classes
(the check ids stay, since those three remain).

## C-CST-4 — service-to-service imports (TEMPORARY)

38 service→service imports (e.g. `ui/toolbar-zone` → `actions` /
`command-bar` / `items`). Deferred to the web-editor normalization pass after
rc25 (user decision 2026-11-10): the import-structure refactor. Delete this
entry when it lands.

## C-CST-5 — side-layer `types` imports `web-component` (TEMPORARY)

1 upward import: `src/engine/pipeline/types.ts:15`
`import type { EditorViewMode } from '../../web-component'` (type-only).
Deferred to the web-editor normalization pass after rc25 (user decision
2026-11-10): move `EditorViewMode` into a side-layer types file. Delete this
entry when it lands.

## Registry prefix `we` vs `km` (TEMPORARY — not suppressible)

`package.json#kmwc.prefix` is `we`; the devkit registry (`components.json`)
reserves `km` for web-editor. Deferred to the web-editor normalization pass
after rc25 (user decision 2026-11-10), together with the class renames above
(the prefix decides `.we__*` vs the registry's choice — settle which side
changes then). This is a `[registry]` doctor check, not a rulebook check, so
this file cannot downgrade it: `kmwc doctor` keeps reporting it as an error
until the pass resolves it.
