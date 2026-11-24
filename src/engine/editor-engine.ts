/**
 * EditorEngine — the headless core.
 *
 * Owns the ProseMirror view/state, the document schema, the command registry,
 * and the event bus, and exposes the HTML/Markdown/JSON serialization API. In
 * Phase 5 it ASSEMBLES itself from a plugin set (`plugins`, defaulting to
 * the first-party plugins): schema, commands, ProseMirror plugins, keymaps,
 * Markdown I/O, and toolbar/menu items are all merged from the plugins in
 * dependency order. It has no UI-framework dependency; the `<km-editor>` Web
 * Component is a thin shell over this class.
 */
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state';
import { EditorView, type DirectEditorProps } from 'prosemirror-view';
import { Node as PMNode, type Schema } from 'prosemirror-model';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';

import { buildSchema } from '../schema';
import { placeholderPlugin, placeholderKey } from './placeholder';
import { EventEmitter } from './event-emitter';
import { CommandRegistry } from './command-registry';
import { registerCoreCommands, registerViewModeCommands } from './default-commands';
import {
  type EditorPlugin,
  orderPlugins,
  mergeSchemaSpecs,
  assembleItems,
  assembleGroups,
  assembleStatusItems,
} from './plugin';
import { defaultPlugins } from './default-plugins';
import { assemblePipelines } from './pipeline/assemble';
import { PipelineRegistry, defaultInteractionHost } from './pipeline/registry';
import type { InteractionHost } from './pipeline/types';
import { buildMarkdownIO, type MarkdownIO } from './markdown-io';
import {
  coreToolbarGroups,
  coreHistoryGroups,
  coreSelectionItems,
  coreMenuItems,
  coreMenuHistoryItems,
  coreStatusItems,
  viewModeGroup,
  type ToolGroup,
  type StatusItem,
} from '../ui/items';
import type { EditorController, EditorLabelContext, EditorToolbarEntry } from '../interaction';
import type { EditorViewMode } from '../web-component';
import { createEditorLabels, type EditorLabels, type LabelResolver } from '../labels';
import type { TranslateCallback } from '@keenmate/web-components-core/locale';
import { ENGINE_DEFAULTS, type EditorEngineDefaults } from '../inputs';
import { initLogger } from '../logger';
import {
  docToHTML,
  htmlToDoc,
  docToJSON,
  docToMarkdown,
  markdownToDoc,
  type DocJSON,
  type SerializationFormat,
} from './serialization';

/**
 * Read-only (`contenteditable="false"`) must stay focusable — keyboard scroll, select-all,
 * copy — like a native readonly control (core SPEC §6.4); disabled is unaffected (the host
 * makes the whole surface `inert`). ProseMirror skips its keymaps while not editable, so
 * select-all is handled here, as a native DOM selection: the browser's own copy takes it in
 * every engine (Firefox / WebKit don't target a non-editable shadow surface with the copy
 * event, so ProseMirror's copy handler never sees it there).
 */
