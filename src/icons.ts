/**
 * The editor's own icons by NAME — inline SVG markup (1em, `currentColor`, hidden from assistive tech: the button's
 * `aria-label` names it). The built-in commands carry the NAME as their `icon` (`'bold'`); core `renderIcon` gets
 * this table as its `defaults` (toolbar, selection toolbar, context menu via `openMenu`'s `iconDefaults`), so the
 * page replaces one by name through `el.icons` / `window.components.icons` (`'km-editor.<name>'` before `'<name>'`)
 * or a `renderIconCallback` (SPEC §12.33, rulebook C-CA-42). The names avoid core's built-in icon names
 * (`BUILT_IN_ICON_NAMES`: those draw the theme glyph before `defaults` is asked) — the link icon is `insertLink`.
 */
const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;

export const EDITOR_ICONS = {
  bold: svg('<path d="M7 4h6.5a4 4 0 0 1 2.7 6.95A4.25 4.25 0 0 1 14 20H7V4zm3 3v3.5h3.5a1.75 1.75 0 0 0 0-3.5H10zm0 6.5V17h4a2.25 2.25 0 0 0 0-4.5h-4z"/>'),
  italic: svg('<path d="M10 4h8v3h-2.7l-3.1 10H15v3H7v-3h2.7l3.1-10H10V4z"/>'),
  underline: svg('<path d="M7 3h3v8a2 2 0 0 0 4 0V3h3v8a5 5 0 0 1-10 0V3zM5 19h14v2H5v-2z"/>'),
  heading: svg('<path d="M5 4h3v6.5h8V4h3v16h-3v-6.5H8V20H5V4z"/>'),
  paragraph: svg('<path d="M10 4h9v3h-2v13h-3V7h-1v13h-3v-7a4.5 4.5 0 0 1 0-9z"/>'),
  bulletList: svg('<circle cx="5" cy="6" r="1.75"/><circle cx="5" cy="12" r="1.75"/><circle cx="5" cy="18" r="1.75"/><path d="M9 5h11v2H9V5zm0 6h11v2H9v-2zm0 6h11v2H9v-2z"/>'),
  orderedList: svg('<path d="M4 4h2v5H4.8V5.3H4V4zm-.2 9.6L5.4 12H3.8v-1.2H7v1L5.4 13.8H7V15H3.8v-1.4zM3.8 17H7v4H3.8v-1.1h2V19.5h-1v-1h1v-.4h-2V17zM9 5h11v2H9V5zm0 6h11v2H9v-2zm0 6h11v2H9v-2z"/>'),
  codeBlock: svg('<path d="M8.6 6.6 3.2 12l5.4 5.4 1.4-1.4L6 12l4-4-1.4-1.4zm6.8 0L14 8l4 4-4 4 1.4 1.4 5.4-5.4-5.4-5.4z"/>'),
  undo: svg('<path d="M8 7V3L2 9l6 6v-4h6a4 4 0 0 1 0 8h-3v2h3a6 6 0 0 0 0-12H8z"/>'),
  redo: svg('<path d="M16 7V3l6 6-6 6v-4h-6a4 4 0 0 0 0 8h3v2h-3a6 6 0 0 1 0-12h6z"/>'),
  insertLink: svg('<path d="M10.6 13.4a1 1 0 0 0 1.4 0l4.6-4.6a3 3 0 0 0-4.2-4.2l-2 2 1.4 1.4 2-2a1 1 0 0 1 1.4 1.4L10.6 12a1 1 0 0 0 0 1.4zm2.8-2.8a1 1 0 0 0-1.4 0l-4.6 4.6a3 3 0 0 0 4.2 4.2l2-2-1.4-1.4-2 2a1 1 0 0 1-1.4-1.4l4.6-4.6a1 1 0 0 0 0-1.4z"/>'),
  image: svg('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v8.6l4-4 3 3 2-2 5 5V7H5zm11 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>'),
  cloud: svg('<path d="M7 19a5 5 0 0 1-.9-9.92A6 6 0 0 1 17.7 8.1 4.5 4.5 0 0 1 17.5 19H7z"/>'),
  table: svg('<path d="M3 4h18v16H3V4zm2 2v3h6V6H5zm8 0v3h6V6h-6zm-8 5v3h6v-3H5zm8 0v3h6v-3h-6zm-8 5v2h6v-2H5zm8 0v2h6v-2h-6z"/>'),
} as const;

/** An editor icon name — a key of {@link EDITOR_ICONS}. */
export type EditorIconName = keyof typeof EDITOR_ICONS;

/**
 * The `icons` input: icon overrides by name (an {@link EditorIconName}, or any name an item `icon` carries) →
 * an icon string (markup, a core built-in name, an icon-font class list, text).
 */
export type EditorIcons = Partial<Record<EditorIconName, string>> & Record<string, string>;
