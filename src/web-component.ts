/**
 * `<km-editor>` — the custom element, built on `@keenmate/web-components-core`
 * (`BlissElement`). A thin shell over the headless {@link EditorEngine}: it owns
 * the shadow root, adopts the editor stylesheet, declares the public surface as a
 * core input/event table, and bridges engine events to outward CustomEvents.
 *
 * Reactivity (per input `on:`):
 *   - `reinit` — content source changed (`defaultValue`, attribute `value`) → rebuild the engine.
 *   - `update` — `viewMode` / `isReadonly` / `isDisabled` (via `disabledChanged()`) / `theme` / `contentFormat` / `interactionHost`
 *                → patch in place (toggle editable, reflect the attribute,
 *                re-report content, swap the modal bridge).
 *
 * The content model is ONE ProseMirror document (the engine's). `contentFormat` is the
 * serialization lens for I/O (the `value` input, `getValue()`, and the `change`
 * event detail) — switching it never rebuilds the document, only changes how its
 * content is read in and out. This is the single-model design from PLAN.md: no
 * second editing surface, no convertor round-trip.
 *
 * Interaction model (web-components-core `/actions`): toolbar / menu items are
 * core action items; every activation runs `beforeActionCallback` → the item's
 * `onClick` → the `action` event → the command. Every event detail and callback
 * ctx carries `controller` (`el.controller`, the public facade) and `element`.
 * The engine is internal — `el.controller` is the imperative API.
 *
 * `el.value` is the LIVE content (serialized in `contentFormat`; assigning replaces the
 * document). The `value` ATTRIBUTE is the initial / default content —
 * `el.defaultValue`, like a native input's `defaultValue`.
 */
import {
  BlissElement,
  toBool,
  toCustom,
  toEnum,
  toFunction,
  toObject,
  toText,
  adoptStyles,
  createCustomStyles,
  renderLoader,
  type CustomStylesCallback,
  type CustomStylesHandle,
  type EventDef,
  type InputDef,
  type RenderLoaderCallback,
  type ResponsiveCallback,
  type ResponsiveMap,
} from '@keenmate/web-components-core';
import type { Command } from 'prosemirror-state';
import { EditorEngine, type EditorEngineOptions } from './engine/editor-engine';
import { defaultPlugins } from './engine/default-plugins';
import { defaultInteractionHost } from './engine/pipeline/registry';
import type { InteractionHost } from './engine/pipeline/types';
import type { EditorPlugin } from './engine/plugin';
import type { SerializationFormat } from './engine/serialization';
import {
  createEditorController,
  type EditorController,
  type EditorComponentContext,
  type EditorEventMap,
  type EditorActionEventDetail,
  type ChangeEventDetail,
  type ValueFormatContext,
  type ValueFormatErrorEventDetail,
  type ReadyEventDetail,
  type ViewModeChangeEventDetail,
  type ViewModeChangeSource,
  type LockChangeEventDetail,
} from './interaction';
import { createActionHost } from './ui/actions';
import { ViewLayout } from './ui/view-layout';
import { EditorChrome } from './ui/chrome';
import styles from './css/main.css?inline';
import { initLogger, contentLogger } from './logger';
import { createLabelResolver, type EditorLabels } from './labels';

// Build-time constant (vite `define`).
declare const __VERSION__: string;

/** How the editor is presented (`viewMode`). Layout for `split`/`inline` lands in Phase 3. */
export type EditorViewMode = 'edit' | 'split' | 'preview' | 'inline';
/** The serialization lens used for content I/O. */
export type EditorFormat = SerializationFormat; // 'html' | 'markdown' | 'json'
/** Static toolbar placement — which edge of the editor it occupies (`'none'` hides it). */
export type EditorToolbar = 'top' | 'bottom' | 'start' | 'end' | 'none';
/** Status-bar placement — a dedicated strip docked top, bottom, or both (`'none'` hides it). */
export type EditorStatusBar = 'none' | 'top' | 'bottom' | 'both';
/** Forced colour scheme (`theme`); unset → the light default. */
export type EditorTheme = 'light' | 'dark';

/**
 * The `<km-editor>` input config — exactly one key per input-table row (`configKey`), as
 * `el.config` exposes it. The type the responsive rules (core SPEC §6.7) range over, and
 * (merged into {@link KmEditorElement}) the type of every input property (core usage.md →
 * "Typing the properties", rulebook C-CA-16).
 */
