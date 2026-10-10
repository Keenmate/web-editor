# Examples convention (KeenMate web components)

How to build the example/demo site for a `@keenmate/web-*` component. This is the
pattern used by `web-multiselect` and `web-editor`: **one hub page + one page per
feature**, all sharing a single stylesheet and a few drop-in, self-initializing JS
helpers. The golden rule is **no custom CSS** — you compose pages out of the shared
classes. The only CSS you ever write per page is for UI that is genuinely *part of
the example itself* (e.g. a modal your demo code renders).

Everything lives at the **package root** (next to `package.json` / `src/`), and is
served by the Vite dev server (`npm run dev`), which serves any root `*.html` and
registers the element via `/src/index.ts`. None of it is part of the library build.

---

## 1. Files to copy (verbatim) from an existing component

Copy these four from `web-editor` (or `web-multiselect`) into the new package root:

| File | What it is | Rework after copying |
|---|---|---|
| `examples-shared.css` | The entire visual system (page, header, cards, controls, outputs, notes, nav, copy-link). | Change the header comment; change the FOUC rule selector to your element (`web-foo:not(:defined) { display: none }`). |
| `examples-chapter-nav.js` | Floating "on this page / jump to example" navigator. Self-initializing, zero-config. | None. |
| `examples-copy-link.js` | Appends a "copy deep link" button to every section `<h2>`. Self-initializing. | None (optional: the canonical-origin comment). |
| `examples-controls-store.js` | Persists `.controls` switches to `localStorage` and re-applies them on load. | Change the `storeKey` namespace to `web-foo:examples:controls:${ns}`. |

They are **dependency-free and framework-free** by design — plain `<script
type="module">` drop-ins. `chapter-nav` lazy-loads Floating UI from a CDN with an
offline fallback; nothing else has deps.

---

## 2. The hub — `index.html`

A landing grid. It renders cards from a single **page registry** array, and feeds
that same array to the floating nav. To add an example later you add one object —
the card and the nav entry both appear automatically.

Structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Web Foo — Examples</title>
  <link rel="stylesheet" href="examples-shared.css" />
  <style>
    /* The hub is the ONE page that carries its own look (the gradient hero +
       card grid). This block is copied verbatim from web-editor/web-multiselect
       index.html — it styles .page-container/.header-card/.cards/.card-link/.badge
       /footer. Not component-specific; keep as-is. */
  </style>
</head>
<body>
  <div class="page-container">
    <header class="header-card">
      <h1>Web Foo</h1>
      <p class="subtitle">One-line description of the component.</p>
      <span class="version-badge" id="version-badge"></span>
    </header>
    <div class="cards" id="cards"></div>
    <footer>…Keenmate / GitHub links…</footer>
  </div>

  <script>
    // THE REGISTRY — add a page here and it shows up as a card + a nav entry.
    const pages = [
      { href: 'examples-basic.html', icon: '🧩', title: 'Basic Usage',
        description: '…', badge: 'New' /* optional */ },
      // …one object per examples-*.html…
    ]
    document.getElementById('cards').innerHTML = pages.map(p => `
      <a href="${p.href}" class="card-link">
        <div class="card-icon">${p.icon}</div>
        <h2 class="card-title">${p.title}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}</h2>
        <p class="card-description">${p.description}</p>
      </a>`).join('')
    // Feed the floating nav the same list (cross-page jump list on the hub).
    window.CHAPTER_NAV_ITEMS = pages.map(p => ({ label: p.title, href: p.href }))
  </script>

  <!-- Version badge from package.json (Vite gives JSON named exports). -->
  <script type="module">
    import { version } from './package.json'
    document.getElementById('version-badge').textContent = `v${version}`
  </script>

  <script type="module" src="examples-chapter-nav.js"></script>
