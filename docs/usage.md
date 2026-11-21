# Usage — `<km-editor>`

The element's attributes, properties, events and methods are in the [README](../README.md#options) for now;
this page covers the headless engine.

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
the browser — the `{count}` numbers `engine.label()` formats), `translateCallback` (`null`; asked before the
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
