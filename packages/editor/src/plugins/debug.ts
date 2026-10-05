/**
 * Debug plugins — selection/document/transaction inspector for the dev
 * playground. PROVISIONAL (Phase 0): playground-only, coupled to the debug-panel
 * DOM ids in index.html. Not part of the shipped library surface.
 */
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

let lastTransaction: any = null;

function docToString(node, indent = 0) {
  const prefix = '  '.repeat(indent);
  let result = prefix + node.type.name;

  if (node.isText) {
    const marks = node.marks.map((m) => m.type.name).join(', ');
    result += marks ? ` [${marks}]` : '';
    result += `: "${node.text}"`;
    return result + '\n';
  }

  if (Object.keys(node.attrs).some((k) => node.attrs[k] !== null)) {
    result += ` ${JSON.stringify(node.attrs)}`;
  }

  result += '\n';
  node.forEach((child) => {
    result += docToString(child, indent + 1);
  });
  return result;
}

export function updateDebugPanel(view: EditorView) {
  const { state } = view;
  const { selection, doc } = state;

  const selectionEl = document.querySelector('#selection-info');
  if (selectionEl) {
    const selectionInfo = {
      type: selection.constructor.name,
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
      selectedText: doc.textBetween(selection.from, selection.to, ' '),
      storedMarks: state.storedMarks?.map((m) => m.type.name) || [],
      marksAtCursor: selection.$from.marks().map((m) => m.type.name),
    };
    selectionEl.textContent = JSON.stringify(selectionInfo, null, 2);
  }

  const docEl = document.querySelector('#doc-structure');
  if (docEl) docEl.textContent = docToString(doc);

  const trEl = document.querySelector('#last-transaction');
  if (trEl && lastTransaction) {
    trEl.textContent = JSON.stringify(lastTransaction, null, 2);
  }
}

export function createDebugPlugins(): Plugin[] {
  const debugPlugin = new Plugin({
    view() {
      return {
        update(view) {
          updateDebugPanel(view);
        },
      };
    },
  });

  const transactionLogger = new Plugin({
    filterTransaction(tr) {
      if (tr.docChanged || tr.selectionSet) {
        lastTransaction = {
          docChanged: tr.docChanged,
          selectionSet: tr.selectionSet,
          steps: tr.steps.map((s) => s.toJSON()),
          time: new Date().toLocaleTimeString(),
        };
      }
      return true;
    },
  });

  return [debugPlugin, transactionLogger];
}
