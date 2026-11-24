/**
 * `<km-editor>` — the custom element, built on `@keenmate/web-components-core`
 * (`BlissElement`). A thin shell over the headless {@link EditorEngine}: it owns
 * the shadow root, adopts the editor stylesheet, declares the public surface as a
 * core input/event table, and bridges engine events to outward CustomEvents.
 *
 * Reactivity (per input `on:`):
 *   - `reinit` — content source changed (`defaultValue`, attribute `value`) → rebuild the engine.
 *   - `update` — `viewMode` / `isReadonly` / `isDisabled` (via `disabledChanged()`) / `contentFormat` / `interactionHost`
 *                / `isRequired` (core re-evaluates `valueMissing` after every flush; content changes call `refreshRequired()`)
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
  adoptStyles,
  ICON_CSS,
  createCustomStyles,
  renderLoader,
  createFormInputs,
  announce,
  keepScrollAcrossMove,
  type CustomStylesCallback,
  type CustomStylesHandle,
  type EventDef,
  type RenderLoadingCallback,
  type RenderIconCallback,
  type ResponsiveCallback,
  type ResponsiveMap,
} from '@keenmate/web-components-core';
import type { Command } from 'prosemirror-state';
import { EditorEngine, type EditorEngineOptions } from './engine/editor-engine';
import { defaultPlugins } from './engine/default-plugins';
import { isDocBlank } from './engine/placeholder';
import type { InteractionHost } from './engine/pipeline/types';
import type { EditorPlugin } from './engine/plugin';
import type { SerializationFormat } from './engine/serialization';
import {
  createEditorController,
  type EditorController,
  type EditorComponentContext,
  type EditorRenderContext,
  type EditorStylesContext,
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
import { createEditorLabels, type EditorLabels } from './labels';
import type { EditorIcons } from './icons';
import {
  getMenuPresentationOptions,
  type MenuDrawerSide,
  type MenuPresentation,
} from '@keenmate/web-components-core/menu';
import type { TranslateCallback } from '@keenmate/web-components-core/locale';

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
  isRequired: boolean;
  toolbar: EditorToolbar;
  statusbar: EditorStatusBar;
  anchor: string | null;
  labels: EditorLabels | null;
  locale: string | null;
  translateCallback: TranslateCallback | null;
  beforeActionCallback: ((detail: EditorActionEventDetail) => unknown) | null;
  renderLoadingCallback: RenderLoadingCallback | null;
  icons: EditorIcons | null;
  renderIconCallback: RenderIconCallback | null;
  interactionHost: InteractionHost | null;
  customStyles: string | null;
  getCustomStylesCallback: CustomStylesCallback<EditorStylesContext> | null;
  /** How the context menu opens (core `/menu`): `auto` (default) | `floating` | `sheet` | `drawer`. */
  menuPresentation: MenuPresentation;
  /** The edge a `drawer` context menu slides in from: `start` | `end` (default). */
  menuSide: MenuDrawerSide;
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

import { INPUTS } from './inputs';

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

