/**
 * Core ProseMirror state assembly — history, table editing, structural keymaps,
 * base keymap, and syntax highlighting.
 *
 * Formatting / history keybindings (Mod-b, Mod-z, …) are NOT bound here; they are
 * owned by the CommandRegistry and injected by `EditorEngine`. This module only
 * handles the structural keys (Enter, Tab) that are not expressed as registry
 * commands. The `EditorEngine` is the sole owner of the EditorView.
 */
import { EditorState, type Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { columnResizing, tableEditing, goToNextCell } from 'prosemirror-tables';

import { schema } from './schema';
import { syntaxHighlightPlugin } from './plugins/syntax-highlight';

export interface CreateEditorStateOptions {
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
        'Select text to see the floating toolbar, or use the toolbar above. The output panel shows the live HTML / Markdown / JSON serialization.'
      ),
    ]),
  ]);
}

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  const { doc = createDefaultDoc(), plugins = [] } = options;

  return EditorState.create({
    doc,
    plugins: [
      history(),

      // Table plugins (before keymap so Tab cell-navigation works).
      columnResizing(),
      tableEditing(),

      // Structural keymap (non-command keys).
      keymap({
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
