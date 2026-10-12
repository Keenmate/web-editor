import { describe, it, expect } from 'vitest';
import { EditorEngine } from '../../src/engine/editor-engine';

function mount(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('EditorEngine', () => {
  it('constructs from markdown and serializes to all formats', () => {
    const engine = new EditorEngine({ mount: mount(), markdown: '# Hello\n\nWorld **bold**\n' });
    expect(engine.getJSON().type).toBe('doc');
    expect(engine.getHTML()).toContain('<h1');
    expect(engine.getHTML()).toContain('<strong>bold</strong>');
    expect(engine.getMarkdown()).toContain('# Hello');
    engine.destroy();
  });

  it('replaces content via setMarkdown and emits change', () => {
    const engine = new EditorEngine({ mount: mount() });
    let changes = 0;
    engine.events.on('change', () => (changes += 1));
    engine.setMarkdown('## A\n\ntext\n');
    expect(engine.getHTML()).toContain('<h2');
    expect(changes).toBe(1);
    engine.destroy();
  });

  it('registers default commands with keybindings and active-state', () => {
    const engine = new EditorEngine({ mount: mount() });
    expect(engine.commands.has('bold')).toBe(true);
    expect(engine.commands.has('insert-table')).toBe(true);
    expect(engine.commands.get('bold')?.keys).toContain('Mod-b');
    engine.destroy();
  });
});