export interface EditorConfig {
  defaultValue: string | null;
  contentFormat: EditorFormat;
  name: string | null;
  getValueFormatCallback: ((ctx: ValueFormatContext) => string) | null;
  viewMode: EditorViewMode;
  isReadonly: boolean;
  isDisabled: boolean;
  toolbar: EditorToolbar;
  statusbar: EditorStatusBar;
  theme: EditorTheme | null;
  anchor: string | null;
  labels: EditorLabels | null;
  beforeActionCallback: ((detail: EditorActionEventDetail) => unknown) | null;
  renderLoadingCallback: RenderLoaderCallback | null;
  interactionHost: InteractionHost | null;
  customStyles: string | null;
  getCustomStylesCallback: CustomStylesCallback<EditorComponentContext> | null;
}

/**
 * Responsive rules map (core SPEC §6.7): two axes, each `mobile | tablet | desktop` →
 * partial editor config — `device` (classified by capability: touch phone / tablet) and
 * `breakpoint` (window width), e.g. `{ device: { mobile: { toolbar: 'bottom' } },
 * breakpoint: { mobile: { toolbar: 'none' } } }` (device wins on the same key). Set page-wide
 * (`window.components.responsive`), per tag (`window.components['km-editor'].responsive`)
 * or per instance (`el.responsive` / JSON attribute `responsive`).
 */
export type EditorResponsiveMap = ResponsiveMap<EditorConfig>;
/** Responsive rules callback (core SPEC §6.7): `(ctx) => Partial<EditorConfig> | null | undefined`. */
export type EditorResponsiveCallback = ResponsiveCallback<EditorConfig>;

const VIEW_MODES = ['edit', 'split', 'preview', 'inline'] as const;
const FORMATS = ['markdown', 'html', 'json'] as const;
const TOOLBARS = ['top', 'bottom', 'start', 'end', 'none'] as const;
const STATUSBARS = ['none', 'top', 'bottom', 'both'] as const;
const THEMES = ['light', 'dark'] as const;

const isLabels = (v: unknown): v is EditorLabels =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

const isInteractionHost = (v: unknown): v is InteractionHost | null =>
  v == null || (typeof v === 'object' && typeof (v as InteractionHost).request === 'function');

// ============================================================================
// INPUT TABLE — the whole <km-editor> public attribute/property surface.
// ============================================================================
const INPUTS: readonly InputDef[] = [
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
    configKey: 'theme',
    attribute: 'theme',
    converter: toEnum(THEMES, { isNullable: true }),
    shouldReflect: true,
    on: 'update',
    description:
      "Forced colour scheme: 'dark' swaps the token set (`:host([theme='dark'])`); 'light' (or unset) is the default look. Reflected to the host attribute.",
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
      'Every UI string (rulebook D-NC-24), a PARTIAL object over built-in English, `{name}` placeholders; an empty string = deliberately empty. `placeholder` (default empty = off) is shown while the document is empty. Command items: the camel-cased command id is the item text (`insertLink`, `bold`, `imageBrowserPick`), `<key>Tooltip` its tooltip; toolbar groups `<groupId>Group` (`formatGroup`, …); status `words` / `chars` (`{count}`); prompts `linkUrlPrompt`, `imageUrlPrompt`, `imageAltPrompt`, `codeLanguagePrompt` / `codeLanguageChangePrompt` (`{languages}`); cloud image `cloudImage`, `cloudImageTooltip`, `insertCloudImage`, `cloudImagePickerTitle`, `cloudImagePickerMessage`. Property (object) or JSON attribute (`labels=\'{"bold":"Tučně"}\'`). Applies live (no rebuild).',
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
      'Property only. The modal bridge interactive pipeline stages call: `{ request(ctx) }`, `ctx` = the request (`kind`, `title`, `message`, `payload`) + `signal` + `controller` / `element`. Default: a `window.confirm`-backed host. Survives engine rebuilds (e.g. a `plugins` reassignment).',
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
];

/**
 * Outward events (core §12.5). Each dispatches a DOM event (bubbles, not
 * composed) and first calls its camelCase `on*` twin with the SAME detail.
 * Every detail carries `controller` + `element` (non-enumerable).
 */
