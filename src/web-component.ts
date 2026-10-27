/**
 * `<km-editor>` — the custom element, built on `@keenmate/web-components-core`
 * (`BlissElement`). A thin shell over the headless {@link EditorEngine}: it owns
 * the shadow root, adopts the editor stylesheet, declares the public surface as a
 * core input/event table, and bridges engine events to outward CustomEvents.
 *
 * Reactivity (per input `on:`):
 *   - `reinit` — content source changed (`defaultValue`, attribute `value`) → rebuild the engine.
 *   - `update` — `viewMode` / `isReadonly` / `theme` / `format` / `interactionHost`
 *                → patch in place (toggle editable, reflect the attribute,
 *                re-report content, swap the modal bridge).
 *
 * The content model is ONE ProseMirror document (the engine's). `format` is the
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
 * `el.value` is the LIVE content (serialized in `format`; assigning replaces the
 * document). The `value` ATTRIBUTE is the initial / default content —
 * `el.defaultValue`, like a native input's `defaultValue`.
 */
import {
  BlissElement,
  toBool,
  toCustom,
  toEnum,
  toFunction,
  toText,
  adoptStyles,
  type EventDef,
  type InputDef,
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
  type EditorEventMap,
  type EditorActionEventDetail,
  type ChangeEventDetail,
  type ReadyEventDetail,
  type ViewModeChangeEventDetail,
  type LockChangeEventDetail,
} from './interaction';
import { createActionHost } from './ui/actions';
import { ViewLayout } from './ui/view-layout';
import { EditorChrome } from './ui/chrome';
import styles from './css/editor.css?inline';
import { initLogger, contentLogger } from './logger';

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

