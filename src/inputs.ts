/**
 * The `<km-editor>` input table (core `static inputs`), in its own module so the public
 * `EditorEngine` reads the SAME defaults the element seeds — rulebook C-CA-37: every engine option
 * the element also has takes the element's default, from one source (this table).
 * {@link ENGINE_DEFAULTS} is derived from the rows with the resolution core's element uses
 * (`resolveFromAttribute(def, null)`, "absent == default").
 */
import {
  toBool,
  toCustom,
  toEnum,
  toFunction,
  toObject,
  toText,
  resolveFromAttribute,
  type AttrReader,
  type InputDef,
  type RenderIconCallback,
} from '@keenmate/web-components-core';
import { createMenuPresentationInputs } from '@keenmate/web-components-core/menu';
import type { TranslateCallback } from '@keenmate/web-components-core/locale';
import type { InteractionHost } from './engine/pipeline/types';
import type { EditorLabels } from './labels';

const VIEW_MODES = ['edit', 'split', 'preview', 'inline'] as const;
const FORMATS = ['markdown', 'html', 'json'] as const;
const TOOLBARS = ['top', 'bottom', 'start', 'end', 'none'] as const;
const STATUSBARS = ['none', 'top', 'bottom', 'both'] as const;

const isLabels = (v: unknown): v is EditorLabels =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

const isInteractionHost = (v: unknown): v is InteractionHost | null =>
  v == null || (typeof v === 'object' && typeof (v as InteractionHost).request === 'function');

