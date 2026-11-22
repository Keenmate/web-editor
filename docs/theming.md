# Theming — `<km-editor>`

The component is shadow-DOM scoped, so its styles don't leak and page styles don't
bleed in. Ship the stylesheet once:

```html
<link rel="stylesheet" href="@keenmate/web-editor/style.css" />
```

## Dark mode and variables

Dark mode follows the page. Every color is a `--we-*` variable chained to the shared
`--base-*` contract with `light-dark()` fallbacks, so the editor resolves whichever scheme its
host is in:

- **No signal** — the editor inherits the page's `color-scheme` (`html { color-scheme: light dark }`
  follows the OS).
- **Page signal** — `data-theme` / `data-bs-theme` / `.dark` / `.light` on `<html>` or `<body>`, a
  `theme-source` section, or core `setThemeMode()`: core mirrors it onto the host as
  `data-context-theme`.
- **Per instance** — `<km-editor data-theme="dark">` (or `"light"`) wins over the page.

The selection toolbar and the toolbar / status tooltips (core `createTooltip`: hover and keyboard focus,
`--we-tooltip-bg` / `--we-tooltip-color`) are dark in both modes (the shared tooltip tokens), and code blocks
stay dark in both (the syntax highlighting is Prism's dark theme). Re-theme with `--base-*` on
`:root` (every Keenmate component follows), or `--we-*` on the element:

```css
km-editor { --we-accent: #7c3aed; --we-min-height: 320px; }
```

All variables are listed in `component-variables.manifest.json`
(`import manifest from '@keenmate/web-editor/manifest'`).

## Custom CSS (shadow root)

Page CSS can't reach inside the shadow root; inject it instead
(core `createCustomStyles()`). Two layers, each a `<style>` in the shadow root, the instance one
last so it wins:

```js
// every <km-editor> on the page (one file, fetched once)
window.components['km-editor'].customStyles = "@import url('/css/editor-overrides.css');";
// or computed per instance (wins over the page-wide customStyles)
window.components['km-editor'].getCustomStylesCallback = ({ element }) =>
  element.classList.contains('notes') ? '.ProseMirror { font-family: Georgia, serif; }' : null;
```

```html
<!-- this editor only: attribute custom-styles / property customStyles, or getCustomStylesCallback(ctx) -->
<km-editor custom-styles=".ProseMirror { letter-spacing: .02em; }"></km-editor>
```

An `@import`ed font (`@font-face`) is also linked once in the document `<head>`, since Chromium
ignores `@font-face` inside a shadow root (`window.components.shouldHoistImports = false` turns
that off). Custom CSS is raw — never put untrusted input there.

## Prefix, disabled state, loader, motion

The editor's own classes and custom properties use the `we-` prefix (`--we-bg`,
`--we-border`, `--we-accent`, …). Disabled commands fade by `--we-disabled-opacity`
(default `var(--base-disabled-opacity, 0.65)`). Keyboard focus on a toolbar button, an output tab or the
output panel draws `--we-focus-outline` (default the suite's `--base-focused-outline`, `:focus-visible` only —
never on a mouse press); `--we-focus-outline-offset` moves it (default `1px` outside a button; the output panel draws it that far inside). While a deferred pipeline outlives its threshold a
loader shows in the body's top-end corner (`::part(loader)`, `role="status"`, label `loading`): the
shared Keenmate loader, drawn from `--we-loader-icon` / `--we-loader-rotate` / `--we-loader-duration`
/ `--we-loader-size` (each chained to `--base-loader-*`, so one page-level change restyles every
component's loader; it slows under reduced motion). For a richer loader set `renderLoadingCallback`
on the element or `window.components.renderLoadingCallback` for the page. Apart from that spinner
the editor has no transitions or animations of its own; the right-click menu's motion follows core's `--km-menu-*` / `--base-duration-*`
(`--base-duration-*: 0s` turns it off page-wide).

## Context menu

The right-click menu is the shared Keenmate menu
from `@keenmate/web-components-core` (`.km-menu*`, `::part(context-menu)`); restyle it
with the `--we-context-menu-*` properties on the element — `bg`, `text-color`,
`border`, `border-radius`, `shadow`, `min-width`, `padding`, `font-size`,
`item-padding`, `hover-bg`, `hover-color`, `toggled-color`, `shortcut-color`,
`danger-color`, `divider-color`, `disabled-opacity`, `z-index`.

Each menu value resolves, highest precedence first: **`--we-context-menu-*`** (this
editor) → **`--km-menu-*`** (every Keenmate menu on the page) → **`--base-*`** (theme)
→ core's default. The `--we-context-menu-*` properties are unset by default, so a
page-wide `--km-menu-*` reaches the editor's menu:

```css
:root { --km-menu-bg: #fffbe6; }                /* every menu on the page */
km-editor.notes { --we-context-menu-bg: #eef; } /* just this editor's menu */
```

The list of `--km-menu-*` variables ships in core's
`@keenmate/web-components-core/component-variables.manifest.json`.
