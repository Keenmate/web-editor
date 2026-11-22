# Examples — `<km-editor>`

Runnable pages for `@keenmate/web-editor` — `npm run dev` (hub at `index.html`) or the hosted
[example site](https://examples.web-editor.keenmate.dev). Each section carries a code (`BU01`, …) so a
test, an issue or a doc can point at it. The full API is in [usage.md](./usage.md).

| Page | What it shows |
| ---- | ------------- |
| [`examples-basic.html`](../examples-basic.html) | The shipped element, one input per section |
| [`examples-content.html`](../examples-content.html) | The first-party content plugins |
| [`examples-plugins.html`](../examples-plugins.html) | Plugin sets, id layering, the cloud-image pipeline |
| [`examples-pipelines.html`](../examples-pipelines.html) | The pipeline lab (run visualizer + design-stage models) |
| [`examples-localization.html`](../examples-localization.html) | `labels`, the page-wide dictionary, `translateCallback`, `locale` |
| [`examples-playground.html`](../examples-playground.html) | A raw-engine debug harness |

## Sections

**Basic usage** — `examples-basic.html`

- **BU01 · View Mode & Editing** — `view-mode` `edit` / `split` / `preview` / `inline` on one document; `readonly`.
- **BU02 · I/O Format Lens** — `content-format` re-reports the same document as Markdown / HTML / JSON (no rebuild).
- **BU03 · Toolbar & Status Bar** — `toolbar` edge (`top` / `bottom` / `start` / `end` / `none`), `statusbar` strips.
- **BU04 · Theme** — dark mode from the page signal, per-instance `data-theme`.
- **BU05 · Declarative Setup** — attributes only, no JavaScript.
- **BU06 · Custom CSS** — page-wide `window.components['km-editor'].customStyles` + instance `custom-styles`.
- **BU07 · Disabled / Readonly States** — `disabled` (inert) vs `readonly` (focusable, selectable).
- **BU08 · Labels & Page-wide Locale** — instance `labels` vs `window.components.locale.labels`.
- **BU09 · Required + Validation** — `required` in a `<form>`: the native bubble on submit, a live `validity` / `validationMessage` line.

**Rich content** — `examples-content.html`

- **RC01 · Links** — the `link` plugin: mark, `insert-link` (<kbd>Mod-K</kbd>), toolbar button.
- **RC02 · Images** — the `image` plugin: inline image node, `![alt](src)` serialization.
- **RC03 · Tables** — the `tables` plugin; tables export as a raw-HTML GFM fallback.
- **RC04 · Code & Syntax Highlighting** — `code-highlight`: language attribute, live Prism highlighting, fenced output.

**Plugins & pipelines** — `examples-plugins.html`

- **PP01 · Cloud-Image Pipeline** — `imageBrowserPlugin`: a deferred, locking pick → upload → insert pipeline; base64 plugin swap.
- **PP02 · Override / Remove by Id** — `removeToolbarGroups` + a custom `statusItems` entry from an inline plugin.
- **PP03 · Cloud Image → Crop → Insert** — a second plugin splices an interactive crop stage; `interactionHost`, `lock-change`.

**Pipeline lab** — `examples-pipelines.html`

- **PV01 · Run Visualizer** — one lane per pipeline; each stage chip shows its state live.
- **PV02 · Phases & Config Cell** — design-stage prototype of the phase-based assembly (see `PIPELINES.md`).
- **PV03 · Image Pipeline Use Cases** — design-stage cloud-image use cases on real `Blob`s.

**Localization** — `examples-localization.html`

- **LO01 · Instance `labels`** — short and full keys on one element.
- **LO02 · Page-wide dictionary** — one flat `window.components.locale.labels` translates every editor.
- **LO03 · `translateCallback`** — an app's own i18n answers the keys.
- **LO04 · Screen-reader name / tooltip follow** — an unset `ariaLabels.x` / `tooltips.x` follows its customized twin.
- **LO05 · `locale` + formatting** — the status-bar counts formatted per locale.
- **LO06 · `shouldEscapeLabels`** — not applicable: every editor label is text.

**Playground** — `examples-playground.html`

- **PG01 · Raw engine harness** — the engine with a hand-made floating toolbar and a debug panel.

## Worked examples

### A form field that submits sanitized HTML

The editor submits through a light-DOM hidden input; `getValueFormatCallback` changes only the
submitted value (`el.value` and the `change` detail stay the document). If it throws, the field turns
invalid and the form refuses to submit (see [Forms](./usage.md#forms)).

```html
<form id="post">
  <km-editor name="body" content-format="html"
             labels='{"placeholders.document":"Write your post…"}'></km-editor>
  <button>Publish</button>
</form>

<script type="module">
  import '@keenmate/web-editor';
  import DOMPurify from 'dompurify';

  const editor = document.querySelector('#post km-editor');
  editor.getValueFormatCallback = ({ value }) => DOMPurify.sanitize(value);
  editor.onValueFormatError = ({ error }) => console.error('not submitted', error);
</script>
```

### A trimmed toolbar with your own item

Plugins are keyed by `id`: a plugin can drop a built-in group and add its own (PP02). Custom items are
core action items (`action: 'custom'` + `id` + `onClick`); the `action` event follows every activation.

```js
import { definePlugin, defaultPlugins } from '@keenmate/web-editor';

const savePlugin = definePlugin({
  name: 'save',
  removeToolbarGroups: ['list'],
  toolbarGroups: [{
    id: 'save',
    text: 'Save',
    items: [{
      action: 'custom', id: 'save', text: 'Save', icon: 'check',
      getIsDisabledCallback: ({ state }) => state.doc.textContent.length === 0,
      onClick: ({ controller }) => api.save(controller.getMarkdown()),
    }],
  }],
  statusItems: [{ id: 'saved', align: 'end', render: () => 'Autosave on' }],
});

const editor = document.querySelector('km-editor');
editor.plugins = [...defaultPlugins(), savePlugin]; // rebuilds the engine, keeps the content
editor.addEventListener('action', (e) => console.log('activated', e.detail.id, e.detail.source));
```

### A read-only preview that follows a live editor

`view-mode="preview"` forces read-only; `change` carries the document in the active `contentFormat`.

```html
<km-editor id="source" content-format="markdown" statusbar="bottom"></km-editor>
<km-editor id="mirror" view-mode="preview" toolbar="none" content-format="markdown"></km-editor>

<script type="module">
  import '@keenmate/web-editor';
  const source = document.getElementById('source');
  const mirror = document.getElementById('mirror');
  source.onChange = ({ value }) => { mirror.value = value; }; // silent, like input.value
</script>
```