const readOnlyKeyboardProps: Pick<DirectEditorProps, 'handleDOMEvents'> = {
  handleDOMEvents: {
    keydown: (view, event) => {
      if (view.editable || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
      if (event.key.toLowerCase() !== 'a') return false;
      const root = view.root as ShadowRoot & { getSelection?: () => Selection | null };
      const selection = (root.getSelection ? root.getSelection() : null) ?? document.getSelection();
      selection?.selectAllChildren(view.dom);
      event.preventDefault();
      return true;
    },
  },
};

/**
 * The `<km-editor>` element hosting an engine. With a host, every ctx the engine
 * builds ({@link EditorEngine.createContext} — command predicates, status items,
 * toolbar items, interaction requests) carries `controller` + `element`.
 */
export interface EditorEngineHost {
  element: HTMLElement;
  getController(): EditorController;
  /**
   * The view-mode port. With it the engine registers the `view-edit` / `view-split` /
   * `view-preview` commands + the trailing `view` tool group, and hands plugins a
   * `setViewMode` (setup ctx + stage services) that reports `source: 'plugin'`.
   */
  viewMode?: {
    get(): EditorViewMode;
    /** `'command'` = a view-mode command ran (toolbar / `runCommand`); `'plugin'` = a plugin / stage port. */
    set(mode: EditorViewMode, via: 'command' | 'plugin'): void;
  };
  /**
   * The editing surface's accessible name (`aria-label`): the host's own name (its `aria-label`, or the
   * text of its `<label>`s). `null` / absent → the engine's `ariaLabels.editor` label.
   */
  getAccessibleName?(): string | null;
  /** Whether the host is (effectively) disabled — the surface then says `aria-disabled="true"`, not `aria-readonly`. */
  isDisabled?(): boolean;
  /**
   * The host's read-only state as callbacks see it (`ctx.isReadonly`: `readonly` or previewing — not disabled, that
   * is `ctx.isDisabled`). Absent → the engine's `isReadonly` option.
   */
  isReadonly?(): boolean;
}

/** `new EditorEngine(mount, options)` — the element the view mounts into is the first argument, not an option. */
export interface EditorEngineOptions {
  /** Initial content — provide at most one of these (data, construction-only; not kept in `getOptions()`). */
  doc?: PMNode;
  html?: string;
  markdown?: string;
  json?: DocJSON;
  /**
   * Editor plugin set (schema/commands/serializers/…) — `<km-editor>`'s `plugins`, same
   * default (`defaultPlugins()`, the first-party set). Construction-only.
   */
  plugins?: EditorPlugin[];
  /** Extra raw ProseMirror plugins appended after the assembled stack. Construction-only. */
  prosemirrorPlugins?: Plugin[];
  /** Override the document schema (defaults to one assembled from `plugins`). Construction-only. */
  schema?: Schema;
  /** The element hosting this engine (set by `<km-editor>`; omit standalone). Construction-only. */
  host?: EditorEngineHost;
  /**
   * Read-only (no editing) — `<km-editor>`'s `isReadonly`, same default (`false`, editable). Live:
   * `setOptions({ isReadonly })`. A gating pipeline's lock is separate state — `isEditable()` answers both.
   */
  isReadonly?: boolean;
  /** Host modal bridge for interactive pipeline stages (`<km-editor>`'s `interactionHost`). Default (`null`):
   * a core `/dialog` confirmation host. Live: `setOptions({ interactionHost })`. */
  interactionHost?: InteractionHost | null;
  /**
   * UI-string overrides — `<km-editor>`'s `labels` (same keys, default `null` = English). Live:
   * `setOptions({ labels })` (redraws the empty-document placeholder; redraw your own UI).
   */
  labels?: EditorLabels | null;
  /**
   * BCP-47 locale for the numbers the engine's labels format (the `{ctx.count}` of `labels.words` / `labels.chars`:
   * `1234` → `1.234` for `'de'`) and the `locale` a `translateCallback` gets — `<km-editor>`'s `locale`, same
   * default (`null` = unset: the page-wide `window.components.locale.locale`, else the browser; `'auto'` = unset).
   * Live: `setOptions({ locale })` (then redraw your UI).
   */
  locale?: string | null;
  /**
   * Translate a UI string for a key `labels` did not set (core `/locale` `TranslateCallback`:
   * `({ component, key: 'km-editor.<key>', template, params, locale }) => string | null`; `null` = not mine →
   * the next rule). The same order as the element: instance labels → page dictionary → this → the
   * page-wide `window.components.locale.translateCallback` → built-in. `<km-editor>`'s `translateCallback`, same
   * default (`null`); `<km-editor>` passes its own. Live: `setOptions({ translateCallback })`.
   */
  translateCallback?: TranslateCallback | null;
}

/** The option keys `setOptions()` applies (the rest are construction-only). */
const SETTING_KEYS = Object.keys(ENGINE_DEFAULTS) as (keyof EditorEngineDefaults)[];

export interface EngineEventMap {
  change: EditorEngine;
  'selection-change': EditorEngine;
  transaction: { tr: Transaction; engine: EditorEngine };
  ready: EditorEngine;
  destroy: EditorEngine;
  /** A gating pipeline locked / unlocked the surface for the duration of a run. */
  lock: { engine: EditorEngine; isLocked: boolean };
  /** A deferred pipeline outlived its loader threshold (`isPending: true`), or the
   * last such run settled (`false`). Drives the host's pending loader. */
  pending: { engine: EditorEngine; isPending: boolean };
}

export class EditorEngine {
  readonly schema: Schema;
  readonly commands: CommandRegistry;
  /** The engine events. A throwing handler is logged against the host element (core `notifyListeners`) and skipped. */
  readonly events = new EventEmitter<EngineEventMap>(() => this.#options.host?.element ?? null);
  /** Assembled presenter lists (core + plugin), consumed by the chrome. */
  readonly toolbarGroups: ToolGroup[];
  /** Flattened toolbar commands (groups → items), for consumers wanting a flat list. */
  readonly toolbarItems: EditorToolbarEntry[];
  readonly selectionItems: EditorToolbarEntry[];
  readonly menuItems: EditorToolbarEntry[];
  readonly statusItems: StatusItem[];
  /**
   * Resolve a UI string: the `labels` option → built-in English → `fallback`.
   * Every ctx the engine builds carries it as `ctx.label` (non-enumerable).
   */
  readonly label: LabelResolver;
  view: EditorView;

  /** The merged options ({@link getOptions}): settings filled from `ENGINE_DEFAULTS`, no initial content. */
  #options: EditorEngineOptions;
  /** True while a gating pipeline run locks the surface (independent of `isReadonly`). */
  #isLocked = false;
  /** False between deactivate() and activate() (the host element is detached). */
  #isActive = true;
  #plugins: EditorPlugin[];
  #markdown: MarkdownIO;
  #pipelines: PipelineRegistry;
  #interactionHost: InteractionHost;
  /** Names of deferred pipelines whose run is past its loader threshold. */
  #pendingNames = new Set<string>();
  /** Prototype of every ctx: `controller` / `element` getters when hosted (inherited ⇒ non-enumerable). */
  #ctxProto: object;

  constructor(mount: HTMLElement, options: EditorEngineOptions = {}) {
    const host = options.host;
    // The initial content is data, not an option to keep. Every setting `<km-editor>` also has defaults like
    // the element (one source: its input table, C-CA-37).
    const { doc: _doc, html: _html, markdown: _markdown, json: _json, ...kept } = options;
    this.#options = kept;
    for (const key of SETTING_KEYS) {
      if (kept[key] === undefined) (kept as Record<string, unknown>)[key] = ENGINE_DEFAULTS[key];
    }
    const { label, labels } = createEditorLabels(
      () => this.#options.labels,
      host?.element,
      () => this.#options.translateCallback,
      () => this.#options.locale,
    );
    this.label = label;
    // The render state every ctx carries (EditorRenderContext), read live — non-enumerable like `label`.
    this.#ctxProto = Object.create(Object.prototype, {
      label: { value: label, enumerable: false },
      labels: { value: labels, enumerable: false },
      isReadonly: { get: () => (host?.isReadonly ? host.isReadonly() : !!this.#options.isReadonly), enumerable: false },
      isDisabled: { get: () => !!host?.isDisabled?.(), enumerable: false },
      ...(host
        ? {
            controller: { get: () => host.getController(), enumerable: false },
            element: { get: () => host.element, enumerable: false },
          }
        : {}),
    });

    const plugins = orderPlugins(options.plugins ?? defaultPlugins());
    this.#plugins = plugins;

    const schema = options.schema ?? buildSchema(mergeSchemaSpecs(plugins));
    this.schema = schema;
    const ctx = { schema, label };

    // Markdown I/O — enforces the serializer contract (throws if a node/mark has
    // no Markdown serializer).
    this.#markdown = buildMarkdownIO(schema, plugins);

    // Commands: core + each plugin's.
    this.commands = new CommandRegistry(
      () => this.view,
      (fields) => this.createContext(fields)
    );
    registerCoreCommands(this.commands, schema, label);
    const viewMode = host?.viewMode;
    if (viewMode) {
      registerViewModeCommands(this.commands, {
        getViewMode: () => viewMode.get(),
        setViewMode: (mode) => viewMode.set(mode, 'command'),
      });
    }
    // The plugin-facing view-mode switch (setup ctx + stage services): `source: 'plugin'`.
    const setViewModeForPlugin = viewMode ? (mode: EditorViewMode) => viewMode.set(mode, 'plugin') : undefined;
    for (const plugin of plugins) {
      const specs = plugin.commands?.(ctx);
      if (specs) this.commands.registerMany(specs);
    }

    // Pipelines: every command auto-wraps into a one-stage sync pipeline; plugins
    // add/override pipelines and splice stages by anchor. Firing a command id runs
    // its pipeline (hooks apply), so toolbar / keymap / `run()` share one path.
    this.#interactionHost = this.#options.interactionHost ?? defaultInteractionHost();
    const commandSpecs = this.commands.ids().map((id) => this.commands.get(id)!);
    const pipelineMap = assemblePipelines(plugins, commandSpecs);
    // A declared-pipeline-only name (no backing command) still needs a command
    // entry so the chrome can present/enable its button.
    for (const name of pipelineMap.keys()) {
      if (!this.commands.has(name)) this.commands.register({ id: name, run: () => true, getIsEnabledCallback: () => true });
    }
    this.#pipelines = new PipelineRegistry(pipelineMap, {
      getView: () => this.view,
      getContext: () => ({ doc: this.view.state.doc, extra: {} }),
      // Every request carries the component context when hosted.
      getInteractionHost: () => ({
        request: (ctx) => this.#interactionHost.request(this.createContext(ctx)),
      }),
      setLock: (locked) => this.#setLock(locked),
      getLogSource: () => host?.element ?? null,
      label,
      ...(setViewModeForPlugin ? { setViewMode: setViewModeForPlugin } : {}),
    });
    this.commands.attachRunner((id) => this.#pipelines.run(id));
    this.#pipelines.onAny((name, event) => {
      if (event.type !== 'status') return;
      const wasPending = this.#pendingNames.size > 0;
      if (event.status.phase === 'pending') this.#pendingNames.add(name);
      else this.#pendingNames.delete(name);
      const isPending = this.#pendingNames.size > 0;
      if (isPending !== wasPending) this.events.emit('pending', { engine: this, isPending });
    });

    // Presenter lists: core-leading + plugin + core-trailing.
    // Hosted: the view-mode group trails everything (the far end of the toolbar).
    this.toolbarGroups = assembleGroups(plugins, coreToolbarGroups, [
      ...coreHistoryGroups,
      ...(viewMode ? [viewModeGroup(() => viewMode.get())] : []),
    ]);
    this.toolbarItems = this.toolbarGroups.flatMap((g) => [...g.items]);
    this.selectionItems = assembleItems(plugins, 'selectionItems', coreSelectionItems);
    this.menuItems = assembleItems(plugins, 'menuItems', coreMenuItems, coreMenuHistoryItems);
    this.statusItems = assembleStatusItems(plugins, coreStatusItems);

    const doc = this.resolveInitialDoc(options, schema);
    const state = EditorState.create({
      schema,
      doc,
      plugins: [
        history(),
        // Keybindings fire through the pipeline registry (hooks apply on keypress
        // too). A trivial command wrapper behaves exactly like the raw command.
        this.#pipelineKeymap(),
        // Plugin ProseMirror plugins (table editing, decorations, …).
        ...plugins.flatMap((p) => p.pmPlugins?.(ctx) ?? []),
        // Plugin structural keymaps (e.g. table Tab) — before the core list keymap
        // so an in-table Tab wins and a list Tab falls through.
        ...plugins.flatMap((p) => {
          const km = p.keymap?.(ctx);
          return km ? [keymap(km)] : [];
        }),
        keymap({
          Enter: splitListItem(schema.nodes.list_item),
          Tab: sinkListItem(schema.nodes.list_item),
          'Shift-Tab': liftListItem(schema.nodes.list_item),
        }),
        keymap(baseKeymap),
        // `labels.placeholder` while the document is empty ('' = off).
        placeholderPlugin(() => this.label('placeholders.document')),
        ...(options.prosemirrorPlugins ?? []),
      ],
    });

    this.view = new EditorView(mount, {
      state,
      editable: () => this.isEditable(),
      attributes: () => this.#surfaceAttributes(),
      ...readOnlyKeyboardProps,
      dispatchTransaction: (tr) => {
        const newState = this.view.state.apply(tr);
        this.view.updateState(newState);
        this.#keepInactive();
        this.events.emit('transaction', { tr, engine: this });
        if (tr.docChanged) this.events.emit('change', this);
        if (tr.selectionSet || tr.docChanged) this.events.emit('selection-change', this);
      },
    });

    try {
      for (const plugin of plugins) {
        plugin.setup?.({
          schema,
          label: this.label,
          view: this.view,
          getState: () => this.view.state,
          ...(setViewModeForPlugin ? { setViewMode: setViewModeForPlugin } : {}),
        });
      }
    } catch (err) {
      // A failed setup must not leave a live half-built view (DOM + document
      // listeners) behind — the caller keeps whatever editor it had (ED-9).
      this.#pipelines.dispose();
      this.view.destroy();
      throw err;
    }

    this.events.emit('ready', this);
  }

  private resolveInitialDoc(options: EditorEngineOptions, schema: Schema): PMNode {
    if (options.doc) return options.doc;
    if (options.html != null) return htmlToDoc(options.html, schema);
    if (options.markdown != null) return markdownToDoc(options.markdown, this.#markdown.parser);
    if (options.json != null) return PMNode.fromJSON(schema, options.json);
    // No content → an empty document (one empty paragraph).
    return schema.topNodeType.createAndFill()!;
  }

  get state(): EditorState {
    return this.view.state;
  }

  /**
   * Build a callback ctx from `fields`. Hosted by `<km-editor>`, it carries
   * `controller` + `element` (inherited getters — non-enumerable, so
   * `JSON.stringify` / `Object.keys` see only the fields). Every ctx also
   * inherits `label` ({@link label}) and the render state `labels` / `isReadonly` / `isDisabled`
   * (`EditorRenderContext`, read live), hosted or standalone.
   */
  createContext<T extends object>(fields: T): T & EditorLabelContext {
    return Object.assign(Object.create(this.#ctxProto), fields) as T & EditorLabelContext;
  }

  // ── Pipelines (Phase 7) ───────────────────────────────────────────────
  /** The named pipeline registry (commands + plugin pipelines). */
  get pipelines(): PipelineRegistry {
    return this.#pipelines;
  }
  /** Whether any deferred pipeline run is past its loader threshold (see the `pending` event). */
  get isPending(): boolean {
    return this.#pendingNames.size > 0;
  }
  /** Fire a pipeline / command by name. Sync → returns whether it resolved;
   * deferred → kicks off async and returns `true`. */
  run(name: string): boolean {
    return this.#pipelines.run(name);
  }
  /**
   * Re-render view decorations / attributes that read live settings (e.g. the
   * `labels.placeholder` text) without touching the document.
   */
  refreshView(): void {
    this.view.dispatch(this.view.state.tr.setMeta(placeholderKey, 'refresh').setMeta('addToHistory', false));
  }

  // ── Options (rulebook C-CA-39) ────────────────────────────────────────
  /**
   * The merged options — the construction options (minus the initial content) with every setting filled from
   * the element's defaults and every {@link setOptions} applied. The live object, read-only: change it through
   * `setOptions()`.
   */
  getOptions(): Readonly<EditorEngineOptions> {
    return this.#options;
  }

  /**
   * Merge `partial` into the current settings and apply only what changed, in place (no rebuild — the document,
   * selection and undo history stay): `isReadonly` re-evaluates the view's editability, `interactionHost`
   * swaps the dialog bridge, `labels` / `locale` / `translateCallback` redraw the empty-document placeholder
   * (redraw your own UI). A key set to `undefined` resets it to the default. A construction-only key
   * (`plugins`, `schema`, `host`, the initial content, …) is ignored with a warning — build a new engine.
   */
  setOptions(partial: Partial<EditorEngineOptions>): void {
    const changed = new Set<keyof EditorEngineDefaults>();
    for (const key of Object.keys(partial) as (keyof EditorEngineDefaults)[]) {
      if (!SETTING_KEYS.includes(key)) {
        initLogger.warn(`EditorEngine.setOptions(): "${String(key)}" is construction-only — ignored (build a new engine)`);
        continue;
      }
      const value = partial[key] === undefined ? ENGINE_DEFAULTS[key] : partial[key];
      if (Object.is(this.#options[key], value)) continue;
      (this.#options as Record<string, unknown>)[key] = value;
      changed.add(key);
    }
    if (changed.has('interactionHost')) this.#interactionHost = this.#options.interactionHost ?? defaultInteractionHost();
    if (changed.has('isReadonly')) this.#reconcileEditable();
    if (changed.has('labels') || changed.has('locale') || changed.has('translateCallback')) this.refreshView();
  }

  /** Build the PM keymap, binding each command's keys to firing its pipeline. */
  #pipelineKeymap(): Plugin {
    const bindings: Record<string, () => boolean> = {};
    for (const id of this.commands.ids()) {
      const spec = this.commands.get(id);
      for (const key of spec?.keys ?? []) bindings[key] = () => this.#pipelines.run(id);
    }
    return keymap(bindings);
  }

  /** Lock / unlock editing for a gating run (separate state — `isReadonly` is never touched). */
  #setLock(isLocked: boolean): void {
    if (isLocked !== this.#isLocked) {
      this.#isLocked = isLocked;
      this.#reconcileEditable();
    }
    this.events.emit('lock', { engine: this, isLocked });
  }

  // ── Serialization (read) ──────────────────────────────────────────────
  getHTML(): string {
    return docToHTML(this.state.doc, this.schema);
  }
  getMarkdown(): string {
    return docToMarkdown(this.state.doc, this.#markdown.serializer);
  }
  getJSON(): DocJSON {
    return docToJSON(this.state.doc);
  }
  /** Serialize to a string in any format (JSON pretty-printed). */
  serialize(format: SerializationFormat): string {
    switch (format) {
      case 'html':
        return this.getHTML();
      case 'markdown':
        return this.getMarkdown();
      case 'json':
        return JSON.stringify(this.getJSON(), null, 2);
    }
  }

  // ── Serialization (write) ─────────────────────────────────────────────
  setHTML(html: string): void {
    this.replaceDoc(htmlToDoc(html, this.schema));
  }
  setMarkdown(markdown: string): void {
    this.replaceDoc(markdownToDoc(markdown, this.#markdown.parser));
  }
  setJSON(json: DocJSON): void {
    this.replaceDoc(PMNode.fromJSON(this.schema, json));
  }
  setContent(value: string, format: SerializationFormat): void {
    if (format === 'html') this.setHTML(value);
    else if (format === 'markdown') this.setMarkdown(value);
    else this.setJSON(JSON.parse(value) as DocJSON);
  }

  private replaceDoc(doc: PMNode): void {
    const state = EditorState.create({
      schema: this.schema,
      doc,
      plugins: this.state.plugins as Plugin[],
    });
    this.view.updateState(state);
    this.#keepInactive();
    this.events.emit('change', this);
  }

  focus(): void {
    this.view.focus();
  }

  /** Whether the editor currently accepts input: not `isReadonly` and not locked by a gating pipeline run. */
  isEditable(): boolean {
    return !this.#options.isReadonly && !this.#isLocked;
  }

  /**
   * The editing surface's ARIA (WAI-ARIA textbox): `role="textbox"` + `aria-multiline`, an accessible name
   * (the host's, else `ariaLabels.editor`), `aria-readonly` while not editable (read-only, preview, a gating
   * lock) or `aria-disabled` while the host is disabled (`aria-required` is core's: it marks the validity anchor —
   * this surface — of a `required` host). `tabindex="0"` keeps a read-only surface focusable.
   * Re-read on every view update; {@link refreshAttributes} re-reads them without one.
   */
  #surfaceAttributes(): Record<string, string> {
    const host = this.#options.host;
    const attrs: Record<string, string> = {
      tabindex: '0',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': host?.getAccessibleName?.() || this.label('ariaLabels.editor'),
    };
    if (host?.isDisabled?.()) attrs['aria-disabled'] = 'true';
    else if (!this.isEditable()) attrs['aria-readonly'] = 'true';
    return attrs;
  }

  /** Re-read the editing surface's attributes (accessible name, read-only / disabled / required state) — no transaction. */
  refreshAttributes(): void {
    this.view.setProps({});
  }

  /** Re-evaluate the view's `editable` prop in place. */
  #reconcileEditable(): void {
    this.view.setProps({ editable: () => this.isEditable() });
    this.#keepInactive();
  }

  /**
   * Pause the view's live DOM tracking while its host is detached (a DOM move or
   * a held-but-removed element). ProseMirror's DOM observer keeps a
   * `selectionchange` listener on the owner document — left attached, it would
   * pin a removed editor in memory. The document, selection and undo history are
   * untouched; {@link activate} resumes tracking.
   */
  deactivate(): void {
    this.#isActive = false;
    this.#domObserver()?.stop();
  }

  /** Resume live DOM tracking after {@link deactivate} (idempotent). */
  activate(): void {
    this.#isActive = true;
    this.#domObserver()?.start();
  }

  /** The view restarts its observer around every DOM update — re-pause it while inactive. */
  #keepInactive(): void {
    if (!this.#isActive) this.#domObserver()?.stop();
  }

  // DEPENDENCY ON PROSEMIRROR INTERNALS: `EditorView.domObserver` (prosemirror-view's
  // private `DOMObserver`, with its `start()` / `stop()`) is not public API and not
  // in the typings; its start/stop pair is the one the view itself brackets every
  // DOM update with. If a prosemirror-view upgrade renames or removes it, this
  // returns undefined and deactivate()/activate() silently become no-ops — the
  // document `selectionchange` listener then pins a detached editor again.
  // `e2e/lifecycle.spec.ts` ("a detached editor releases its document listeners")
  // catches that; re-check it when bumping prosemirror-view.
  #domObserver(): { start(): void; stop(): void } | undefined {
    return (this.view as unknown as { domObserver?: { start(): void; stop(): void } }).domObserver;
  }

  destroy(): void {
    this.events.emit('destroy', this);
    this.#pipelines.dispose();
    for (const plugin of this.#plugins) plugin.destroy?.();
    this.view.destroy();
    this.events.clear();
  }
}
