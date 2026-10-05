/**
 * Dev playground bootstrap. Wires the ported editor to the static/floating
 * toolbars and the debug panel defined in index.html. This file is NOT part of
 * the shipped library (see tsconfig `exclude` and vite dts `exclude`); it exists
 * so the Phase 0 port runs end-to-end exactly like the original POC.
 */
import '../css/editor.css';

import { createEditor } from '../editor';
import { schema } from '../schema';
import { commands } from '../commands';
import { createFloatingToolbarPlugin } from '../plugins/floating-toolbar';
import { createDebugPlugins, updateDebugPanel } from '../plugins/debug';

const mount = document.querySelector('#editor') as HTMLElement;

const view = createEditor(mount, {
  plugins: [createFloatingToolbarPlugin(schema), ...createDebugPlugins()],
});

function handleToolbarClick(e: Event) {
  const button = (e.target as HTMLElement).closest('button');
  if (!button) return;
  const name = button.dataset.command;
  const command = name ? commands[name] : undefined;
  if (command) {
    // Prevent the click from stealing focus before we execute.
    e.preventDefault();
    command(view.state, view.dispatch, view);
    view.focus();
  }
}

// Static toolbar.
document.querySelector('#toolbar')?.addEventListener('click', handleToolbarClick);

// Floating toolbars — mousedown preventDefault keeps the editor selection.
for (const id of ['#floating-toolbar', '#table-toolbar', '#code-toolbar']) {
  const el = document.querySelector(id);
  el?.addEventListener('mousedown', (e) => e.preventDefault());
  el?.addEventListener('click', handleToolbarClick);
}

updateDebugPanel(view);

// Expose for console experimentation.
(window as any).editorView = view;

// eslint-disable-next-line no-console
console.log('KeenMate Web Editor — dev playground loaded. Try: editorView.state.doc');
