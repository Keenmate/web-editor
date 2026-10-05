/**
 * Dev playground bootstrap. Dogfoods the Phase 1 `EditorEngine`: toolbar clicks
 * route through `engine.commands`, and the output panel renders the live
 * serialization (`engine.serialize`). NOT part of the shipped library.
 */
import '../css/editor.css';

import { EditorEngine } from '../engine/editor-engine';
import { schema } from '../schema';
import { createFloatingToolbarPlugin } from '../plugins/floating-toolbar';
import { createDebugPlugins, updateDebugPanel } from '../plugins/debug';
import type { SerializationFormat } from '../engine/serialization';

const mount = document.querySelector('#editor') as HTMLElement;

const engine = new EditorEngine({
  mount,
  plugins: [createFloatingToolbarPlugin(schema), ...createDebugPlugins()],
});

// ── Toolbars ────────────────────────────────────────────────────────────
function handleToolbarClick(e: Event) {
  const button = (e.target as HTMLElement).closest('button');
  if (!button) return;
  const name = button.dataset.command;
  if (name && engine.commands.has(name)) {
    e.preventDefault();
    engine.commands.run(name);
  }
}

document.querySelector('#toolbar')?.addEventListener('click', handleToolbarClick);
for (const id of ['#floating-toolbar', '#table-toolbar', '#code-toolbar']) {
  const el = document.querySelector(id);
  el?.addEventListener('mousedown', (e) => e.preventDefault());
  el?.addEventListener('click', handleToolbarClick);
}

// ── Live output panel (exercises the serialization layer) ─────────────────
let format: SerializationFormat = 'markdown';
const outputEl = document.querySelector('#output') as HTMLElement | null;

function renderOutput() {
  if (outputEl) outputEl.textContent = engine.serialize(format);
}

document.querySelector('#output-tabs')?.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest('button');
  if (!button?.dataset.format) return;
  format = button.dataset.format as SerializationFormat;
  document
    .querySelectorAll('#output-tabs button')
    .forEach((b) => b.classList.toggle('active', b === button));
  renderOutput();
});

engine.events.on('change', renderOutput);
updateDebugPanel(engine.view);
renderOutput();

// Expose for console experimentation.
(window as any).editor = engine;

// eslint-disable-next-line no-console
console.log('KeenMate Web Editor — Phase 1 playground. Try: editor.getMarkdown()');