</body>
</html>
```

Copy the hub's inline `<style>` block verbatim from `web-editor/index.html` — it is
the only page-specific styling in the whole site and it is not component-specific.

---

## 3. An example page — `examples-<feature>.html`

Every feature page is the **same skeleton**. Fill in cards; never add page CSS.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Basic Usage — Web Foo</title>
  <link rel="stylesheet" href="examples-shared.css" />
  <!-- NO <style> here unless it is for UI your example code renders (see §5). -->
</head>
<body>
  <div class="container">
    <header>
      <a href="index.html" class="back-link">← Back to Examples</a>
      <h1>Basic Usage</h1>
      <p class="subtitle">One line on what this page shows.</p>
    </header>

    <!-- One <div class="card"> per section. Its <h2> is the chapter title that
         feeds the floating nav and gets the copy-link button. -->
    <div class="card">
      <h2>BU01 · Selection mode</h2>
      <p>Prose describing the knobs. Use <code>inline code</code> for attributes.</p>

      <div class="controls">
        <label><input type="checkbox" id="bu01-foo" checked> <code>foo</code></label>
        <span><code>mode</code>:</span>
        <label><input type="radio" name="bu01-mode" value="a" checked> a</label>
        <label><input type="radio" name="bu01-mode" value="b"> b</label>
      </div>

      <div class="demo-area">
        <web-foo id="bu01" …attributes…></web-foo>
      </div>
    </div>

    <!-- more .card sections … -->
  </div>

  <!-- Register the element (Vite dev serves the TS source). -->
  <script type="module" src="/src/index.ts"></script>

  <!-- Page wiring: bind controls → the demo element(s). -->
  <script type="module">
    import { persistControls } from './examples-controls-store.js';

    function wire() {
      const el = document.getElementById('bu01');
      // radios:
      document.querySelectorAll('input[name="bu01-mode"]').forEach(r =>
        r.addEventListener('change', e => { if (e.target.checked) el.setAttribute('mode', e.target.value); }));
      // checkbox:
      document.getElementById('bu01-foo').addEventListener('change', e =>
        e.target.checked ? el.setAttribute('foo','') : el.removeAttribute('foo'));

      persistControls('basic');   // stable per-page key; restores + re-applies on load
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  </script>

  <!-- Shared helpers LAST (after the page's own wiring). -->
  <script type="module" src="examples-copy-link.js"></script>
  <script type="module" src="examples-chapter-nav.js"></script>
</body>
</html>
```

### Required structure the helpers rely on
- Wrap the page in **`<div class="container">`**. `chapter-nav` and `copy-link`
  scan `.container` for section `<h2>`s.
- Each section is **`.card`** (or `.example-section`) led by an **`<h2>`**. Two or
  more `<h2>`s → the floating "on this page" nav appears; fewer → it renders nothing.
- Put switches in **`.controls`**; `controls-store` persists every
  `input`/`select` inside `.controls` when you call `persistControls('<page-key>')`.
- The standard header is exactly: `<header>` → `.back-link` + `<h1>` + `.subtitle`.

---

## 4. The shared CSS vocabulary (use these — don't invent)

From `examples-shared.css`. If you reach for a `<style>` rule, first check this list.

- **Layout / header:** `.container`, `header`, `h1`, `.subtitle`, `.back-link`,
  `footer`.
- **Sections:** `.card` / `.example-section` (+ their `h2`, `h3`, `h3.subsection`,
  `p`), `.description`, `.demo-card` (a lighter nested card; tune
  `--demo-card-bg` / `--demo-card-border`).
- **Controls:** `.controls` (flex-wrap row), `.controls label`, `.toggle-label`
  (standalone switch).
- **Demo framing:** `.demo-area` (soft panel around a live instance),
  `.demo-label`; a `.demo-area > button` gets auto top-spacing.
- **Output:** `.output` + `.output-label` + `<pre>`; add `class="dark-output"` on
  `<body>` to turn `.output` panels into a dark console. Streaming logs:
  `.log-panel` / `.log-panel--dark` (cap height with `--log-max-height`).
- **Callouts:** `.note` / `.note.warning` / `.note-title`; `.muted` secondary text;
  `.mt-1` top spacing.