// ============================================================================
// INPUT TABLE — the whole <km-editor> public attribute/property surface.
// ============================================================================
export const INPUTS: readonly InputDef[] = [
  {
    configKey: 'defaultValue',
    attribute: 'value',
    converter: toText({ isNullable: true }),
    on: 'reinit',
    description:
      'Initial / default content, interpreted per `contentFormat` (like a native input’s `value` attribute ↔ `defaultValue`). Changing it replaces the document. The live content is the `value` PROPERTY.',
  },
  {
    configKey: 'contentFormat',
    attribute: 'content-format',
    converter: toEnum(FORMATS, { default: 'markdown' }),
    shouldReflect: true,
    on: 'update',
    description:
      "The format of the one document — the lens for content I/O (the `value` attribute and property, the `change` event): 'markdown' (default), 'html', or 'json'. Switching it re-reports the SAME document in the new format — it never rebuilds the document, and (like any assignment) fires no `change`.",
  },
  {
    configKey: 'name',
    attribute: 'name',
    converter: toText({ isNullable: true }),
    on: 'update',
    description:
      'Form field name. When set, a light-DOM `<input type="hidden" name="…">` child of the host carries the live content (serialized in `contentFormat`) and submits with the surrounding `<form>`; it is disabled (not submitted) while the editor is disabled, including by a `<fieldset disabled>`. A form reset restores `defaultValue` (attribute `value`) silently — no `change`, like a native `form.reset()`.',
  },
  {
    configKey: 'getValueFormatCallback',
    converter: toFunction(),
    default: null,
    on: 'update',
    description:
      'Property only. `(ctx) => string` — formats the value written into the hidden form input (`name`), e.g. to sanitize HTML. `ctx`: `{ value, contentFormat }` (the document in the active `contentFormat`) + `controller` / `element`. Affects ONLY the submitted form value: `el.value` and the `change` detail stay the document in `contentFormat`. Called on every sync of the form input (each change). A throw is logged (error), the hidden input gets an empty string, the host turns invalid (label `valueFormatError`) and `value-format-error` fires; the next successful format clears it.',
  },
  {
    configKey: 'viewMode',
    attribute: 'view-mode',
    converter: toEnum(VIEW_MODES, { default: 'edit' }),
    shouldReflect: true,
    on: 'update',
    description:
      "Presentation: 'edit' (default), 'split' (editor + live output), 'preview' (read-only render), or 'inline' (overlay chrome on a live-page element). `preview` forces read-only. Full layouts arrive in Phase 3; for now the view mode is stored and reflected. Assigning it (property or attribute) is silent — no `view-mode-change`; `setViewMode()` and the view-mode toolbar items fire it.",
  },
  {
    configKey: 'isReadonly',
    attribute: 'readonly',
    converter: toBool('presence'),
    shouldReflect: true,
    on: 'update',
    description:
      'Read-only: the content can’t change (no typing, toolbar hidden), but it stays focusable, selectable and copyable. `view-mode="preview"` also forces this on. Reflects to `readonly`.',
  },
  {
    configKey: 'isDisabled',
    attribute: 'disabled',
    converter: toBool('presence'),
    shouldReflect: true,
    on: 'update',
    description:
      'Disabled: no interaction at all — not editable, not focusable or selectable (the surface is `inert`), toolbar hidden. An ancestor `<fieldset disabled>` disables it too (core). Reflects to `disabled`, like a native control.',
  },
  {
    configKey: 'isRequired',
    attribute: 'required',
    converter: toBool('presence'),
    default: false,
    shouldReflect: true,
    on: 'update',
    description:
      'Required, like a native control: while the document has no content (no text after trimming whitespace and no image, table or other non-text node), the form validity is `valueMissing` (message `errors.required`) and the surrounding `<form>` refuses to submit. The host gets `aria-required` and `:state(required)` (core). Never missing while read-only or disabled. Reflects to `required`.',
  },
  {
    configKey: 'toolbar',
    attribute: 'toolbar',
    converter: toEnum(TOOLBARS, { default: 'top' }),
    shouldReflect: true,
    on: 'update',
    description:
      "Static toolbar edge: 'top' (default), 'bottom', 'start', or 'end' places the command toolbar flush against that side of the editor; 'none' hides it. The selection toolbar and context menu are always available while editing (independent of this).",
  },
  {
    configKey: 'statusbar',
    attribute: 'statusbar',
    converter: toEnum(STATUSBARS, { default: 'none' }),
    shouldReflect: true,
    on: 'update',
    description:
      "Status bar edge: 'none' (default), 'top', 'bottom', or 'both'. A dedicated strip of live indicators (word/char count, plus any plugin status items), hugging the editor body — separate from the toolbar zones and shown in read-only too. With 'both', items split across the two strips by their `bar` ('top'/'bottom', default 'bottom').",
  },
  {
    configKey: 'anchor',
    attribute: 'anchor',
    converter: toText({ isNullable: true }),
    on: 'update',
    description:
      'For `view-mode="inline"` only: a CSS selector for the live-page element the floating editor card anchors to (tracked via the core positioning primitive). Absent → the inline card renders in normal flow.',
  },
  {
    configKey: 'labels',
    attribute: 'labels',
    converter: toObject<EditorLabels>({ validate: isLabels }),
    on: 'update',
    description:
      'Every UI string (rulebook D-NC-24), a PARTIAL object over built-in English, `{ctx.*}` placeholders (a dynamic text passes its context as `{ ctx }`; `ctx.count` = the number its noun agrees with); an empty string = deliberately empty. Keys are flat `<elementType>.<name>`, short (`tooltips.bold`) or full (`km-editor.tooltips.bold`). `placeholders.document` (default empty = off) is shown while the document is empty. Command items (`<name>` = the camel-cased command id: `bold`, `insertLink`, `viewEdit`): `buttons.<name>` (a toolbar button with text), `ariaLabels.<name>` (an icon toolbar button), `menuItems.<name>` (the context menu), `tooltips.<name>`; toolbar groups `ariaLabels.<groupId>Group` (`ariaLabels.formatGroup`, …); status `labels.words` / `labels.chars` (`{ctx.count}`); prompt titles `headers.linkUrl`, `headers.imageUrl`, `headers.imageAlt`, `headers.codeLanguage` / `headers.codeLanguageChange` (`{ctx.languages}`, `{ctx.language}`); cloud image `ariaLabels.cloudImage`, `tooltips.cloudImage`, `menuItems.cloudImage`, `headers.cloudImagePicker`, `messages.cloudImagePicker`; context menu as a sheet / drawer `buttons.back`, `ariaLabels.close` (also the dialogs\' ✕); dialog buttons `buttons.ok`, `buttons.cancel`; split output tabs `buttons.markdownTab`, `buttons.htmlTab`, `buttons.jsonTab` and their tab list `ariaLabels.outputTabs`; `errors.valueFormat`; `errors.required` (a `required` editor left empty); the loader\'s `ariaLabels.loading`; the editing surface\'s name `ariaLabels.editor` (when the element has no `aria-labelledby` / `aria-label` / `<label for>`); screen-reader announcements of a view-mode switch `ariaLabels.viewModeEdit`, `ariaLabels.viewModeSplit`, `ariaLabels.viewModePreview`, `ariaLabels.viewModeInline` (an empty string silences one). Per key: these → the page-wide flat `window.components.locale.labels[\'km-editor.<key>\']` → English; the element\'s own `translateCallback`, then `window.components.locale.translateCallback`, translate the rest. Property (object) or JSON attribute (`labels=\'{"ariaLabels.bold":"Tučně"}\'`). Applies live (no rebuild).',
  },
  {
    configKey: 'locale',
    attribute: 'locale',
    converter: toText({ isNullable: true }),
    // The one default (`null` = unset) — `EditorEngine`'s `locale` option reads it through ENGINE_DEFAULTS.
    default: null,
    on: 'update',
    description:
      "BCP-47 locale for the numbers the editor formats — the status-bar word / char counts (`{ctx.count}` in `labels.words` / `labels.chars`: `1234` → `1,234` en / `1.234` de / `1 234` cs) — and the `locale` a `translateCallback` gets; or unset (`'auto'` / empty = unset): the page-wide `window.components.locale.locale`, else the browser language. UI strings are `labels`. Applies live (no rebuild).",
  },
  {
    configKey: 'translateCallback',
    converter: toFunction<TranslateCallback>(),
    default: null,
    on: 'update',
    description:
      "Property only. `({ component, key, template, params, locale }) => string | null | undefined` — this element's translation seam (core `/locale` `TranslateCallback`): asked for every label key this instance's `labels` did not set (`key` = the full `km-editor.<key>`, `template` = the page-wide / English text, `params.ctx` = the spot's context, raw), BEFORE the page-wide `window.components.locale.translateCallback`. Return the finished text; `null` / `undefined` = not mine (the page-wide one decides, then the `{ctx.*}` replacement). Applies live.",
  },
  {
    configKey: 'beforeActionCallback',
    converter: toFunction(),
    default: null,
    on: 'none',
    description:
      'Property only. `(detail) => false | void` (may be async) — runs first on every toolbar / selection-toolbar / context-menu activation, with the `action` event detail. Return `false` to cancel: no `onClick`, no `action` event, no command. Keyboard shortcuts do not pass through it.',
  },
  {
    configKey: 'renderIconCallback',
    converter: toFunction<RenderIconCallback>(),
    default: null,
    on: 'update',
    description:
      "Property only. `(name, ctx) => string | null | undefined` — draws an item `icon` string (toolbar / selection toolbar) this element's way: return markup, `''` = no icon, `null` / `undefined` = not mine (the page-wide `window.components.renderIconCallback` decides, then the built-in rules). Asked AFTER markup (a string starting with `<`) and the reserved built-in names (`check`, `close`, …, never sent to a hook), BEFORE the page-wide hook (core `renderIcon`, SPEC §12.33). `ctx` = `{ component: 'km-editor', element, prefix: 'we', item }`. Applies live.",
  },
  {
    configKey: 'renderLoadingCallback',
    converter: toFunction(),
    default: null,
    on: 'update',
    description:
      "Property only. Draws the pending loader (shown while a deferred pipeline's work — e.g. a cloud-image upload — outlives its loader threshold; not while a dialog waits for the user) instead of the default spinner: `({ component, context, containerElement, element, label }) => void | cleanup`, `context` = `'pipeline'`. Fill `containerElement` (it already has `role=\"status\"` + `aria-label` = label `loading`); a returned function runs when the loader is removed. Beats the page-wide `window.components.renderLoadingCallback` (core SPEC §12.14). Read each time the loader shows.",
  },
  {
    configKey: 'interactionHost',
    converter: toCustom<InteractionHost | null>(() => null, { validate: isInteractionHost }),
    default: null,
    on: 'update',
    description:
      'Property only. The modal bridge interactive pipeline stages call: `{ request(ctx) }`, `ctx` = the request (`kind`, `title`, `message`, `payload`) + `signal` + `controller` / `element`. Default: a core `/dialog` confirmation (OK / Cancel, closed when the run is superseded). Survives engine rebuilds (e.g. a `plugins` reassignment).',
  },
  {
    configKey: 'customStyles',
    attribute: 'custom-styles',
    converter: toText({ isNullable: true }),
    on: 'update',
    description:
      "CSS injected into the editor's shadow root (a `<style class=\"we-custom-styles\">` after the page-wide `window.components['km-editor'].customStyles` layer, so it overrides it). An `@import`ed font is also linked once in the document `<head>` (core). Raw CSS — never put untrusted input here.",
  },
  {
    configKey: 'getCustomStylesCallback',
    converter: toFunction(),
    on: 'update',
    description:
      'Property only. `(ctx) => string | null` — computes the instance CSS (wins over `customStyles`); `ctx` = `controller` / `element`. Called on every build and whenever `customStyles` / `getCustomStylesCallback` change.',
  },
  // `menu-presentation` / `menu-side` — the context menu's presentation (core `/menu`
  // standard rows, SPEC §12.13), read at every open.
  ...createMenuPresentationInputs(),
];