const EVENTS: readonly EventDef[] = [
  {
    name: 'change',
    description:
      'The document changed by the user (typing, toolbar, paste, …), a plugin, or `setValue()` (not `{ isSilent: true }`). Assigning `value` / `contentFormat` is silent, like a native `input.value`, and so is a form reset (like a native `form.reset()`). `detail`: `{ value, contentFormat }` — the content serialized in the active `contentFormat`. Twin: `onChange(detail)`.',
  },
  {
    name: 'ready',
    description:
      'The editor was built and is live for the first time (once per element lifetime; core `BlissElement`). Fires right after the first build — during upgrade for a normal element, or when the `defer` gate is released (`el.release()` / removing `defer`). The host then has the `ready` attribute and matches `:state(ready)`; `el.whenReady()` resolves. `detail`: `controller` / `element`. Twin: `onReady(detail)`.',
  },
  {
    name: 'view-mode-change',
    description:
      "The view mode was switched by anything but the app's own assignment: a view-mode toolbar item (`source: 'user'`), `setViewMode()` on the element or `controller` (`'api'`, unless `{ isSilent: true }`), or a plugin / pipeline stage through its `setViewMode` port (`'plugin'`). Assigning `viewMode` (attribute `view-mode`) is silent. `detail`: `{ viewMode, oldViewMode, source }`. Twin: `onViewModeChange(detail)`.",
  },
  {
    name: 'lock-change',
    description:
      'A gating pipeline (e.g. the cloud-image `image:browser:pick`) locked the editor for its run, or released it. `detail`: `{ isLocked }`. Twin: `onLockChange(detail)`.',
  },
  {
    name: 'value-format-error',
    description:
      'A `getValueFormatCallback` threw while formatting the submitted value. The hidden input then carries an empty string and the host is invalid (`customError`, message = label `valueFormatError`), so the form refuses to submit (`<form novalidate>` submits an empty string); the next successful format clears it. `detail`: `{ error, value }` (`value` = the unformatted document in `contentFormat`). Twin: `onValueFormatError(detail)`.',
  },
  {
    name: 'action',
    description:
      'A toolbar / selection-toolbar / context-menu item was activated. `detail`: `action` (the command name, or `custom`), `id`, `item`, `source` (`toolbar` | `selection-toolbar` | `context-menu`), `sourceEvent`, `triggerElement`, `dataset`, `state` (the ProseMirror state). Fires after the item’s `onClick` and the command (a notification after the fact; `state` is the snapshot from activation); `beforeActionCallback` → `false` cancels. Keyboard shortcuts do not fire it. Twin: `onAction(detail)`.',
  },
];

/** Element → its live engine. Internal: backs {@link getEditorEngine}. */
const engines = new WeakMap<KmEditorElement, EditorEngine>();

/**
 * The internal engine of an element — for this repo's dev pages and tests
 * only. NOT public API and not exported from the package entry: use
 * `el.controller`.
 *
 * @internal
 */
export function getEditorEngine(el: KmEditorElement): EditorEngine | null {
  el.flush();
  return engines.get(el) ?? null;
}

export class KmEditorElement extends BlissElement<EditorEventMap, EditorController> {
  protected static override inputs = INPUTS;
  protected static override events = EVENTS;
  /** Form-associated for `<fieldset disabled>` (core `isEffectivelyDisabled`) and `el.form`. */
  static formAssociated = true;

  // Type-only: core installs the managed accessors at runtime (§12.5). Each
  // twin is called with the event detail (not the CustomEvent).
  declare onChange: ((detail: ChangeEventDetail) => void) | null;
  declare onReady: ((detail: ReadyEventDetail) => void) | null;
  declare onViewModeChange: ((detail: ViewModeChangeEventDetail) => void) | null;
  declare onLockChange: ((detail: LockChangeEventDetail) => void) | null;
  declare onValueFormatError: ((detail: ValueFormatErrorEventDetail) => void) | null;
  declare onAction: ((detail: EditorActionEventDetail) => void) | null;
  // The input properties (`el.viewMode`, `el.labels`, …) are typed by the
  // `KmEditorElement extends EditorConfig` merge below the class (C-CA-16).

