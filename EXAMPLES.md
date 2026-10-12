# Examples convention — moved to the devkit

This file used to describe the Keenmate examples convention: a hub page plus one
page per feature, sharing `examples-shared.css` and a few self-initializing JS
helpers that every component **copied** from here. Those copies drifted apart, so
the convention now lives in **[`@keenmate/web-components-devkit`](https://github.com/keenmate/web-components)**
— the shared stylesheet, chapter nav, copy-link buttons, controls persistence,
theme switch and version badge are injected into every example page by its Vite
plugin, and pages are fragments (`<meta name="kmwc:title">`, no copied head or
header).

- How to write example pages: the devkit README → "Examples kit" / "Fragment pages".
- Migrating a component: the devkit README → "Migrating a component".
- Never copy `examples-shared.css`, `examples-chapter-nav.js`,
  `examples-copy-link.js` or `examples-controls-store.js` into a repo —
  `kmwc doctor` reports them as errors.

The previous text is in this repo's git history (before the devkit migration).
