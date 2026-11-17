import { createLabels, resolveLabel, formatLabel as formatCoreLabel } from '@keenmate/web-components-core/locale';

/**
 * UI strings (rulebook D-NC-24, core `/locale` SPEC §12.24): one `labels` object
 * per element — a PARTIAL map of keys to strings with `{name}` placeholders —
 * over built-in English defaults. Resolution per key (core `createLabels`): the
 * element's `labels` → the page-wide `window.components.locale.labels['km-editor']`
 * → the built-in English default; then the page's `formatLabelCallback` (ICU /
 * i18next) or the `{name}` replacement. Labels are TEXT (`textContent` /
 * attributes) — never HTML.
 *
 * Keys:
 * - **Command items** derive their key from the command id, camel-cased
 *   (`insert-link` → `insertLink`, `image:browser:pick` → `imageBrowserPick`):
 *   `<key>` is the item text (menu label / button `aria-label`), `<key>Tooltip`
 *   its tooltip. The English default is the command's own `text` / `tooltip`,
 *   so a plugin command is translatable without registering anything.
 * - **Toolbar groups**: `<camelCase group id>Group` — the group's accessible name.
 * - The named keys in {@link DEFAULT_LABELS} (status items, prompts, picker texts).
 */

/** Built-in English strings for the non-command keys. */
export const DEFAULT_LABELS = {
  /** Shown (as text) while the document is empty, like a native `placeholder`. `''` = none. */
  placeholder: '',
  /** Status bar: word count. */
  words: 'Words: {count}',
  /** Status bar: character count. */
  chars: 'Chars: {count}',
  /** Toolbar group accessible names (`<groupId>Group`). */
  formatGroup: 'Format',
  blockGroup: 'Block',
  listGroup: 'Lists',
  insertGroup: 'Insert',
  historyGroup: 'History',
  viewGroup: 'View',
  linkGroup: 'Link',
  imageGroup: 'Image',
  tableGroup: 'Table',
  imageBrowserGroup: 'Cloud image',
  /** Prompt / confirmation dialogs (core `/dialog`): the buttons. The ✕ takes `close`. */
  ok: 'OK',
  cancel: 'Cancel',
  /** `insert-link` prompt. */
  linkUrlPrompt: 'Enter link URL',
  /** `insert-image` prompts. */
  imageUrlPrompt: 'Enter image URL',
  imageAltPrompt: 'Enter alt text (optional)',
  /** `insert-code-block` / `change-code-language` prompts (`{languages}` = the list). */
  codeLanguagePrompt: 'Enter language ({languages})',
  codeLanguageChangePrompt: 'Change language ({languages})',
  /** Cloud-image plugin (`image:browser:pick`): toolbar button, its tooltip, the menu item, the picker request. */
  cloudImage: 'Cloud image',
  cloudImageTooltip: 'Insert image from the cloud',
  insertCloudImage: 'Insert cloud image…',
  cloudImagePickerTitle: 'Choose a cloud image',
  cloudImagePickerMessage: 'Pick an image to insert.',
  /** Validation message while a throwing `getValueFormatCallback` keeps the field invalid. */
  valueFormatError: 'The value could not be formatted.',
  /** Accessible label (`aria-label`) of the pending loader shown while a deferred pipeline runs. */
  loading: 'Loading…',
  /** Split view: the output tabs. */
  markdownTab: 'Markdown',
  htmlTab: 'HTML',
  jsonTab: 'JSON',
  /** Context menu as a sheet / drawer (`menu-presentation`): the submenu back button + the close button
   * (also the ✕ of the prompt / confirmation dialogs). */
  back: 'Back',
  close: 'Close',
} as const;

/** A built-in non-command label key. */
export type EditorLabelKey = keyof typeof DEFAULT_LABELS;

/**
 * The element's `labels`: any subset of the built-in keys, plus derived command
 * (`insertLink`, `insertLinkTooltip`, …) and group (`formatGroup`, …) keys.
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

/** The tag page-wide labels are keyed by (`window.components.locale.labels['km-editor']`). */
const TAG = 'km-editor';

/**
 * Build the one label-resolving function over core `/locale`: instance `labels` → page-wide labels → built-in
 * English → `fallback` (the English text of a command / group key) → the key itself. With `host` (the element)
 * the page's `formatLabelCallback` and `locale` apply too; a standalone engine resolves without them.
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