  #shadow: ShadowRoot;
  #layout: ViewLayout;
  #engine?: EditorEngine;
  #chrome?: EditorChrome;
  #unsubscribe?: () => void;
  /** Instance + page-wide custom CSS (core `createCustomStyles`, created on the first build). */
  #customStyles: CustomStylesHandle | null = null;
  /** Removes the pending loader (core `renderLoader`); set while it shows. */
  #removeLoader?: () => void;
  // The light-DOM hidden form input (only while `name` is set).
  #formInput?: HTMLInputElement;
  /** Whether the host is currently invalid because of a throwing `getValueFormatCallback`. */
  #hasFormatError = false;
  // Custom editor plugin set. `undefined` → the engine's defaultPlugins(). Not an
  // attribute input (plugins are objects); set via the `plugins` property.
  #customPlugins?: EditorPlugin[];
  // What the next engine build loads: a string in `format` (from `defaultValue` or a
  // pre-connect `setValue()`), or an HTML snapshot of the previous engine for a
  // `plugins` swap (HTML is lossless — tables included — and parses tolerantly
  // when the new plugin set lacks a node type). Only read by #buildEngine(); a DOM
  // move never rebuilds (the engine stays alive across disconnect/connect).
  #seed: { content: string | null; format: EditorFormat } = { content: null, format: 'markdown' };
  // A `setValue()` made while no engine exists (before the first build). Applied by the next build unless `value` was reassigned since —
  // `valueAtSet` is the `defaultValue` config it was made on top of.
  #pendingSet?: { value: string; format: EditorFormat; valueAtSet: unknown };
  // True while a silent `setValue()` / `value` assignment replaces the document:
  // the engine's `change` still syncs the form input + output, but no outward `change`.
  #isSilentChange = false;
  // Source a view-mode COMMAND reports: 'user' (toolbar activation) unless the
  // controller's `runCommand()` is running it ('api').
  #commandSource: ViewModeChangeSource = 'user';

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    // §12.8: adopt the shared editor stylesheet into the shadow root (one cached
    // CSSStyleSheet per string). Linked render-blocking in the playground; here it
    // rides the component so consumers need no separate <link>.
    adoptStyles(this.#shadow, styles);
    // Owns the shadow structure + the persistent editor mount across view modes.
    this.#layout = new ViewLayout({
      shadow: this.#shadow,
      host: this,
      serialize: (fmt) => (this.#engine ? this.#engine.serialize(fmt) : ''),
    });
    // `el.value = …` assigned before upgrade: core lifts it off and replays it through
    // the `value` setter before the first build (core rc20) — a pre-build `setValue()`.
  }

  // ── core lifecycle hooks ──────────────────────────────────────────────────

  /** Content source changed (or first connect): (re)build the engine. */
  protected override reinit(): void {
    // A `defaultValue` (attribute `value`) change is an explicit content replacement —
    // take it as the new source. (The first build also lands here with it as the seed.)
    // A `value` / `setValue()` assigned before the engine existed wins over the
    // `defaultValue` it was made on top of, but not over one assigned after it.
    const pending = this.#pendingSet;
    this.#pendingSet = undefined;
    this.#seed =
      pending && pending.valueAtSet === this.config.defaultValue
        ? { content: pending.value, format: pending.format }
        : { content: (this.config.defaultValue as string | null) ?? null, format: this.#format() };
    if (this.isConnected) this.#rebuildEngine();
    this.#applyCustomStyles();
  }

  /** Custom CSS, the canonical core adoption (core usage.md → "Style injection", rulebook C-CA-15). */
  #applyCustomStyles(): void {
    if (this.#customStyles) return this.#customStyles.refresh();
    this.#customStyles = createCustomStyles(this, this.#shadow, {
      cssClass: 'we-custom-styles',
      getContext: () => this.withContext({}),
      getInstanceStyles: () => ({
        css: this.config.customStyles as string | null,
        callback: this.config.getCustomStylesCallback as CustomStylesCallback | null,
      }),
    });
  }

  /**
   * `isDisabled` or an ancestor `<fieldset disabled>` flipped (core merges both
   * into `isEffectivelyDisabled`): toggle editing, the chrome and `inert`.
   */
  protected override disabledChanged(): void {
    this.#engine?.setEditable(this.#resolveEditable());
    this.#layout.setInert(this.isEffectivelyDisabled);
    this.#applyChromeState();
    this.#syncFormInput();
  }

  /**
   * The surrounding `<form>` was reset: restore the initial content (`defaultValue`,
   * attribute `value`), like a native control — silently: a native `form.reset()`
   * fires no `input` / `change`, so neither does this (the hidden input is synced).
   */
  formResetCallback(): void {
    this.flush();
    if (!this.#engine) return; // not built yet: the build loads defaultValue anyway
    this.#pendingSet = undefined;
    const content = (this.config.defaultValue as string | null) ?? '';
    this.setValue(content, undefined, { isSilent: true });
  }

  /** Cosmetic/behavioural change: patch the live engine without a rebuild. */
  protected override update(partial: Record<string, unknown>): void {
    if ('isReadonly' in partial || 'viewMode' in partial) {
      this.#engine?.setEditable(this.#resolveEditable());
    }
    // Structural view-mode / anchor change: re-arrange the shadow layout in place
    // (the persistent mount is re-parented, so the live document survives).
    if ('viewMode' in partial || 'anchor' in partial || 'toolbar' in partial || 'statusbar' in partial) {
      this.#applyLayout();
    }
    // Editing availability or the toolbar / status-bar toggle changed.
    if ('isReadonly' in partial || 'viewMode' in partial || 'toolbar' in partial || 'statusbar' in partial) {
      this.#applyChromeState();
    }
    // Assigning `viewMode` / `contentFormat` (property or attribute) is silent — like a
    // native `input.value`, state assignment never fires events (suite rule).
    // UI strings are resolved on render: re-render the chrome (and the empty-document
    // placeholder) with the new labels.
    if ('labels' in partial) {
      this.#chrome?.refresh();
      this.#engine?.refreshView();
    }
    if ('name' in partial || 'contentFormat' in partial || 'getValueFormatCallback' in partial) this.#syncFormInput();
    if ('interactionHost' in partial) {
      this.#engine?.setInteractionHost(this.#interactionHost());
    }
    if ('customStyles' in partial || 'getCustomStylesCallback' in partial) this.#customStyles?.refresh();
    // A showing pending loader re-renders with the new label / render hook.
    if (('labels' in partial || 'renderLoadingCallback' in partial) && this.#removeLoader) {
      this.#setPendingLoader(false);
      this.#setPendingLoader(true);
    }
    // `theme` reflects via the input table; nothing imperative to do here yet.
  }

  /**
   * Activate (every connect, after any reinit()/update()). Core's build-once
   * model: the engine survives a DOM move, so this only resumes live resources —
   * the view's DOM observer, the inline anchor, the chrome's selection state.
   * Content, selection and undo history are exactly as they were.
   */
  protected override connect(): void {
    if (!this.#engine) return; // a failed first build — core retries reinit() on the next flush
    this.#engine.activate();
    this.#layout.activate();
    this.#chrome?.refresh();
  }

  /**
   * Deactivate (every disconnect): release live resources only — the engine (and
   * with it the document, selection and undo history) stays alive, so a DOM move
   * re-activates without a rebuild and a detached editor still answers `value`.
   */
  protected override disconnect(): void {
    this.#engine?.deactivate();
    // Close floating panels so no positioning loop / document listener outlives the move.
    this.#chrome?.deactivate();
    // Release the inline anchor's floating-ui autoUpdate loop (re-anchored by
    // #layout.activate() on reconnect); otherwise a detached-but-held editor keeps
    // tracking its detached host.
    this.#layout.deactivate();
  }

  // ── engine lifecycle ────────────────────────────────────────────────────────

  #rebuildEngine(): void {
    // Preserve nothing here: the caller just set #seed to what the new engine loads.
    // Construct the new engine BEFORE tearing the old one down: assembly can throw
    // (e.g. a plugin node without a markdown serializer — the documented contract),
    // and a failed build must leave the working editor, its content and undo
    // history untouched (ED-9). The new view is appended to the persistent mount
    // next to the old one; the old view's destroy() removes its own DOM.
    const engine = this.#createEngine();
    this.#teardownEngine();
    this.#wireEngine(engine);
  }

  #buildEngine(): void {
    this.#wireEngine(this.#createEngine());
  }

  /** Lay out the shadow and construct an engine from #seed (throws on a bad plugin set). */
  #createEngine(): EditorEngine {
    const format = this.#format();
    // Seed the split output lens to the I/O format, then lay out the shadow so the
    // persistent mount is attached before the view measures itself.
    this.#layout.setDefaultOutputFormat(format);
    this.#applyLayout();

    const options: EditorEngineOptions = {
      mount: this.#layout.mount,
      isEditable: this.#resolveEditable(),
      editorPlugins: this.#customPlugins, // undefined → engine uses defaultPlugins()
      interactionHost: this.#interactionHost(),
      // Every ctx the engine builds carries this element + its controller.
      host: {
        element: this,
        getController: () => this.controller,
        // View-mode commands (toolbar items) report 'user' ('api' under runCommand);
        // the plugin port (setup ctx / stage services) reports 'plugin'.
        viewMode: {
          get: () => this.config.viewMode as EditorViewMode,
          set: (mode, via) => this.#switchViewMode(mode, via === 'plugin' ? 'plugin' : this.#commandSource, false),
        },
      },
      // UI strings: read live, so a `labels` change applies without a rebuild.
      getLabels: () => this.config.labels as EditorLabels | null | undefined,
    };
    this.#applyContentOption(options, this.#seed.format, this.#seed.content);

    const mount = this.#layout.mount;
    const before = new Set(Array.from(mount.childNodes));
    try {
      return new EditorEngine(options);
    } catch (err) {
      // A throw after the view was created (a plugin's `setup()` or a PM plugin
      // view) leaves the half-built view's DOM in the mount — remove it so the
      // previous editor (if any) is the only surface left.
      for (const node of Array.from(mount.childNodes)) if (!before.has(node)) node.remove();
      throw err;
    }
  }

  /** Adopt a freshly constructed engine: events, chrome, activation state, `ready`. */
  #wireEngine(engine: EditorEngine): void {
    const format = this.#format();
    this.#engine = engine;
    engines.set(this, engine);

    // Bridge engine → outward events, and keep the split output panel live.
    const offChange = engine.events.on('change', () => {
      this.#layout.refreshOutput();
      this.#syncFormInput();
      if (!this.#isSilentChange) this.emit('change', this.#changeDetail());
    });
    const offLock = engine.events.on('lock', ({ isLocked }) => this.emit('lock-change', { isLocked }));
    const offPending = engine.events.on('pending', ({ isPending }) => this.#setPendingLoader(isPending));
    this.#unsubscribe = () => {
      offChange();
      offLock();
      offPending();
    };
    this.#layout.refreshOutput(); // initial fill (engine now exists)
    this.#syncFormInput();

    // Command-driven chrome (zone toolbar + status bar + selection toolbar +
    // context menu). Bound to this engine's view/registry and the lists it
    // assembled from its plugin set, so it is rebuilt with the engine.
    this.#chrome = new EditorChrome({
      engine,
      layout: this.#layout,
      // Item activation: beforeActionCallback → onClick → `action` → the command.
      actions: createActionHost({
        engine,
        getBeforeActionCallback: () =>
          this.config.beforeActionCallback as ((detail: EditorActionEventDetail) => unknown) | null,
        emitAction: (detail) => this.emit('action', detail),
      }),
    });
    this.#applyChromeState();

    initLogger.debug(`<km-editor> engine built (format=${format}, editable=${engine.isEditable()}) v${
      typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'
    }`);

    // Built while detached (e.g. a `plugins` swap on a removed element): start
    // inactive — connect() activates it.
    if (!this.isConnected) {
      engine.deactivate();
      this.#layout.deactivate();
    }
  }

  /**
   * Show / hide the pipeline pending loader through core `renderLoader()`:
   * instance `renderLoadingCallback` → page-wide `renderLoadingCallback` →
   * the default `.we__loader` spinner; `role="status"` + label `loading`.
   */
  #setPendingLoader(isPending: boolean): void {
    const slot = this.#layout.pendingMount;
    if (isPending && !this.#removeLoader) {
      const label = createLabelResolver(() => this.config.labels as EditorLabels | null | undefined)('loading');
      slot.hidden = false;
      this.#removeLoader = renderLoader(this, slot, 'pipeline', { prefix: 'we', label });
    } else if (!isPending && this.#removeLoader) {
      this.#removeLoader();
      this.#removeLoader = undefined;
      slot.hidden = true;
    }
  }

  #teardownEngine(): void {
    this.#setPendingLoader(false);
    this.#chrome?.destroy();
    this.#chrome = undefined;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#engine?.destroy();
    this.#engine = undefined;
    engines.delete(this);
  }

  /**
   * Form convention (KeenMate suite, like web-multiselect): a light-DOM hidden
   * input named by `name` carries the live content in `contentFormat` — the host
   * never calls `setFormValue`. No `name` → no input. Disabled (not submitted)
   * while the editor is effectively disabled.
   */
  #syncFormInput(): void {
    const name = this.config.name as string | null;
    if (!name) {
      this.#formInput?.remove();
      this.#formInput = undefined;
      this.#clearFormatError();
      return;
    }
    let input = this.#formInput;
    if (!input) {
      input = this.ownerDocument.createElement('input');
      input.type = 'hidden';
      this.#formInput = input;
    }
    if (input.parentNode !== this) this.appendChild(input);
    input.name = name;
    input.value = this.#engine ? this.#formValue() : '';
    input.disabled = this.isEffectivelyDisabled;
  }

  /**
   * The submitted form value: the document in `contentFormat`, through
   * `getValueFormatCallback` when set. A throwing callback submits `''`, marks the
   * host invalid (core `setFormatError`, label `valueFormatError`) and fires
   * `value-format-error`; the next successful format clears the invalid state.
   */
  #formValue(): string {
    const engine = this.#engine!;
    const contentFormat = this.#format();
    const value = engine.serialize(contentFormat);
    const format = this.config.getValueFormatCallback as ((ctx: ValueFormatContext) => string) | null;
    if (!format) {
      this.#clearFormatError();
      return value;
    }
    let formatted: string;
    try {
      formatted = String(format(this.withContext({ value, contentFormat })) ?? '');
    } catch (error) {
      contentLogger.error('<km-editor> getValueFormatCallback threw; submitting an empty value and marking the field invalid', error);
      this.#hasFormatError = true;
      this.setFormatError(error, engine.label('valueFormatError'), engine.view.dom as HTMLElement);
      this.emit('value-format-error', { error, value });
      return '';
    }
    this.#clearFormatError();
    return formatted;
  }

  #clearFormatError(): void {
    if (!this.#hasFormatError) return;
    this.#hasFormatError = false;
    this.setFormatError(null);
  }

  /** (Re)arrange the shadow layout for the current view mode + anchor + toolbar + status side. */
  #applyLayout(): void {
    this.#layout.render(
      this.config.viewMode as EditorViewMode,
      (this.config.anchor as string | null) ?? null,
      this.config.toolbar as EditorToolbar,
      this.config.statusbar as EditorStatusBar
    );
    this.#layout.setInert(this.isEffectivelyDisabled);
  }

  /** Push the current editable + toolbar + status-bar settings into the chrome. */
  #applyChromeState(): void {
    this.#chrome?.setState({
      isEditable: this.#resolveEditable(),
      isDisabled: this.isEffectivelyDisabled,
      isToolbarShown: (this.config.toolbar as EditorToolbar) !== 'none',
      status: this.config.statusbar as EditorStatusBar,
    });
  }

  /** Map a content string + format onto the matching engine option. */
  #applyContentOption(options: EditorEngineOptions, format: EditorFormat, content: string | null): void {
    if (content == null || content === '') return; // engine starts with an empty document
    try {
      if (format === 'json') options.json = JSON.parse(content);
      else if (format === 'html') options.html = content;
      else options.markdown = content;
    } catch (err) {
      contentLogger.warn(`<km-editor> could not parse initial ${format} content; starting empty`, err);
    }
  }

  #resolveEditable(): boolean {
    if (this.isEffectivelyDisabled) return false;
    const isReadonly = this.config.isReadonly === true;
    const previewing = this.config.viewMode === 'preview';
    return !isReadonly && !previewing;
  }

  #format(): EditorFormat {
    return (this.config.contentFormat as EditorFormat) ?? 'markdown';
  }

  #changeDetail(): { value: string; contentFormat: EditorFormat } {
    return { value: this.#engine!.serialize(this.#format()), contentFormat: this.#format() };
  }

  #interactionHost(): InteractionHost {
    return (this.config.interactionHost as InteractionHost | null) ?? defaultInteractionHost();
  }

  /** The public facade (`el.controller`): content I/O, focus, commands — never the engine. */
  protected override createController(): EditorController {
    const el = this;
    const target = {
      getHTML: () => el.getHTML(),
      getMarkdown: () => el.getMarkdown(),
      getJSON: () => el.getJSON(),
      setValue: (value: string, format?: EditorFormat, options?: { isSilent?: boolean }) =>
        el.setValue(value, format, options),
      setViewMode: (mode: EditorViewMode, options?: { isSilent?: boolean }) => el.setViewMode(mode, options),
      focus: () => el.focus(),
      runCommand: (command: string | Command) => el.#runCommand(command),
      isCommandToggled: (name: string) => {
        el.flush();
        return el.#engine?.commands.isToggled(name) ?? false;
      },
      isCommandEnabled: (name: string) => {
        el.flush();
        return el.#engine?.commands.isEnabled(name) ?? false;
      },
      get value() {
        return el.value;
      },
    };
    return createEditorController(() => target);
  }

  /** A registered command / pipeline by name, or a ProseMirror command on the live view. */
  #runCommand(command: string | Command): boolean {
    this.flush();
    const engine = this.#engine;
    if (!engine) return false;
    if (typeof command === 'string') {
      // A view-mode command run programmatically reports `source: 'api'`.
      const previous = this.#commandSource;
      this.#commandSource = 'api';
      try {
        return engine.commands.run(command);
      } finally {
        this.#commandSource = previous;
      }
    }
    const view = engine.view;
    const ok = command(view.state, view.dispatch, view);
    view.focus();
    return ok;
  }

  // ── public content API (not inputs) ───────────────────────────────────────

  /**
   * The live content, serialized in the active `contentFormat` (`''` before the first
   * build). Assigning replaces the document, parsed in `contentFormat` — like
   * `setValue(value, undefined, { isSilent: true })`: silent (no `change`, like a
   * native `input.value`); the hidden form input is synced. The `value` ATTRIBUTE is the initial content
   * ({@link defaultValue}) and is never written.
   */
  get value(): string {
    this.flush();
    return this.#engine ? this.#engine.serialize(this.#format()) : '';
  }
  set value(value: string) {
    this.setValue(value ?? '', undefined, { isSilent: true });
  }

  getHTML(): string {
    this.flush();
    return this.#engine?.getHTML() ?? '';
  }

  getMarkdown(): string {
    this.flush();
    return this.#engine?.getMarkdown() ?? '';
  }

  getJSON(): unknown {
    this.flush();
    return this.#engine?.getJSON() ?? null;
  }

  /**
   * Replace the document with `value`, parsed in `format` (defaults to the active
   * `contentFormat`) — the controller's write path. Fires `change` unless
   * `options.isSilent`; assigning `el.value` is the silent form (like a native
   * `input.value`). Either way the hidden form input is synced.
   */
  setValue(value: string, format?: EditorFormat, options?: { isSilent?: boolean }): void {
    this.flush();
    const fmt = format ?? this.#format();
    if (this.#engine) {
      const wasSilent = this.#isSilentChange;
      this.#isSilentChange = options?.isSilent === true;
      try {
        if (fmt === 'json') this.#engine.setJSON(JSON.parse(value));
        else this.#engine.setContent(value, fmt);
      } finally {
        this.#isSilentChange = wasSilent;
      }
    } else {
      // No engine yet (before the first build): the build loads it — unless `value` is reassigned in the meantime.
      this.#pendingSet = { value, format: fmt, valueAtSet: this.config.defaultValue };
    }
  }

  /**
   * Switch the view mode (`edit` | `split` | `preview` | `inline`). Fires
   * `view-mode-change` (`source: 'api'`) unless `options.isSilent`; a no-op (no event)
   * when `mode` is already active, and an invalid mode warns and keeps the current one.
   * Assigning `el.viewMode` is the silent form.
   */
  setViewMode(mode: EditorViewMode, options?: { isSilent?: boolean }): void {
    this.#switchViewMode(mode, 'api', options?.isSilent === true);
  }

  /** The one view-mode write path behind `setViewMode()`, the view-mode commands and the plugin port. */
  #switchViewMode(mode: EditorViewMode, source: ViewModeChangeSource, isSilent: boolean): void {
    this.flush();
    const oldViewMode = this.config.viewMode as EditorViewMode;
    if (mode === oldViewMode) return;
    // The input's converter validates (an invalid mode warns and keeps the current one).
    this.viewMode = mode;
    this.flush();
    if (this.config.viewMode !== mode || isSilent) return;
    this.emit('view-mode-change', { viewMode: mode, oldViewMode, source });
  }

  /**
   * The editor plugin set. Assign to customise — compose with `defaultPlugins()`
   * to keep the built-ins, and order the array to control conflict precedence
   * (later plugins override earlier by id). Reassigning rebuilds the engine on the
   * new set, preserving the live content. Reading returns the active set.
   *
   * ```js
   * import { defaultPlugins } from '@keenmate/web-editor';
   * el.plugins = [...defaultPlugins(), myPlugin];
   * ```
   */
  get plugins(): EditorPlugin[] {
    return this.#customPlugins ? [...this.#customPlugins] : defaultPlugins();
  }
  set plugins(value: EditorPlugin[] | null | undefined) {
    const previousPlugins = this.#customPlugins;
    this.#customPlugins = value ?? undefined;
    if (this.#engine) {
      // Snapshot live content as HTML (lossless, tables included; unknown nodes
      // degrade gracefully if the new set drops a feature), then rebuild on the
      // new plugin set. Undo history starts fresh with the new engine.
      const previousSeed = this.#seed;
      this.#seed = { content: this.#engine.getHTML(), format: 'html' };
      try {
        this.#rebuildEngine();
      } catch (err) {
        // The new set failed to assemble: the previous engine is still live
        // (#rebuildEngine builds before it tears down) — keep its plugin set so
        // `plugins` reads what is actually running, and report to the caller.
        this.#customPlugins = previousPlugins;
        this.#seed = previousSeed;
        throw err;
      }
    }
  }

  focus(): void {
    this.flush();
    this.#engine?.focus();
  }

  /**
   * Final teardown (core `destroy()` calls this once): the engine — document,
   * undo history, plugins' `destroy()` — and the shadow layout. `disconnect()`
   * keeps both alive for a DOM move; this releases them for good.
   */
  protected override destroyCallback(): void {
    this.#customStyles?.destroy();
    this.#customStyles = null;
    this.#teardownEngine();
    this.#layout.destroy();
    this.#formInput?.remove();
    this.#formInput = undefined;
  }
}

/**
 * Every input as a typed property (`el.viewMode`, `el.labels`, `el.customStyles`, …):
 * core installs them at runtime, this merge types them (core usage.md → "Typing the
 * properties", rulebook C-CA-16).
 */
export interface KmEditorElement extends EditorConfig {}

// The tag is defined by core's registerComponent() in index.ts (the package entry) only.
