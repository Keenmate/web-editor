/**
 * EditorEngine — the headless core.
 *
 * Owns the ProseMirror view/state, the document schema, the command registry,
 * and the event bus, and exposes the HTML/Markdown/JSON serialization API. It
 * has no UI-framework dependency; the `<km-editor>` Web Component (Phase 2) is a
 * thin shell over this class.
 */
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode, type Schema } from 'prosemirror-model';

import { schema as defaultSchema } from '../schema';
import { createEditorState, createDefaultDoc } from '../editor';
import { EventEmitter } from './event-emitter';
import { CommandRegistry } from './command-registry';
import { registerDefaultCommands } from './default-commands';
import {
  serialize,
  parse,
  docToHTML,
  docToJSON,
  docToMarkdown,
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
  /** Extra ProseMirror plugins appended after the core stack. */
  plugins?: Plugin[];
  /** Override the document schema (defaults to the built-in schema). */
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
  view: EditorView;
  private editable: boolean;

  constructor(options: EditorEngineOptions) {
    this.schema = options.schema ?? defaultSchema;
    this.editable = options.editable ?? true;
    this.commands = new CommandRegistry(() => this.view);
    registerDefaultCommands(this.commands, this.schema);

    const doc = this.resolveInitialDoc(options);
    const state = createEditorState({
      doc,
      plugins: [this.commands.keymap(), ...(options.plugins ?? [])],
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

    this.events.emit('ready', this);
  }

  private resolveInitialDoc(options: EditorEngineOptions): PMNode {
    if (options.doc) return options.doc;
    if (options.html != null) return parse(options.html, this.schema, 'html');
    if (options.markdown != null) return parse(options.markdown, this.schema, 'markdown');
    if (options.json != null) return PMNode.fromJSON(this.schema, options.json);
    return createDefaultDoc();
  }

  get state(): EditorState {
    return this.view.state;
  }

  // ── Serialization (read) ──────────────────────────────────────────────
  getHTML(): string {
    return docToHTML(this.state.doc, this.schema);
  }
  getMarkdown(): string {
    return docToMarkdown(this.state.doc);
  }
  getJSON(): DocJSON {
    return docToJSON(this.state.doc);
  }
  /** Serialize to a string in any format (JSON pretty-printed). */
  serialize(format: SerializationFormat): string {
    return serialize(this.state.doc, this.schema, format);
  }

  // ── Serialization (write) ─────────────────────────────────────────────
  setHTML(html: string): void {
    this.replaceDoc(parse(html, this.schema, 'html'));
  }
  setMarkdown(markdown: string): void {
    this.replaceDoc(parse(markdown, this.schema, 'markdown'));
  }
  setJSON(json: DocJSON): void {
    this.replaceDoc(PMNode.fromJSON(this.schema, json));
  }
  setContent(value: string, format: SerializationFormat): void {
    this.replaceDoc(parse(value, this.schema, format));
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
    // Force the view to re-read the `editable` prop (it's a function of this field).
    this.view.setProps({ editable: () => this.editable });
  }

  destroy(): void {
    this.events.emit('destroy', this);
    this.view.destroy();
    this.events.clear();
  }
}
