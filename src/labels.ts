import { createLabels, formatLabel as formatCoreLabel, type TranslateCallback } from '@keenmate/web-components-core/locale';

/**
 * UI strings (rulebook D-NC-24, core `/locale` SPEC §12.24): one `labels` object
 * per element — a PARTIAL map of keys to strings with `{name}` placeholders —
 * over built-in English defaults. Keys are flat `<elementType>.<name>`
 * (`buttons.ok`, `tooltips.bold`); the full key is `km-editor.<key>`. Resolution
 * per key (core `createLabels`): the element's `labels` (short or full key) → the
 * page-wide flat dictionary `window.components.locale.labels['km-editor.<key>']`
 * → the built-in English default; then the element's own `translateCallback`, the page's
 * `window.components.locale.translateCallback` (ICU / i18next; `null` = not mine → next), or the `{name}`
 * replacement. A key the instance `labels` set is never sent to a callback. Labels are TEXT (`textContent` /
 * attributes) — never HTML.
 *
 * Keys:
 * - **Command items** derive `<name>` from the command id, camel-cased
 *   (`insert-link` → `insertLink`, `image:browser:pick` → `imageBrowserPick`), and
 *   the element type from where the text is shown: `buttons.<name>` (a toolbar
 *   button showing its text — no icon; that text names it, no `aria-label`), `ariaLabels.<name>` (an icon toolbar
 *   button's accessible name), `menuItems.<name>` (the context-menu entry),
 *   `tooltips.<name>` (its tooltip). The English default is the command's own
 *   `text` / `tooltip`, so a plugin command is translatable without registering anything.
 * - **Toolbar groups**: `ariaLabels.<camelCase group id>Group` — the group's accessible name.
 * - The named keys in {@link DEFAULT_LABELS} (status items, prompts, picker texts).
 */

/** Built-in English strings for the non-command keys. */
export const DEFAULT_LABELS = {
  /** Shown (as text) while the document is empty, like a native `placeholder`. `''` = none. */
  'placeholders.document': '',
  /** Status bar: word count. */
  'labels.words': 'Words: {count}',
  /** Status bar: character count. */
  'labels.chars': 'Chars: {count}',
  /** The editing surface's accessible name (`role="textbox"`) when the element has none of its own
   * (`aria-label` / `aria-labelledby` / a `<label for>`). */
  'ariaLabels.editor': 'Rich text editor',
  /** Toolbar group accessible names (`ariaLabels.<groupId>Group`). */
  'ariaLabels.formatGroup': 'Format',
  'ariaLabels.blockGroup': 'Block',
  'ariaLabels.listGroup': 'Lists',
  'ariaLabels.insertGroup': 'Insert',
  'ariaLabels.historyGroup': 'History',
  'ariaLabels.viewGroup': 'View',
  'ariaLabels.linkGroup': 'Link',
  'ariaLabels.imageGroup': 'Image',
  'ariaLabels.tableGroup': 'Table',
  'ariaLabels.imageBrowserGroup': 'Cloud image',
  /** Prompt / confirmation dialogs (core `/dialog`): the buttons. The ✕ takes `ariaLabels.close`. */
  'buttons.ok': 'OK',
  'buttons.cancel': 'Cancel',
  /** `insert-link` prompt (the dialog title). */
  'headers.linkUrl': 'Enter link URL',
  /** `insert-image` prompts (the dialog titles). */
  'headers.imageUrl': 'Enter image URL',
  'headers.imageAlt': 'Enter alt text (optional)',
  /** `insert-code-block` / `change-code-language` prompts (the dialog titles; `{languages}` = the list). */
  'headers.codeLanguage': 'Enter language ({languages})',
  'headers.codeLanguageChange': 'Change language ({languages})',
  /** Cloud-image plugin (`image:browser:pick`): the icon toolbar button's name, its tooltip, the menu item, the picker request. */
  'ariaLabels.cloudImage': 'Cloud image',
  'tooltips.cloudImage': 'Insert image from the cloud',
  'menuItems.cloudImage': 'Insert cloud image…',
  'headers.cloudImagePicker': 'Choose a cloud image',
  'messages.cloudImagePicker': 'Pick an image to insert.',
  /** Validation message while a throwing `getValueFormatCallback` keeps the field invalid. */
  'errors.valueFormat': 'The value could not be formatted.',
  /** Accessible label (`aria-label`) of the pending loader shown while a deferred pipeline runs. */
  'ariaLabels.loading': 'Loading…',
  /** Split view: the output tabs. */
  'buttons.markdownTab': 'Markdown',
  'buttons.htmlTab': 'HTML',
  'buttons.jsonTab': 'JSON',
  /** Screen-reader announcements (core `announce()`, the page's polite live region) when the view mode
   * switches with a `view-mode-change` event — not on a plain `viewMode` assignment. `''` silences one. */
  'ariaLabels.viewModeEdit': 'Edit view',
  'ariaLabels.viewModeSplit': 'Split view',
  'ariaLabels.viewModePreview': 'Preview',
  'ariaLabels.viewModeInline': 'Inline view',
  /** Split view: the output tab list's accessible name. */
  'ariaLabels.outputTabs': 'Output format',
  /** Context menu as a sheet / drawer (`menu-presentation`): the submenu back button + the ✕ close button
   * (also the ✕ of the prompt / confirmation dialogs). */
  'buttons.back': 'Back',
  'ariaLabels.close': 'Close',
} as const;

