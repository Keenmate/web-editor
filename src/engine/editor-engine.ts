/**
 * EditorEngine — the headless core.
 *
 * Owns the ProseMirror view/state, the document schema, the command registry,
 * and the event bus, and exposes the HTML/Markdown/JSON serialization API. In
 * Phase 5 it ASSEMBLES itself from a plugin set (`editorPlugins`, defaulting to
 * the first-party plugins): schema, commands, ProseMirror plugins, keymaps,
 * Markdown I/O, and toolbar/menu items are all merged from the plugins in
 * dependency order. It has no UI-framework dependency; the `<km-editor>` Web
 * Component is a thin shell over this class.
 */
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode, type Schema } from 'prosemirror-model';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';

import { buildSchema } from '../schema';
import { createDefaultDoc } from '../editor';
import { EventEmitter } from './event-emitter';
import { CommandRegistry } from './command-registry';
import { registerCoreCommands } from './default-commands';
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
  type ToolGroup,
  type StatusItem,
} from '../ui/items';
import type { EditorComponentContext, EditorController, EditorToolbarEntry } from '../interaction';
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
 * The `<km-editor>` element hosting an engine. With a host, every ctx the engine
 * builds ({@link EditorEngine.createContext} — command predicates, status items,
 * toolbar items, interaction requests) carries `controller` + `element`.
 */
export interface EditorEngineHost {
  element: HTMLElement;
  getController(): EditorController;
}

export interface EditorEngineOptions {
  /** Element the editor view mounts into. */
  mount: HTMLElement;
  /** Initial content — provide at most one of these. */
  doc?: PMNode;
  html?: string;
  markdown?: string;
  json?: DocJSON;
  /** Extra raw ProseMirror plugins appended after the assembled stack. */
  plugins?: Plugin[];
  /** Editor plugin set (schema/commands/serializers/…). Defaults to the first-party set. */
  editorPlugins?: EditorPlugin[];
  /** Override the document schema (defaults to one assembled from `editorPlugins`). */
  schema?: Schema;
  /** Start read-only (no editing). Defaults to editable. */
  isEditable?: boolean;
  /** Host modal bridge for interactive pipeline stages. Defaults to a
   * `window.confirm`-backed host; inject a richer picker via this or
   * `setInteractionHost`. */
  interactionHost?: InteractionHost;
  /** The element hosting this engine (set by `<km-editor>`; omit standalone). */
  host?: EditorEngineHost;
}

export interface EngineEventMap {
  change: EditorEngine;
  'selection-change': EditorEngine;
  transaction: { tr: Transaction; engine: EditorEngine };
  ready: EditorEngine;
  destroy: EditorEngine;
  /** A gating pipeline locked / unlocked the surface for the duration of a run. */
  lock: { engine: EditorEngine; isLocked: boolean };
}

export class EditorEngine {
  readonly schema: Schema;
  readonly commands: CommandRegistry;
  readonly events = new EventEmitter<EngineEventMap>();
  /** Assembled presenter lists (core + plugin), consumed by the chrome. */
  readonly toolbarGroups: ToolGroup[];
  /** Flattened toolbar commands (groups → items), for consumers wanting a flat list. */
  readonly toolbarItems: EditorToolbarEntry[];
  readonly selectionItems: EditorToolbarEntry[];
  readonly menuItems: EditorToolbarEntry[];
  readonly statusItems: StatusItem[];
  view: EditorView;

  #isEditable: boolean;
  /** False between deactivate() and activate() (the host element is detached). */
  #isActive = true;
  #plugins: EditorPlugin[];
  #markdown: MarkdownIO;
  #pipelines: PipelineRegistry;
  #interactionHost: InteractionHost;
  /** Editability to restore when a gating lock releases. */
  #preLockIsEditable?: boolean;
  /** Prototype of every ctx: `controller` / `element` getters when hosted (inherited ⇒ non-enumerable). */
  #ctxProto: object;

