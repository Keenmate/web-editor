import { describe, it, expect } from 'vitest';
import { EditorEngine } from '../../src/engine/editor-engine';
import { defaultPlugins } from '../../src/engine/default-plugins';
import { ENGINE_DEFAULTS } from '../../src/inputs';

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('EditorEngine', () => {
  it('constructs from markdown and serializes to all formats', () => {
    const engine = new EditorEngine(mount(), { markdown: '# Hello\n\nWorld **bold**\n' });
    expect(engine.getJSON().type).toBe('doc');
    expect(engine.getHTML()).toContain('<h1');
    expect(engine.getHTML()).toContain('<strong>bold</strong>');
    expect(engine.getMarkdown()).toContain('# Hello');
    engine.destroy();
  });

  it('replaces content via setMarkdown and emits change', () => {
    const engine = new EditorEngine(mount());
    let changes = 0;
    engine.events.on('change', () => (changes += 1));
    engine.setMarkdown('## A\n\ntext\n');
    expect(engine.getHTML()).toContain('<h2');
    expect(changes).toBe(1);
    engine.destroy();
  });

  it('registers default commands with keybindings and active-state', () => {
    const engine = new EditorEngine(mount());
    expect(engine.commands.has('bold')).toBe(true);
    expect(engine.commands.has('insert-table')).toBe(true);
    expect(engine.commands.get('bold')?.keys).toContain('Mod-b');
    engine.destroy();
  });
});

/**
 * Hook parity (rulebook C-CA-37): every `<km-editor>` setting the standalone engine applies is an option with the
 * same name AND the element's default — one source, the input table (`src/inputs.ts` `ENGINE_DEFAULTS`).
 */
describe('EditorEngine — the element settings it shares (C-CA-37)', () => {
  it("defaults come from <km-editor>'s input table", async () => {
    const { INPUTS, ENGINE_DEFAULTS } = await import('../../src/inputs');
    expect(ENGINE_DEFAULTS).toEqual({ isReadonly: false, labels: null, locale: null, translateCallback: null, interactionHost: null });
    for (const key of Object.keys(ENGINE_DEFAULTS)) expect(INPUTS.some((row) => row.configKey === key)).toBe(true);
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    expect(engine.isEditable()).toBe(!ENGINE_DEFAULTS.isReadonly);
    expect(engine.getOptions().labels).toBe(ENGINE_DEFAULTS.labels);
    expect(engine.getOptions().locale).toBe(ENGINE_DEFAULTS.locale);
    expect(engine.getOptions().translateCallback).toBe(ENGINE_DEFAULTS.translateCallback);
    expect(engine.getOptions().isReadonly).toBe(ENGINE_DEFAULTS.isReadonly);
    expect(engine.getOptions().interactionHost).toBe(ENGINE_DEFAULTS.interactionHost);
    expect(engine.label('buttons.ok')).toBe('OK');
    engine.destroy();
  });

  it('isReadonly: true starts read-only (undefined = the default, editable)', () => {
    const readonly = new EditorEngine(mount(), { markdown: 'x', isReadonly: true });
    expect(readonly.isEditable()).toBe(false);
    readonly.destroy();
    const unset = new EditorEngine(mount(), { markdown: 'x', isReadonly: undefined });
    expect(unset.isEditable()).toBe(true);
    unset.destroy();
  });

  it('labels: an option with the element keys, read live; it beats the page dictionary and the page translateCallback', () => {
    const reg = (window as any).components;
    const engine = new EditorEngine(mount(), { markdown: 'x', labels: { 'buttons.ok': 'Dobře', 'km-editor.buttons.cancel': 'Zrušit' } });
    try {
      reg.locale = { labels: { 'km-editor.buttons.ok': 'page' }, translateCallback: () => 'PAGE' };
      expect(engine.label('buttons.ok')).toBe('Dobře');
      expect(engine.label('buttons.cancel')).toBe('Zrušit');
      expect(engine.label('labels.words', { ctx: { count: 2 } })).toBe('PAGE');
      reg.locale = null;
      engine.setOptions({ labels: { 'labels.words': 'Slova: {ctx.count}' } });
      expect(engine.label('labels.words', { ctx: { count: 2 } })).toBe('Slova: 2');
      expect(engine.label('buttons.ok')).toBe('OK');
    } finally {
      reg.locale = null;
      engine.destroy();
    }
  });

  it("translateCallback: read live; the engine's own beats the page-wide one", () => {
    const reg = (window as any).components;
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    try {
      reg.locale = { translateCallback: ({ template }: { template: string }) => `page:${template}` };
      expect(engine.label('buttons.ok')).toBe('page:OK');
      engine.setOptions({ translateCallback: ({ template }) => `own:${template}` });
      expect(engine.label('buttons.ok')).toBe('own:OK');
      engine.setOptions({ translateCallback: () => null });
      expect(engine.label('buttons.ok')).toBe('page:OK');
    } finally {
      reg.locale = null;
      engine.destroy();
    }
  });
});

