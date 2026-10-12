/**
 * Tables plugin — the table node set (from prosemirror-tables), the editing
 * ProseMirror plugins (`columnResizing` + `tableEditing`), Tab cell-navigation,
 * the insert + row/column/cell commands, and the Markdown raw-HTML fallback.
 *
 * Markdown has no portable form for our table model, so tables export as raw HTML
 * (valid in GFM) — a deliberate, documented fallback. Import does not parse tables
 * back into nodes yet (deferred); HTML and JSON round-trip losslessly via the
 * node specs.
 */
import type { Command } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import {
  columnResizing,
  tableEditing,
  goToNextCell,
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
import { definePlugin } from '../engine/plugin';
import type { CommandSpec } from '../engine/command-registry';
import { tableNodeSpecs } from '../schema';
import { nodeToHTML } from '../engine/serialization/markdown';

/** Insert a `rows × cols` table (first row is a header row). */
function insertTable(schema: Schema, rows = 3, cols = 3): Command {
  return (state, dispatch) => {
    const tableRows = [];
    for (let r = 0; r < rows; r++) {
      const cells = [];
      for (let c = 0; c < cols; c++) {
        const cellType = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
        cells.push(cellType.createAndFill()!);
      }
      tableRows.push(schema.nodes.table_row.create(null, cells));
    }
    const table = schema.nodes.table.create(null, tableRows);
    if (dispatch) dispatch(state.tr.replaceSelectionWith(table).scrollIntoView());
    return true;
  };
}

export const tablePlugin = definePlugin({
  name: 'tables',
  nodes: tableNodeSpecs,
  markdown: {
    nodes: {
      // Raw-HTML fallback; children are not recursed into, so the row/cell
      // serializers below are never reached (present only for completeness).
      table(state: any, node: any) {
        state.write(nodeToHTML(node, node.type.schema));
        state.closeBlock(node);
      },
      table_row() {},
      table_cell() {},
      table_header() {},
    },
  },
  pmPlugins: () => [columnResizing(), tableEditing()],
  // Tab cell navigation. Ordered before the core list keymap, so goToNextCell
  // wins inside a table and falls through (returns false) to list indentation.
  keymap: () => ({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) }),
  commands: ({ schema }): CommandSpec[] => [
    { id: 'insert-table', run: insertTable(schema), isEnabled: () => true },
    { id: 'add-column-before', run: addColumnBefore },
    { id: 'add-column-after', run: addColumnAfter },
    { id: 'delete-column', run: deleteColumn },
    { id: 'add-row-before', run: addRowBefore },
    { id: 'add-row-after', run: addRowAfter },
    { id: 'delete-row', run: deleteRow },
    { id: 'merge-cells', run: mergeCells },
    { id: 'split-cell', run: splitCell },
    { id: 'toggle-header-row', run: toggleHeaderRow },
    { id: 'toggle-header-column', run: toggleHeaderColumn },
    { id: 'delete-table', run: deleteTable },
  ],
  toolbarGroups: [
    {
      id: 'table',
      label: 'Table',
      items: [{ type: 'command', command: 'insert-table', label: 'Table', icon: '⊞', title: 'Insert table' }],
    },
  ],
  menuItems: [{ type: 'command', command: 'insert-table', label: 'Insert table' }],
});