/** A built-in non-command label key. */
export type EditorLabelKey = keyof typeof DEFAULT_LABELS;

/**
 * The element's `labels`: any subset of the built-in keys, plus derived command
 * (`buttons.viewEdit`, `ariaLabels.bold`, `menuItems.bold`, `tooltips.bold`, …) and group
 * (`ariaLabels.formatGroup`, …) keys — short, or full (`km-editor.tooltips.bold`).
 */
export type EditorLabels = Partial<Record<EditorLabelKey, string>> & Record<string, string | undefined>;

/** Placeholder values for a label template (`{count}`, `{languages}`, …). */
export type LabelParams = Record<string, string | number>;

/**
 * Resolve a label: `(key, params?, fallback?, twins?) => string`. The `fallback` is the
 * English default for keys outside {@link DEFAULT_LABELS} (command / group texts). `twins` = the English
 * defaults of the same element's other derived keys (`{ 'tooltips.bold': '' }`): an `ariaLabels.x` /
 * `tooltips.x` nobody set takes a customized twin with the same `<name>` (core `/locale`), and a derived key
 * counts as a twin only for the call that names it.
 */
export type LabelResolver = (key: string, params?: LabelParams, fallback?: string, twins?: Record<string, string>) => string;

/** `'insert-link'` → `'insertLink'`, `'image:browser:pick'` → `'imageBrowserPick'`. */
export function labelKey(id: string): string {
  return id.replace(/[-:_\s]+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** Fill `{name}` placeholders; an unknown placeholder is left as written (core `/locale` `formatLabel`). */
export function formatLabel(template: string, params?: LabelParams): string {
  return formatCoreLabel(template, params);
}

/** The component name — the prefix of the full keys (`km-editor.buttons.ok`) in `window.components.locale.labels`. */
const TAG = 'km-editor';

/**
 * Build the one label-resolving function over core `/locale` `createLabels`: instance `labels` → the element's own
 * `translateCallback` (`host.translateCallback`, or `getTranslateCallback` when given) → the page-wide
 * `window.components.locale.translateCallback` (`null` = not mine; a throw is logged → next) → page-wide labels →
 * built-in English → `fallback` (the English text of a command / group key) → the key itself. A standalone engine
 * passes `host: null` (core resolves the same way, with `tag: 'km-editor'` and the engine's own `translateCallback`
 * option as `getTranslateCallback`). `getLocale` = the `locale` input / engine option: a NUMBER param (`{count}`) is
 * shown formatted for it (unset → the page-wide `window.components.locale.locale` → the browser), and it is the
 * callbacks' `ctx.locale`.
 */
export function createLabelResolver(
  getLabels: () => EditorLabels | null | undefined,
  host?: Element | null,
  getTranslateCallback?: () => TranslateCallback | null | undefined,
  getLocale?: () => string | null | undefined,
): LabelResolver {
  // Derived keys (commands, groups) have no built-in default: the caller's fallback is theirs (per call).
  const defaults: Record<string, string> = { ...DEFAULT_LABELS };
  const labels = createLabels<Record<string, string>>(host ?? null, defaults, () => getLabels() as Record<string, string> | null, {
    tag: TAG,
    ...(getTranslateCallback ? { getTranslateCallback } : {}),
    ...(getLocale ? { getLocale } : {}),
  });
  const isBuiltIn = (key: string): boolean => Object.prototype.hasOwnProperty.call(DEFAULT_LABELS, key);
  return (key, params, fallback, twins) => {
    // Derived keys are registered only for this call: whether a twin exists must not depend on what
    // rendered before.
    const derived = [key, ...Object.keys(twins ?? {})].filter((k) => !isBuiltIn(k));
    for (const k of derived) defaults[k] = k === key ? (fallback ?? key) : twins![k];
    try {
      return labels.text(key, params);
    } finally {
      for (const k of derived) delete defaults[k];
    }
  };
}