describe('EditorEngine — settings one way: setOptions / getOptions (C-CA-39)', () => {
  it('getOptions(): the merged options, no initial content; setOptions() merges in place (document kept)', () => {
    const plugins = defaultPlugins();
    const engine = new EditorEngine(mount(), { markdown: 'hello', plugins, labels: { 'buttons.ok': 'A' } });
    try {
      const options = engine.getOptions();
      expect(options.plugins).toBe(plugins);
      expect('markdown' in options).toBe(false);
      expect(options.labels).toEqual({ 'buttons.ok': 'A' });
      const view = engine.view;
      engine.setOptions({ locale: 'de' });
      expect(engine.getOptions().labels).toEqual({ 'buttons.ok': 'A' }); // untouched keys stay
      expect(engine.getOptions().locale).toBe('de');
      expect(engine.view).toBe(view); // no rebuild
      expect(engine.getMarkdown().trim()).toBe('hello');
      engine.setOptions({ labels: undefined }); // undefined = the default
      expect(engine.getOptions().labels).toBe(ENGINE_DEFAULTS.labels);
    } finally {
      engine.destroy();
    }
  });

  it('isReadonly toggles editability in place', () => {
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    try {
      engine.setOptions({ isReadonly: true });
      expect(engine.isEditable()).toBe(false);
      expect(engine.view.editable).toBe(false);
      engine.setOptions({ isReadonly: false });
      expect(engine.isEditable()).toBe(true);
      expect(engine.view.editable).toBe(true);
    } finally {
      engine.destroy();
    }
  });

  it('interactionHost: replaced live (null = the default dialog host)', () => {
    const host = { request: async () => ({ isCancelled: true }) };
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    try {
      engine.setOptions({ interactionHost: host as never });
      expect(engine.getOptions().interactionHost).toBe(host);
      engine.setOptions({ interactionHost: null });
      expect(engine.getOptions().interactionHost).toBeNull();
    } finally {
      engine.destroy();
    }
  });

  it('a construction-only key is ignored', () => {
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    try {
      const before = engine.getOptions().plugins;
      engine.setOptions({ plugins: [] } as never);
      expect(engine.getOptions().plugins).toBe(before);
    } finally {
      engine.destroy();
    }
  });

  it('has no setEditable / setInteractionHost / writable setting properties', () => {
    const engine = new EditorEngine(mount(), { markdown: 'x' });
    try {
      for (const name of ['setEditable', 'setInteractionHost', 'labels', 'locale', 'translateCallback']) {
        expect(name in engine).toBe(false);
      }
    } finally {
      engine.destroy();
    }
  });
});

describe('EditorEngine — docs/usage.md "Build your own UI" example', () => {
  it('drives the document from an own toolbar: labels, run, enabled / toggled state, change', async () => {
    const { labelKey } = await import('../../src/labels');
    const engine = new EditorEngine(mount(), { markdown: 'hello', labels: { 'ariaLabels.bold': 'Tučně' } });
    const bar = document.body.appendChild(document.createElement('div'));
    try {
      for (const id of ['bold', 'italic', 'undo']) {
        const button = document.createElement('button');
        button.dataset.id = id;
        button.textContent = engine.label(`ariaLabels.${labelKey(id)}`, undefined, engine.commands.get(id)?.text ?? id);
        button.addEventListener('click', () => engine.commands.run(id));
        bar.append(button);
      }
      const buttons = [...bar.children] as HTMLButtonElement[];
      expect(buttons.map((b) => b.textContent)).toEqual(['Tučně', 'Italic', 'Undo']);
      let saved = '';
      engine.events.on('change', () => (saved = engine.getMarkdown()));
      const { TextSelection } = await import('prosemirror-state');
      const { view } = engine;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)));
      buttons[0].click();
      expect(saved.trim()).toBe('**hello**');
      expect(engine.commands.isToggled('bold')).toBe(true);
      expect(engine.commands.isEnabled('undo')).toBe(true);
    } finally {
      bar.remove();
      engine.destroy();
    }
  });
});
