import { createLabels, resolveLabel, formatLabel as formatCoreLabel } from '@keenmate/web-components-core/locale';

/**
 * UI strings (rulebook D-NC-24, core `/locale` SPEC §12.24): one `labels` object
 * per element — a PARTIAL map of keys to strings with `{name}` placeholders —
 * over built-in English defaults. Keys are flat `<elementType>.<name>`
 * (`buttons.ok`, `tooltips.bold`); the full key is `km-editor.<key>`. Resolution
 * per key (core `createLabels`): the element's `labels` (short or full key) → the
 * page-wide flat dictionary `window.components.locale.labels['km-editor.<key>']`
 * → the built-in English default; then the page's `translateCallback` (ICU /
 * i18next) or the `{name}` replacement. Labels are TEXT (`textContent` /
 * attributes) — never HTML.
 *
 * Keys:
 * - **Command items** derive `<name>` from the command id, camel-cased
 *   (`insert-link` → `insertLink`, `image:browser:pick` → `imageBrowserPick`), and
 *   the element type from where the text is shown: `buttons.<name>` (a toolbar
 *   button showing its text — no icon), `ariaLabels.<name>` (an icon toolbar
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
 * Resolve a label: `(key, params?, fallback?) => string`. The `fallback` is the
 * English default for keys outside {@link DEFAULT_LABELS} (command / group texts).
 */
export type LabelResolver = (key: string, params?: LabelParams, fallback?: string) => string;

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
 * Build the one label-resolving function over core `/locale`: instance `labels` → page-wide labels → built-in
 * English → `fallback` (the English text of a command / group key) → the key itself. With `host` (the element)
 * the page's `translateCallback` and `locale` apply too; a standalone engine resolves without them.
 */
export function createLabelResolver(getLabels: () => EditorLabels | null | undefined, host?: Element | null): LabelResolver {
  // Derived keys (commands, groups) have no built-in default: the caller's fallback becomes theirs.
  const defaults: Record<string, string> = { ...DEFAULT_LABELS };
  const labels = host ? createLabels<Record<string, string>>(host, defaults, () => getLabels() as Record<string, string> | null, { tag: TAG }) : null;
  return (key, params, fallback) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LABELS, key)) defaults[key] = fallback ?? key;
    if (labels) return labels.text(key, params);
    return formatCoreLabel(resolveLabel(TAG, defaults, getLabels() as Record<string, string> | null, key), params);
  };
}
