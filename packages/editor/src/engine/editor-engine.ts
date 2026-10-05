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
import { buildMarkdownIO, type MarkdownIO } from './markdown-io';
import {
  coreToolbarGroups,
  coreHistoryGroups,
  coreSelectionItems,
  coreMenuItems,
  coreMenuHistoryItems,
  coreStatusItems,
  type ToolbarItem,
  type ToolGroup,
  type StatusItem,
} from '../ui/items';
import {
  docToHTML,
  htmlToDoc,
  docToJSON,
  docToMarkdown,
  markdownToDoc,
  type DocJSON,
  type SerializationFormat,
} from './serialization';

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
  editable?: boolean;
}

export interface EngineEventMap {
  change: EditorEngine;
  selectionUpdate: EditorEngine;
  transaction: { tr: Transaction; engine: EditorEngine };
  ready: EditorEngine;
  destroy: EditorEngine;
}

export class EditorEngine {
  readonly schema: Schema;
  readonly commands: CommandRegistry;
  readonly events = new EventEmitter<EngineEventMap>();
  /** Assembled presenter lists (core + plugin), consumed by the chrome. */
  readonly toolbarGroups: ToolGroup[];
  /** Flattened toolbar commands (groups → items), for consumers wanting a flat list. */
  readonly toolbarItems: ToolbarItem[];
  readonly selectionItems: ToolbarItem[];
  readonly menuItems: ToolbarItem[];
  readonly statusItems: StatusItem[];
  view: EditorView;

  private editable: boolean;
  #plugins: EditorPlugin[];
  #markdown: MarkdownIO;

  constructor(options: EditorEngineOptions) {
    const plugins = orderPlugins(options.editorPlugins ?? defaultPlugins());
    this.#plugins = plugins;

    const schema = options.schema ?? buildSchema(mergeSchemaSpecs(plugins));
    this.schema = schema;
    const ctx = { schema };

    // Markdown I/O — enforces the serializer contract (throws if a node/mark has
    // no Markdown serializer).
    this.#markdown = buildMarkdownIO(schema, plugins);

    // Commands: core + each plugin's.
    this.commands = new CommandRegistry(() => this.view);
    registerCoreCommands(this.commands, schema);
    for (const plugin of plugins) {
      const specs = plugin.commands?.(ctx);
      if (specs) this.commands.registerMany(specs);
    }

    // Presenter lists: core-leading + plugin + core-trailing.
    this.toolbarGroups = assembleGroups(plugins, coreToolbarGroups, coreHistoryGroups);
    this.toolbarItems = this.toolbarGroups.flatMap((g) => [...g.items]);
    this.selectionItems = assembleItems(plugins, 'selectionItems', coreSelectionItems);
    this.menuItems = assembleItems(plugins, 'menuItems', coreMenuItems, coreMenuHistoryItems);
    this.statusItems = assembleStatusItems(plugins, coreStatusItems);

    this.editable = options.editable ?? true;

    const doc = this.resolveInitialDoc(options, schema);
    const state = EditorState.create({
      schema,
      doc,
      plugins: [
        history(),
        this.commands.keymap(),
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
      editable: () => this.editable,
      dispatchTransaction: (tr) => {
        const newState = this.view.state.apply(tr);
        this.view.updateState(newState);
        this.events.emit('transaction', { tr, engine: this });
        if (tr.docChanged) this.events.emit('change', this);
        if (tr.selectionSet || tr.docChanged) this.events.emit('selectionUpdate', this);
      },
    });

    for (const plugin of plugins) {
      plugin.setup?.({ schema, view: this.view, getState: () => this.view.state });
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
    this.events.emit('change', this);
  }

  focus(): void {
    this.view.focus();
  }

  /** Whether the editor currently accepts input. */
  isEditable(): boolean {
    return this.editable;
  }

  /** Toggle read-only. Re-evaluates the view's `editable` prop in place. */
  setEditable(editable: boolean): void {
    if (editable === this.editable) return;
    this.editable = editable;
    this.view.setProps({ editable: () => this.editable });
  }

  destroy(): void {
    this.events.emit('destroy', this);
    for (const plugin of this.#plugins) plugin.destroy?.();
    this.view.destroy();
    this.events.clear();
  }
}
