/**
 * Dev playground bootstrap. Dogfoods the Phase 1 `EditorEngine`: toolbar clicks
 * route through `engine.commands`, and the output panel renders the live
 * serialization (`engine.serialize`). NOT part of the shipped library.
 *
 * NOTE: editor.css is linked render-blocking from index.html (not imported here)
 * to avoid a first-paint FOUC on reload. The library path (src/index.ts) still
 * imports it, so packaged consumers get the CSS bundled as before.
 */
import { EditorEngine } from '../engine/editor-engine';
import { schema } from '../schema';
import { createFloatingToolbarPlugin } from '../plugins/floating-toolbar';
import { createDebugPlugins, updateDebugPanel } from '../plugins/debug';
import type { SerializationFormat } from '../engine/serialization';
// Registers <km-editor> (the shipped element) + exposes the public surface.
import { type KmEditorElement, type EditorMode } from '../index';

// ── <km-editor> element showcase (Phase 2–3) ──────────────────────────────
const km = document.querySelector('#km') as KmEditorElement | null;
if (km) {
  const status = document.querySelector('#km-status') as HTMLElement | null;
  const setStatus = (msg: string) => {
    if (status) status.textContent = msg;
  };

  km.addEventListener('ready', () => setStatus('ready'));
  km.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    setStatus(`changed · ${detail.format} · ${detail.value.length} chars`);
  });
  km.addEventListener('mode-change', (e) => setStatus(`mode → ${(e as CustomEvent).detail.mode}`));

  document.querySelector('#km-mode')?.addEventListener('change', (e) => {
    km.setAttribute('mode', (e.target as HTMLSelectElement).value as EditorMode);
  });
  document.querySelector('#km-format')?.addEventListener('change', (e) => {
    km.setAttribute('format', (e.target as HTMLSelectElement).value);
  });
  document.querySelector('#km-readonly')?.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) km.setAttribute('readonly', '');
    else km.removeAttribute('readonly');
  });
  document.querySelector('#km-theme')?.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) km.setAttribute('theme', 'dark');
    else km.removeAttribute('theme');
  });

  // Expose for console experimentation.
  (window as any).km = km;
}

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