- **Code:** inline `<code>`; multiline `.code-block` (+ `.copy-button`).
- **Grids:** `.grid` / `.grid-2` / `.card-grid` (tune `--grid-min`, `--grid-gap`).
- **Tables:** `.reference-table` (+ `tr.is-highlight`).
- **Badges:** `.badge` / `.badge.new` (a NEW pill next to an `h2`).
- **Buttons:** bare `<button>` is primary; `.secondary` / `.btn-outline`.
- **Chrome (auto, don't touch):** `.chapter-nav*`, `.copy-link*`.

---

## 5. The "no custom CSS" rule — and its one exception

**Rule:** a page carries no `<style>` for page chrome, layout, colors, spacing,
typography, or component framing. All of that comes from `examples-shared.css`. If
something looks unstyled, you're missing a shared class, not a custom rule.

**Exception:** CSS for UI your *example code* creates at runtime and which has no
shared equivalent — e.g. a modal/picker your demo's own JS injects into the page.
That CSS is part of the example, so it lives in a small `<style>` on that page.
Keep it to layout/positioning; let shared styles handle buttons and inline code
inside it.

Examples of the exception done right (in `web-editor`): `examples-plugins.html`
keeps ~7 lines for the `.pick-*` cloud-picker modal its `InteractionHost` renders;
`examples-pipelines.html` keeps its `.pv-*` visualizer rules (the lanes/chips are
the thing being demonstrated). Everything else on those pages is shared classes.

---

## 6. The shared JS contracts (how they self-wire)

All three are plain, self-initializing modules — include the `<script>` and they
work. No init calls except `controls-store`.

- **`examples-chapter-nav.js`** — builds a floating tab at the right edge. Data
  source: `window.CHAPTER_NAV_ITEMS` (array of `{label, href}`) if present (the
  hub's cross-page list), else the page's own `.container > h2` sections (in-page
  scroll-spy jumps + a "Back to Examples" link). Needs ≥2 chapters or it renders
  nothing.
- **`examples-copy-link.js`** — appends a chain-link button inside every section
  `<h2>`; clicking copies a deep link to that section. It assigns the **same slug
  ids** as chapter-nav (the two are mirror implementations — keep them in sync if
  you ever edit the slug logic). Idempotent; order-independent.
- **`examples-controls-store.js`** — `import { persistControls } from
  './examples-controls-store.js'` and call `persistControls('<page-key>')` once at
  the **end** of your page wiring. It restores saved `.controls` values, fires
  `change`/`input` so your own listeners re-apply them, then saves on every change.
  Use a stable per-page key (`'basic'`, `'events'`, …).

---

## 7. Component gotcha — keep page chrome OUT of the shipped stylesheet

A KeenMate component ships one CSS (adopted into its shadow root, and usually also
imported for side-effect in `src/index.ts` → `dist/style.css`). That side-effect
import means **in the dev server, loading `/src/index.ts` injects the component's
CSS globally onto the example page.**

So the component's stylesheet must contain **only component-scoped rules**
(`:host`, `.your-prefix-*`, and content scoped under your root class). If it also
carries page-level selectors — `body`, `.container`, `h1`, `.subtitle`, or
dev-playground chrome — those **leak onto every example page** and override
`examples-shared.css` (symptom: the white gradient header renders dark). They also
ship in `dist/style.css` and restyle any *consumer's* page.

Fix (what we did in `web-editor`): move all page/playground chrome out of the
component CSS into a **dev-only stylesheet** (`src/dev/playground.css`) that only
the playground page links. Rule of thumb: if a selector isn't `:host` or your
component's own class prefix, it does not belong in the shipped CSS.

Corollary: example pages should **not** need to link the component's CSS to look
right — the element styles itself via its shadow root (`:host { display: block }`
etc.). Only a raw "playground/harness" page that renders light-DOM chrome links the
dev-only stylesheet.

---

## 8. Dev server

Nothing special: the component's Vite config (lib build) already serves any root
`*.html` in dev. `npm run dev` → open `/` (the hub). Pages register the element
with `<script type="module" src="/src/index.ts">` and import other shared JS by
relative path. None of these files are included in the library build or the `.d.ts`
output.

---

## 9. Checklist for the new component

1. Copy the four shared files; rework the FOUC selector + the `controls-store`
   namespace.
2. Audit the component's shipped CSS: move any page/playground chrome into
   `src/dev/playground.css` (§7). Verify `dist/style.css` has no `body`/`h1`/
   `.container`.
3. Create `index.html` (hub) with the page registry (§2).
4. For each feature, create `examples-<feature>.html` from the skeleton (§3) using
   only shared classes (§4), wiring controls + `persistControls('<key>')`, and
   including `copy-link` + `chapter-nav` last.
5. (Optional) a `examples-playground.html` raw harness that links both
   `examples-shared.css` and your `src/dev/playground.css`.
6. Verify: `npm run dev`, open the hub, click into each page — the header is the
   white gradient (not dark), the floating nav and copy-link appear on multi-section
   pages, and switches survive a reload.
```