  constructor(options: EditorEngineOptions) {
    const host = options.host;
    this.#ctxProto = host
      ? Object.create(Object.prototype, {
          controller: { get: () => host.getController(), enumerable: false },
          element: { get: () => host.element, enumerable: false },
        })
      : Object.prototype;

    const plugins = orderPlugins(options.editorPlugins ?? defaultPlugins());
    this.#plugins = plugins;

    const schema = options.schema ?? buildSchema(mergeSchemaSpecs(plugins));
    this.schema = schema;
    const ctx = { schema };

    // Markdown I/O — enforces the serializer contract (throws if a node/mark has
    // no Markdown serializer).
    this.#markdown = buildMarkdownIO(schema, plugins);

    // Commands: core + each plugin's.
    this.commands = new CommandRegistry(
      () => this.view,
      (fields) => this.createContext(fields)
    );
    registerCoreCommands(this.commands, schema);
    for (const plugin of plugins) {
      const specs = plugin.commands?.(ctx);
      if (specs) this.commands.registerMany(specs);
    }

    // Pipelines: every command auto-wraps into a one-stage sync pipeline; plugins
    // add/override pipelines and splice stages by anchor. Firing a command id runs
    // its pipeline (hooks apply), so toolbar / keymap / `run()` share one path.
    this.#interactionHost = options.interactionHost ?? defaultInteractionHost();
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
    });
    this.commands.attachRunner((id) => this.#pipelines.run(id));

    // Presenter lists: core-leading + plugin + core-trailing.
    this.toolbarGroups = assembleGroups(plugins, coreToolbarGroups, coreHistoryGroups);
    this.toolbarItems = this.toolbarGroups.flatMap((g) => [...g.items]);
    this.selectionItems = assembleItems(plugins, 'selectionItems', coreSelectionItems);
    this.menuItems = assembleItems(plugins, 'menuItems', coreMenuItems, coreMenuHistoryItems);
    this.statusItems = assembleStatusItems(plugins, coreStatusItems);

    this.#isEditable = options.isEditable ?? true;

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
        ...(options.plugins ?? []),
      ],
    });

    this.view = new EditorView(options.mount, {
      state,
      editable: () => this.#isEditable,
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
        plugin.setup?.({ schema, view: this.view, getState: () => this.view.state });
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
    return createDefaultDoc(schema);
  }

  get state(): EditorState {
    return this.view.state;
  }

  /**
   * Build a callback ctx from `fields`. Hosted by `<km-editor>`, it carries
   * `controller` + `element` (inherited getters — non-enumerable, so
   * `JSON.stringify` / `Object.keys` see only the fields); standalone it is
   * just the fields.
   */
  createContext<T extends object>(fields: T): T & EditorComponentContext {
    return Object.assign(Object.create(this.#ctxProto), fields) as T & EditorComponentContext;
  }

  // ── Pipelines (Phase 7) ───────────────────────────────────────────────
  /** The named pipeline registry (commands + plugin pipelines). */
  get pipelines(): PipelineRegistry {
    return this.#pipelines;
  }
  /** Fire a pipeline / command by name. Sync → returns whether it resolved;
   * deferred → kicks off async and returns `true`. */
  run(name: string): boolean {
    return this.#pipelines.run(name);
  }
  /** Replace the host modal bridge used by interactive pipeline stages. */
  setInteractionHost(host: InteractionHost): void {
    this.#interactionHost = host;
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

  /** Lock / unlock editing for a gating run, remembering the pre-lock state. */
  #setLock(isLocked: boolean): void {
    if (isLocked) {
      if (this.#preLockIsEditable === undefined) this.#preLockIsEditable = this.#isEditable;
      this.setEditable(false);
    } else {
      const restore = this.#preLockIsEditable ?? true;
      this.#preLockIsEditable = undefined;
      this.setEditable(restore);
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

  /** Whether the editor currently accepts input. */
  isEditable(): boolean {
    return this.#isEditable;
  }

  /** Toggle read-only. Re-evaluates the view's `editable` prop in place. */
  setEditable(isEditable: boolean): void {
    if (isEditable === this.#isEditable) return;
    this.#isEditable = isEditable;
    this.view.setProps({ editable: () => this.#isEditable });
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
