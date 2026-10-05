/**
 * Editor assembly — builds the ProseMirror state (core plugins + keymaps) and
 * mounts an EditorView.
 *
 * This is the embryonic headless engine. Phase 1 grows it into an `EditorEngine`
 * class that owns the command registry, event bus, and the HTML/Markdown/JSON
 * serialization layer. For now it is a thin, behaviour-preserving factory.
 */
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { undo, redo, history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';

import { schema } from './schema';
import { promptForLink } from './commands';
import { syntaxHighlightPlugin } from './plugins/syntax-highlight';

export interface CreateEditorOptions {
  /** Initial document. Defaults to a short welcome document. */
  doc?: PMNode;
  /** Extra ProseMirror plugins appended after the core set. */
  plugins?: Plugin[];
}

export function createDefaultDoc(): PMNode {
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Welcome to the KeenMate Web Editor.')]),
    schema.node('paragraph', null, [
      schema.text(
        'Select text to see the floating toolbar, or use the toolbar above. The debug panel shows how the document and selection are tracked.'
      ),
    ]),
  ]);
}

export function createEditorState(options: CreateEditorOptions = {}): EditorState {
  const { doc = createDefaultDoc(), plugins = [] } = options;

  return EditorState.create({
    doc,
    plugins: [
      history(),

      // Table plugins (before keymap so Tab cell-navigation works).
      columnResizing(),
      tableEditing(),

      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Mod-b': toggleMark(schema.marks.bold),
        'Mod-i': toggleMark(schema.marks.italic),
        'Mod-u': toggleMark(schema.marks.underline),
        'Mod-k': promptForLink,
        Enter: splitListItem(schema.nodes.list_item),
        Tab: goToNextCell(1),
        'Shift-Tab': goToNextCell(-1),
      }),

      // Fallback Tab handling for lists (when not in a table).
      keymap({
        Tab: sinkListItem(schema.nodes.list_item),
        'Shift-Tab': liftListItem(schema.nodes.list_item),
      }),

      keymap(baseKeymap),

      syntaxHighlightPlugin,

      ...plugins,
    ],
  });
}

export function createEditor(mount: HTMLElement, options: CreateEditorOptions = {}): EditorView {
  const state = createEditorState(options);
  const view = new EditorView(mount, {
    state,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction));
    },
  });
  return view;
}