/** The `labels` key announced when the view mode switches (with a `view-mode-change` event). */
const VIEW_MODE_ANNOUNCEMENTS: Record<EditorViewMode, string> = {
  edit: 'ariaLabels.viewModeEdit',
  split: 'ariaLabels.viewModeSplit',
  preview: 'ariaLabels.viewModePreview',
  inline: 'ariaLabels.viewModeInline',
};

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
  /** Form-associated for `<fieldset disabled>` (core `isEffectivelyDisabled`), `el.form` and the form validity (`required`). */
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
  /** UI strings (core `/locale`: instance `labels` → page-wide labels → English). */
  #labels = createEditorLabels(
    () => this.config.labels as EditorLabels | null | undefined,
    this,
    undefined,
    () => this.config.locale as string | null | undefined,
  );
  #label = this.#labels.label;
  /** The light-DOM hidden input (core `createFormInputs`, SPEC §12.21). */
  #formInputs = createFormInputs(this);
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
    adoptStyles(this.#shadow, styles, ICON_CSS);
    // Owns the shadow structure + the persistent editor mount across view modes.
    this.#layout = new ViewLayout({
      shadow: this.#shadow,
      host: this,
      serialize: (fmt) => (this.#engine ? this.#engine.serialize(fmt) : ''),
      label: (key, params, fallback) => this.#label(key, params, fallback),
    });
    // The split view's output `<pre>` keeps its scroll position across a DOM move (core, rulebook C-CA-31) —
    // the move keeps the panel (no rebuild), but a detached scroller reads 0.
    keepScrollAcrossMove(this, () => [this.#layout.outputScroller]);
    // `el.value = …` assigned before upgrade: core lifts it off and replays it through
    // the `value` setter before the first build (core rc20) — a pre-build `setValue()`.
    // A click aimed at the host itself — a `<label for>` / wrapping `<label>` activation (the browser
    // re-targets it to the labelled form-associated element) — focuses the editing surface, like a native
    // control. Clicks inside the shadow (toolbar, text) target their own nodes and are left alone.
    // Not `delegatesFocus`: that would focus the first toolbar button and steal focus on chrome clicks.
    this.addEventListener('click', (e) => {
      if (e.composedPath()[0] !== this || this.isEffectivelyDisabled) return;
      this.focus();
    });
    // The surface's name is re-read when the surface takes focus — the moment a screen reader speaks it — so a
    // `<label for>` added / changed / removed after connect (or a changed host `id`) is picked up without a
    // document-wide MutationObserver. Focus moves inside the chrome (toolbar, tabs) don't re-read it.
    this.addEventListener('focusin', (e) => {
      if (this.#engine && e.composedPath()[0] === this.#engine.view.dom) this.#reconcileSurfaceName();
    });
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
    this.#reconcileCustomStyles();
  }

  /** Custom CSS, the canonical core adoption (core usage.md → "Style injection", rulebook C-CA-15). */
  #reconcileCustomStyles(): void {
    if (this.#customStyles) return this.#customStyles.refresh();
    this.#customStyles = createCustomStyles(this, this.#shadow, {
      cssClass: 'we-custom-styles',
      getContext: () => this.#renderContext({}),
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
    this.#engine?.setOptions({ isReadonly: !this.#resolveEditable() });
    this.#engine?.refreshAttributes(); // aria-disabled ↔ aria-readonly
    this.#layout.setInert(this.isEffectivelyDisabled);
    this.#reconcileChromeState();
    this.#rerunRenderCallbacks(); // the hidden form input (disabled ↔ submitted) + ctx.isDisabled
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
    // The engine's settings first (C-CA-39) — the chrome re-renders below read them.
    this.#engine?.setOptions(this.#engineSettings(partial));
    // Structural view-mode / anchor change: re-arrange the shadow layout in place
    // (the persistent mount is re-parented, so the live document survives).
    if ('viewMode' in partial || 'anchor' in partial || 'toolbar' in partial || 'statusbar' in partial) {
      this.#renderLayout();
    }
    // Editing availability or the toolbar / status-bar toggle changed.
    if ('isReadonly' in partial || 'viewMode' in partial || 'toolbar' in partial || 'statusbar' in partial) {
      this.#reconcileChromeState();
    }
    // Assigning `viewMode` / `contentFormat` (property or attribute) is silent — like a
    // native `input.value`, state assignment never fires events (suite rule).
    // UI strings are resolved on render: re-render the chrome (and the empty-document
    // placeholder) with the new labels.
    if ('labels' in partial || 'locale' in partial || 'translateCallback' in partial) this.#relabel();
    // Item icons are drawn on render: re-render the toolbars with the new hook.
    else if ('renderIconCallback' in partial) this.#chrome?.refresh();
    // A value the callbacks' ctx carries (labels / isReadonly) changed: the element-level callbacks re-run in place.
    const isRenderCtxChanged = ['labels', 'locale', 'translateCallback', 'isReadonly', 'viewMode'].some((k) => k in partial);
    if (isRenderCtxChanged || 'name' in partial || 'contentFormat' in partial || 'getValueFormatCallback' in partial) this.#reconcileFormInput();
    if (isRenderCtxChanged || 'customStyles' in partial || 'getCustomStylesCallback' in partial) this.#customStyles?.refresh();
    // A showing pending loader re-renders with the new label / render hook.
    if (('labels' in partial || 'locale' in partial || 'translateCallback' in partial || 'renderLoadingCallback' in partial) && this.#removeLoader) {
      this.#setPendingLoader(false);
      this.#setPendingLoader(true);
    }
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
    this.#reconcileSurfaceName();
  }

  /**
   * The editing surface's accessible name, from the host (like a native control's): its `aria-labelledby`
   * elements, else its `aria-label`, else its `<label for>` / wrapping `<label>`s. `text: null` → the engine
   * falls back to the `ariaLabels.editor` label.
   */
  #accessibleName(): { text: string | null; elements: Element[] } {
    const root = this.getRootNode() as Document | ShadowRoot;
    const ids = (this.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    let elements: Element[] = ids.map((id) => root.getElementById?.(id) ?? null).filter((e): e is HTMLElement => !!e);
    if (!elements.length) {
      const own = this.getAttribute('aria-label')?.trim();
      if (own) return { text: own, elements: [] };
      elements = [...(this.internals?.labels ?? [])] as Element[];
    }
    const text = elements.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    return { text: text || null, elements: text ? elements : [] };
  }

  /**
   * Point the surface at the host's visible label (ARIA element reflection, `ariaLabelledByElements` — the
   * label lives outside the shadow root) where the browser has it; the `aria-label` copy of its text (engine
   * attribute) names the surface everywhere else. Re-read on connect, on a labels change and when the surface
   * takes focus (a label added after connect).
   */
  #reconcileSurfaceName(): void {
    const engine = this.#engine;
    if (!engine) return;
    const dom = engine.view.dom as HTMLElement & { ariaLabelledByElements?: Element[] | null };
    if ('ariaLabelledByElements' in dom) {
      const { elements } = this.#accessibleName();
      dom.ariaLabelledByElements = elements.length ? elements : null;
    }
    engine.refreshAttributes();
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
    this.#renderLayout();

    const options: EditorEngineOptions = {
      ...this.#engineSettings(null),
      plugins: this.#customPlugins, // undefined → engine uses defaultPlugins()
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
        // The editing surface's ARIA (role="textbox"): the host's own name and disabled state.
        getAccessibleName: () => this.#accessibleName().text,
        isDisabled: () => this.isEffectivelyDisabled,
        isReadonly: () => this.#isReadonlyForCallbacks(),
      },
    };
    this.#setContentOption(options, this.#seed.format, this.#seed.content);

    const mount = this.#layout.mount;
    const before = new Set(Array.from(mount.childNodes));
    try {
      return new EditorEngine(mount, options);
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
      this.#reconcileFormInput();
      this.refreshRequired(); // `required`: the content changed (user, setValue, value property, form reset)
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
    this.#reconcileFormInput();
    // A `plugins` swap rebuilds outside a flush: re-point `valueMissing` at the new surface (the old one is gone).
    this.refreshRequired();

    // Command-driven chrome (zone toolbar + status bar + selection toolbar +
    // context menu). Bound to this engine's view/registry and the lists it
    // assembled from its plugin set, so it is rebuilt with the engine.
    this.#chrome = new EditorChrome({
      engine,
      layout: this.#layout,
      // Item activation: beforeActionCallback → onClick → `action` → the command.
      actions: createActionHost({
        engine,
        element: this, // item icons: core renderIcon asks this element's renderIconCallback
        getBeforeActionCallback: () =>
          this.config.beforeActionCallback as ((detail: EditorActionEventDetail) => unknown) | null,
        emitAction: (detail) => this.emit('action', detail),
      }),
      // `menu-presentation` / `menu-side` (effective config), read at every open.
      getMenuPresentation: () => getMenuPresentationOptions(this.config),
    });
    this.#reconcileChromeState();

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
      const label = this.#label('ariaLabels.loading');
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

  /** Re-render every UI string: the chrome, the empty-document placeholder, the output tabs. */
  #relabel(): void {
    this.#chrome?.refresh();
    this.#engine?.refreshView();
    this.#layout.relabel();
    this.#reconcileSurfaceName();
  }

  /** A page-wide `window.components.locale` change (core `/locale`): the strings re-resolve. */
  protected override localeChanged(): void {
    this.#relabel();
    this.#rerunRenderCallbacks(); // their ctx.labels read the page-wide locale too
    this.refreshRequired(); // the `errors.required` message re-resolves
    if (this.#removeLoader) {
      this.#setPendingLoader(false);
      this.#setPendingLoader(true);
    }
  }

  /**
   * An icon source changed — the page-wide `window.components.renderIconCallback` / `window.components.icons`
   * (rulebook C-CA-40) or this element's `icons` (core calls it after the flush, C-CA-42): the item icons
   * (toolbar, selection toolbar) re-render in place through the chrome's state refresh — the document,
   * selection, focus, undo history and an open menu stay. A menu renders its icons on open.
   */
  protected override iconsChanged(): void {
    this.#chrome?.refresh();
  }

  /**
   * Form convention (Keenmate suite, core `createFormInputs`): a light-DOM hidden
   * input named by `name` carries the live content in `contentFormat` — the host
   * never calls `setFormValue`. No `name` → no input. Disabled (not submitted)
   * while the editor is effectively disabled.
   */
  #reconcileFormInput(): void {
    const name = this.config.name as string | null;
    if (!name) this.#clearFormatError();
    this.#formInputs.write(name, name && this.#engine ? this.#formValue() : '', { isDisabled: this.isEffectivelyDisabled });
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
      formatted = String(format(this.#renderContext({ value, contentFormat })) ?? '');
    } catch (error) {
      contentLogger.error('<km-editor> getValueFormatCallback threw; submitting an empty value and marking the field invalid', error);
      this.#hasFormatError = true;
      this.setFormatError(error, engine.label('errors.valueFormat'), engine.view.dom as HTMLElement);
      this.emit('value-format-error', { error, value });
      return '';
    }
    this.#clearFormatError();
    return formatted;
  }

  /** `required` (core SPEC §6.6): empty = no content — no non-whitespace text and no non-text node (image, table, …). */
  protected override isValueEmpty(): boolean {
    const engine = this.#engine;
    return !engine || isDocBlank(engine.view.state.doc);
  }

  /** The `valueMissing` message — the `errors.required` label. */
  protected override getRequiredMessage(): string {
    return this.#label('errors.required');
  }

  /** The validation bubble points at the editing surface (the `contenteditable`); no engine → the host. */
  protected override getValidityAnchor(): HTMLElement | undefined {
    return (this.#engine?.view.dom as HTMLElement | undefined) ?? undefined;
  }

  #clearFormatError(): void {
    if (!this.#hasFormatError) return;
    this.#hasFormatError = false;
    this.setFormatError(null);
  }

  /** (Re)arrange the shadow layout for the current view mode + anchor + toolbar + status side. */
  #renderLayout(): void {
    this.#layout.render(
      this.config.viewMode as EditorViewMode,
      (this.config.anchor as string | null) ?? null,
      this.config.toolbar as EditorToolbar,
      this.config.statusbar as EditorStatusBar
    );
    this.#layout.setInert(this.isEffectivelyDisabled);
  }

  /** Push the current editable + toolbar + status-bar settings into the chrome. */
  #reconcileChromeState(): void {
    this.#chrome?.setState({
      isEditable: this.#resolveEditable(),
      isDisabled: this.isEffectivelyDisabled,
      isToolbarShown: (this.config.toolbar as EditorToolbar) !== 'none',
      status: this.config.statusbar as EditorStatusBar,
    });
  }

  /** Map a content string + format onto the matching engine option. */
  #setContentOption(options: EditorEngineOptions, format: EditorFormat, content: string | null): void {
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

  /** `ctx.isReadonly` of every callback: `readonly` or previewing (disabled is `ctx.isDisabled`, separately). */
  #isReadonlyForCallbacks(): boolean {
    return this.config.isReadonly === true || this.config.viewMode === 'preview';
  }

  /**
   * An element-built callback ctx (`getValueFormatCallback`, `getCustomStylesCallback`): `fields` + the component
   * context + the render state every editor ctx carries (`EditorRenderContext`: `labels`, `isReadonly`,
   * `isDisabled` — non-enumerable, read live, like the engine-built ones).
   */
  #renderContext<T extends object>(fields: T): T & EditorComponentContext & EditorRenderContext {
    const ctx = this.withContext(fields);
    Object.defineProperties(ctx, {
      labels: { value: this.#labels.labels, enumerable: false, configurable: true },
      isReadonly: { get: () => this.#isReadonlyForCallbacks(), enumerable: false, configurable: true },
      isDisabled: { get: () => this.isEffectivelyDisabled, enumerable: false, configurable: true },
    });
    return ctx as T & EditorComponentContext & EditorRenderContext;
  }

  /**
   * A value the callbacks' ctx carries changed (labels / locale / translateCallback / the page-wide locale,
   * read-only, disabled): re-run the element-level callbacks in place — `getValueFormatCallback` (the hidden form
   * input) and `getCustomStylesCallback`. The chrome's callbacks re-run through its own refresh.
   */
  #rerunRenderCallbacks(): void {
    this.#reconcileFormInput();
    this.#customStyles?.refresh();
  }

  #format(): EditorFormat {
    return (this.config.contentFormat as EditorFormat) ?? 'markdown';
  }

  #changeDetail(): { value: string; contentFormat: EditorFormat } {
    return { value: this.#engine!.serialize(this.#format()), contentFormat: this.#format() };
  }

  /**
   * The engine settings (C-CA-39) from this element's config: all of them (`partial: null`, a build) or only
   * those a batch changed (`update(partial)` → `engine.setOptions()`). `isReadonly` is the EFFECTIVE value
   * (read-only, disabled or previewing); `null` `interactionHost` = the engine's default dialog host.
   */
  #engineSettings(partial: Record<string, unknown> | null): Partial<EditorEngineOptions> {
    const has = (key: string): boolean => partial === null || key in partial;
    const settings: Partial<EditorEngineOptions> = {};
    if (has('isReadonly') || has('viewMode')) settings.isReadonly = !this.#resolveEditable();
    if (has('labels')) settings.labels = this.config.labels as EditorLabels | null;
    if (has('locale')) settings.locale = this.config.locale as string | null;
    if (has('translateCallback')) settings.translateCallback = this.config.translateCallback as TranslateCallback | null;
    if (has('interactionHost')) settings.interactionHost = this.config.interactionHost as InteractionHost | null;
    return settings;
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
    // Screen readers hear the switch (the layout changed under them); '' silences it.
    const spoken = this.#label(VIEW_MODE_ANNOUNCEMENTS[mode]);
    if (spoken) announce(spoken, { document: this.ownerDocument });
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
    this.#formInputs.clear();
  }
}

/**
 * Every input as a typed property (`el.viewMode`, `el.labels`, `el.customStyles`, …):
 * core installs them at runtime, this merge types them (core usage.md → "Typing the
 * properties", rulebook C-CA-16).
 */
export interface KmEditorElement extends EditorConfig {}

// The tag is defined by core's registerComponent() in index.ts (the package entry) only.
