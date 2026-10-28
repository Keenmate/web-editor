/**
 * UI strings (rulebook D-NC-24): one `labels` object per element — a PARTIAL
 * map of keys to strings with `{name}` placeholders — over built-in English
 * defaults. Resolution per key: the element's `labels` → (core `/locale`
 * page-wide labels, once core ships it) → the built-in English default.
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
  linkGroup: 'Link',
  imageGroup: 'Image',
  tableGroup: 'Table',
  imageBrowserGroup: 'Cloud image',
  /** `insert-link` prompt. */
  linkUrlPrompt: 'Enter link URL:',
  /** `insert-image` prompts. */
  imageUrlPrompt: 'Enter image URL:',
  imageAltPrompt: 'Enter alt text (optional):',
  /** `insert-code-block` / `change-code-language` prompts (`{languages}` = the list). */
  codeLanguagePrompt: 'Enter language ({languages}):',
  codeLanguageChangePrompt: 'Change language ({languages}):',
  /** Cloud-image plugin (`image:browser:pick`): toolbar button, its tooltip, the menu item, the picker request. */
  cloudImage: 'Cloud image',
  cloudImageTooltip: 'Insert image from the cloud',
  insertCloudImage: 'Insert cloud image…',
  cloudImagePickerTitle: 'Choose a cloud image',
  cloudImagePickerMessage: 'Pick an image to insert.',
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

/** Fill `{name}` placeholders; an unknown placeholder is left as written. */
export function formatLabel(template: string, params?: LabelParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/**
 * Build the one label-resolving function (the seam core `/locale` will plug
 * into): instance `labels` → built-in English → `fallback` → the key itself.
 */
export function createLabelResolver(getLabels: () => EditorLabels | null | undefined): LabelResolver {
  return (key, params, fallback) => {
    const own = getLabels()?.[key];
    const template =
      typeof own === 'string' ? own : ((DEFAULT_LABELS as Record<string, string>)[key] ?? fallback ?? key);
    return formatLabel(template, params);
  };
}
