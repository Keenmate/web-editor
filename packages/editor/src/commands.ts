/**
 * Commands — functions of shape `(state, dispatch?, view?) => boolean`.
 *
 * Ported from the POC. In Phase 4 these fold into a CommandRegistry (each entry
 * gaining `isActive` / `isEnabled` / keybindings) that both the toolbar and the
 * context menu bind to; for now they are a plain name → command map, plus the
 * prompt-driven helpers used by the dev playground.
 */
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import {
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  addRowBefore,
  addRowAfter,
  deleteRow,
  mergeCells,
  splitCell,
  toggleHeaderRow,
  toggleHeaderColumn,
  deleteTable,
} from 'prosemirror-tables';
import { schema } from './schema';

// Insert an image at the current position.
export function insertImage(src, alt = '', title = '') {
  return (state, dispatch) => {
    const { tr, schema } = state;
    const node = schema.nodes.image.create({ src, alt, title });
    if (dispatch) {
      dispatch(tr.replaceSelectionWith(node).scrollIntoView());
    }
    return true;
  };
}

// Toggle or set a link on the selection.
export function toggleLink(href?, title = '') {
  return (state, dispatch) => {
    const { tr, selection, schema } = state;
    const { from, to } = selection;
    const linkMark = schema.marks.link;

    const hasLink = state.doc.rangeHasMark(from, to, linkMark);
    if (hasLink) {
      if (dispatch) dispatch(tr.removeMark(from, to, linkMark));
      return true;
    }

    if (!href) return false;

    if (dispatch) {
      const mark = linkMark.create({ href, title });
      dispatch(tr.addMark(from, to, mark));
    }
    return true;
  };
}

// Insert a table at the current position.
export function insertTable(rows = 3, cols = 3) {
  return (state, dispatch) => {
    const { tr, schema } = state;
    const tableRows = [];

    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        const cellType = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
        cells.push(cellType.createAndFill());
      }
      tableRows.push(schema.nodes.table_row.create(null, cells));
    }

    const table = schema.nodes.table.create(null, tableRows);
    if (dispatch) {
      dispatch(tr.replaceSelectionWith(table).scrollIntoView());
    }
    return true;
  };
}

// Insert a code block.
export function insertCodeBlock(language = 'javascript') {
  return (state, dispatch) => {
    const { tr, schema } = state;
    const node = schema.nodes.code_block.create({ language });
    if (dispatch) {
      dispatch(tr.replaceSelectionWith(node).scrollIntoView());
    }
    return true;
  };
}

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'css',
  'html',
  'json',
  'bash',
  'sql',
  'yaml',
  'markdown',
];

// Prompt for a code block language, then insert.
export function promptForCodeBlock(state, dispatch) {
  const language = prompt(`Enter language (${LANGUAGES.join(', ')}):`, 'javascript');
  if (!language) return false;
  return insertCodeBlock(language.toLowerCase())(state, dispatch);
}

// Change the language of the code block the cursor is in.
export function changeCodeBlockLanguage(state, dispatch) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'code_block') {
      const pos = $from.before(d);
      const language = prompt(`Change language (${LANGUAGES.join(', ')}):`, node.attrs.language);
      if (!language) return false;
      if (dispatch) {
        dispatch(state.tr.setNodeMarkup(pos, null, { language: language.toLowerCase() }));
      }
      return true;
    }
  }
  return false;
}

// Prompt for an image URL, then insert.
export function promptForImage(state, dispatch) {
  const src = prompt('Enter image URL:', 'https://picsum.photos/300/200');
  if (!src) return false;
  const alt = prompt('Enter alt text (optional):', '') || '';
  return insertImage(src, alt)(state, dispatch);
}

// Prompt for a link URL (or remove an existing link on the selection).
export function promptForLink(state, dispatch, view) {
  const { from, to, empty } = state.selection;

  if (empty) {
    alert('Please select some text first to create a link.');
    return false;
  }

  const hasLink = state.doc.rangeHasMark(from, to, schema.marks.link);
  if (hasLink) {
    return toggleLink()(state, dispatch);
  }

  const href = prompt('Enter link URL:', 'https://');
  if (!href) return false;
  return toggleLink(href)(state, dispatch);
}

// Name → command map consumed by the dev-playground toolbars.
export const commands: Record<string, any> = {
  // Text formatting
  bold: toggleMark(schema.marks.bold),
  italic: toggleMark(schema.marks.italic),
  underline: toggleMark(schema.marks.underline),

  // Block types
  heading: setBlockType(schema.nodes.heading, { level: 1 }),
  paragraph: setBlockType(schema.nodes.paragraph),
  'bullet-list': wrapInList(schema.nodes.bullet_list),
  'ordered-list': wrapInList(schema.nodes.ordered_list),

  // History
  undo,
  redo,

  // Image & Link
  'insert-image': promptForImage,
  'insert-link': promptForLink,

  // Code
  'insert-code-block': promptForCodeBlock,
  'change-code-language': changeCodeBlockLanguage,

  // Table commands
  'insert-table': insertTable(3, 3),
  'add-column-before': addColumnBefore,
  'add-column-after': addColumnAfter,
  'delete-column': deleteColumn,
  'add-row-before': addRowBefore,
  'add-row-after': addRowAfter,
  'delete-row': deleteRow,
  'merge-cells': mergeCells,
  'split-cell': splitCell,
  'toggle-header-row': toggleHeaderRow,
  'toggle-header-column': toggleHeaderColumn,
  'delete-table': deleteTable,
};