const VIEW_MODES = ['edit', 'split', 'preview', 'inline'] as const;
const FORMATS = ['markdown', 'html', 'json'] as const;
const TOOLBARS = ['top', 'bottom', 'start', 'end', 'none'] as const;
const STATUSBARS = ['none', 'top', 'bottom', 'both'] as const;

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
      'Initial / default content, interpreted per `format` (like a native input’s `value` attribute ↔ `defaultValue`). Changing it replaces the document. The live content is the `value` PROPERTY.',
  },
  {
    configKey: 'format',
    attribute: 'format',
    converter: toEnum(FORMATS, { default: 'markdown' }),
    shouldReflect: true,
    on: 'update',
    description:
      "Serialization lens for content I/O (the `value` attribute and property, the `change` event): 'markdown' (default), 'html', or 'json'. Switching it re-reports the SAME document in the new format — it never rebuilds the document.",
  },
  {
    configKey: 'viewMode',
    attribute: 'view-mode',
    converter: toEnum(VIEW_MODES, { default: 'edit' }),
    shouldReflect: true,
    on: 'update',
    description:
      "Presentation: 'edit' (default), 'split' (editor + live output), 'preview' (read-only render), or 'inline' (overlay chrome on a live-page element). `preview` forces read-only. Full layouts arrive in Phase 3; for now the view mode is stored, reflected, and announced via `view-mode-change`.",
  },
  {
    configKey: 'isReadonly',
    attribute: 'readonly',
    converter: toBool('default-false'),
    on: 'update',
    description: 'Make the editor read-only (no input). `view-mode="preview"` also forces this on.',
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
    converter: toText({ isNullable: true }),
    shouldReflect: true,
    on: 'update',
    description: 'Theme name, reflected to the host attribute for CSS theming (`:host([theme="…"])`).',
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
    configKey: 'beforeActionCallback',
    converter: toFunction(),
    default: null,
    on: 'none',
    description:
      'Property only. `(detail) => false | void` (may be async) — runs first on every toolbar / selection-toolbar / context-menu activation, with the `action` event detail. Return `false` to cancel: no `onClick`, no `action` event, no command. Keyboard shortcuts do not pass through it.',
  },
  {
    configKey: 'interactionHost',
    converter: toCustom<InteractionHost | null>(() => null, { validate: isInteractionHost }),
    default: null,
    on: 'update',
    description:
      'Property only. The modal bridge interactive pipeline stages call: `{ request(ctx) }`, `ctx` = the request (`kind`, `title`, `message`, `payload`) + `signal` + `controller` / `element`. Default: a `window.confirm`-backed host. Survives engine rebuilds (e.g. a `plugins` reassignment).',
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
      'The document changed (or `format` switched). `detail`: `{ value, format }` — the content serialized in the active `format`. Twin: `onChange(detail)`.',
  },
  {
    name: 'ready',
    description:
      'The editor was built and is live for the first time (once per element lifetime; core `BlissElement`). Fires right after the first build — during upgrade for a normal element, or when the `defer` gate is released (`el.release()` / removing `defer`). The host then has the `ready` attribute and matches `:state(ready)`; `el.whenReady()` resolves. `detail`: `controller` / `element`. Twin: `onReady(detail)`.',
  },
  {
    name: 'view-mode-change',
    description: 'The `viewMode` (attribute `view-mode`) changed. `detail`: `{ viewMode }`. Twin: `onViewModeChange(detail)`.',
  },
  {
    name: 'lock-change',
    description:
      'A gating pipeline (e.g. the cloud-image `image:browser:pick`) locked the editor for its run, or released it. `detail`: `{ isLocked }`. Twin: `onLockChange(detail)`.',
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

  // Type-only: core installs the managed accessors at runtime (§12.5). Each
  // twin is called with the event detail (not the CustomEvent).
  declare onChange: ((detail: ChangeEventDetail) => void) | null;
  declare onReady: ((detail: ReadyEventDetail) => void) | null;
  declare onViewModeChange: ((detail: ViewModeChangeEventDetail) => void) | null;
  declare onLockChange: ((detail: LockChangeEventDetail) => void) | null;
  declare onAction: ((detail: EditorActionEventDetail) => void) | null;
  /** `false` (sync or async) cancels a toolbar / menu activation. */
  declare beforeActionCallback: ((detail: EditorActionEventDetail) => unknown) | null;
  /** The modal bridge for interactive pipeline stages. */
  declare interactionHost: InteractionHost | null;
  /** Initial / default content (attribute `value`); the live content is {@link value}. */
  declare defaultValue: string | null;

  #shadow: ShadowRoot;
  #layout: ViewLayout;
  #engine?: EditorEngine;
  #chrome?: EditorChrome;
  #unsubscribe?: () => void;
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
    // `el.value = …` assigned before upgrade is an own data property shadowing the
    // `value` accessor: lift it off and apply it like a pre-build `setValue()`.
    if (Object.prototype.hasOwnProperty.call(this, 'value')) {
      const pre = (this as { value?: unknown }).value;
      delete (this as { value?: unknown }).value;
      if (typeof pre === 'string') {
        this.#pendingSet = { value: pre, format: this.#format(), valueAtSet: this.config.defaultValue };
      }
    }
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
    if ('viewMode' in partial) {
      this.emit('view-mode-change', { viewMode: this.config.viewMode as EditorViewMode });
    }
    // `format` changed: the document is unchanged, but its reported serialization
    // is — re-announce so split-view / bound consumers refresh their output.
    if ('format' in partial && this.#engine) {
      this.emit('change', this.#changeDetail());
    }
    if ('interactionHost' in partial) {
      this.#engine?.setInteractionHost(this.#interactionHost());
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
      host: { element: this, getController: () => this.controller },
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
      this.emit('change', this.#changeDetail());
    });
    const offLock = engine.events.on('lock', ({ isLocked }) => this.emit('lock-change', { isLocked }));
    this.#unsubscribe = () => {
      offChange();
      offLock();
    };
    this.#layout.refreshOutput(); // initial fill (engine now exists)

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

  #teardownEngine(): void {
    this.#chrome?.destroy();
    this.#chrome = undefined;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#engine?.destroy();
    this.#engine = undefined;
    engines.delete(this);
  }

  /** (Re)arrange the shadow layout for the current view mode + anchor + toolbar + status side. */
  #applyLayout(): void {
    this.#layout.render(
      this.config.viewMode as EditorViewMode,
      (this.config.anchor as string | null) ?? null,
      this.config.toolbar as EditorToolbar,
      this.config.statusbar as EditorStatusBar
    );
  }

  /** Push the current editable + toolbar + status-bar settings into the chrome. */
  #applyChromeState(): void {
    this.#chrome?.setState({
      isEditable: this.#resolveEditable(),
      isToolbarShown: (this.config.toolbar as EditorToolbar) !== 'none',
      status: this.config.statusbar as EditorStatusBar,
    });
  }

  /** Map a content string + format onto the matching engine option. */
  #applyContentOption(options: EditorEngineOptions, format: EditorFormat, content: string | null): void {
    if (content == null || content === '') return; // engine falls back to the default doc
    try {
      if (format === 'json') options.json = JSON.parse(content);
      else if (format === 'html') options.html = content;
      else options.markdown = content;
    } catch (err) {
      contentLogger.warn(`<km-editor> could not parse initial ${format} content; starting empty`, err);
    }
  }

  #resolveEditable(): boolean {
    const isReadonly = this.config.isReadonly === true;
    const previewing = this.config.viewMode === 'preview';
    return !isReadonly && !previewing;
  }

  #format(): EditorFormat {
    return (this.config.format as EditorFormat) ?? 'markdown';
  }

  #changeDetail(): { value: string; format: EditorFormat } {
    return { value: this.#engine!.serialize(this.#format()), format: this.#format() };
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
      setValue: (value: string, format?: EditorFormat) => el.setValue(value, format),
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
    if (typeof command === 'string') return engine.commands.run(command);
    const view = engine.view;
    const ok = command(view.state, view.dispatch, view);
    view.focus();
    return ok;
  }

  // ── public content API (not inputs) ───────────────────────────────────────

  /**
   * The live content, serialized in the active `format` (`''` before the first
   * build). Assigning replaces the document, parsed in `format` — like
   * `setValue(value)`. The `value` ATTRIBUTE is the initial content
   * ({@link defaultValue}) and is never written.
   */
  get value(): string {
    this.flush();
    return this.#engine ? this.#engine.serialize(this.#format()) : '';
  }
  set value(value: string) {
    this.setValue(value ?? '');
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
   * one) — the `value` setter with an explicit format, and the controller's write path.
   */
  setValue(value: string, format?: EditorFormat): void {
    this.flush();
    const fmt = format ?? this.#format();
    if (this.#engine) {
      if (fmt === 'json') this.#engine.setJSON(JSON.parse(value));
      else this.#engine.setContent(value, fmt);
    } else {
      // No engine yet (before the first build): the build loads it — unless `value` is reassigned in the meantime.
      this.#pendingSet = { value, format: fmt, valueAtSet: this.config.defaultValue };
    }
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
    this.#teardownEngine();
    this.#layout.destroy();
  }
}

// Importing this module registers the element (back-compat contract). The full
// global-API publish + logger wiring happens in index.ts via registerComponent();
// both defines are idempotent, so importing either path works.
if (typeof customElements !== 'undefined' && !customElements.get('km-editor')) {
  customElements.define('km-editor', KmEditorElement);
}