/** An element with no attributes — what the table's defaults resolve against. */
const NO_ATTRIBUTES: AttrReader = { getAttribute: () => null, hasAttribute: () => false };

/** The `<km-editor>` settings a standalone {@link EditorEngine} takes as options (same name, same meaning). */
const ENGINE_KEYS = ['isReadonly', 'labels', 'locale', 'translateCallback', 'interactionHost'] as const;

/** Defaults of the settings `<km-editor>` shares with `EditorEngine` (`configKey` → value). */
export interface EditorEngineDefaults {
  isReadonly: boolean;
  labels: EditorLabels | null;
  locale: string | null;
  translateCallback: TranslateCallback | null;
  interactionHost: InteractionHost | null;
}

/**
 * Every shared option's default as `<km-editor>` seeds it — `EditorEngine` fills an option it isn't given
 * (or given as `undefined`) from it, so a standalone engine behaves like a bare element (C-CA-37).
 */
export const ENGINE_DEFAULTS: Readonly<EditorEngineDefaults> = Object.freeze(
  Object.fromEntries(
    ENGINE_KEYS.map((key) => {
      const def = INPUTS.find((row) => row.configKey === key)!;
      return [key, resolveFromAttribute(def, null, NO_ATTRIBUTES).value ?? null] as const;
    }),
  ) as unknown as EditorEngineDefaults,
);
