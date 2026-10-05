/**
 * Phase 5 plugin-system tests — dependency ordering, the serializer contract,
 * custom plugins, a trimmed plugin set, and default-plugin parity. Runs against a
 * raw engine in happy-dom (light DOM, so no shadow-selection quirks).
 */
import { describe, it, expect } from 'vitest';
import { toggleMark } from 'prosemirror-commands';
import { EditorEngine } from '../../src/engine/editor-engine';
import { definePlugin, orderPlugins } from '../../src/engine/plugin';

const mount = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

describe('orderPlugins', () => {
  it('orders dependencies before dependents (stable)', () => {
    const a = definePlugin({ name: 'a' });
    const b = definePlugin({ name: 'b', dependencies: ['a'] });
    expect(orderPlugins([b, a]).map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('throws on a missing dependency', () => {
    expect(() => orderPlugins([definePlugin({ name: 'x', dependencies: ['nope'] })])).toThrow(
      /missing plugin "nope"/
    );
  });

  it('throws on a dependency cycle', () => {
    const c1 = definePlugin({ name: 'c1', dependencies: ['c2'] });
    const c2 = definePlugin({ name: 'c2', dependencies: ['c1'] });
    expect(() => orderPlugins([c1, c2])).toThrow(/cycle/i);
  });
});

describe('serializer contract', () => {
  it('throws when a plugin adds a node without a Markdown serializer', () => {
    const bad = definePlugin({
      name: 'bad',
      nodes: {
        widget: { group: 'block', content: 'inline*', toDOM: () => ['div', 0], parseDOM: [{ tag: 'div.widget' }] },
      },
      // no markdown.nodes.widget → contract violation
    });
    expect(() => new EditorEngine({ mount: mount(), editorPlugins: [bad] })).toThrow(
      /Serializer contract: node "widget"/
    );
  });

  it('throws when a plugin adds a mark without a Markdown serializer', () => {
    const bad = definePlugin({
      name: 'badmark',
      marks: { glow: { toDOM: () => ['span', 0], parseDOM: [{ tag: 'span.glow' }] } },
    });
    expect(() => new EditorEngine({ mount: mount(), editorPlugins: [bad] })).toThrow(
      /Serializer contract: mark "glow"/
    );
  });
});

describe('custom plugin', () => {
  const strike = definePlugin({
    name: 'strike',
    marks: { strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] } },
    markdown: { marks: { strike: { open: '~~', close: '~~', mixable: true } } },
    commands: ({ schema }) => [{ id: 'strike', run: toggleMark(schema.marks.strike) }],
    toolbarItems: [{ type: 'command', command: 'strike', label: 'Strikethrough', icon: 'S' }],
  });

  it('merges schema, command, item, and Markdown serializer', () => {
    const engine = new EditorEngine({ mount: mount(), editorPlugins: [strike] });
    expect(engine.schema.marks.strike).toBeTruthy();
    expect(engine.commands.has('strike')).toBe(true);
    expect(
      engine.toolbarItems.some((i) => i.type === 'command' && i.command === 'strike')
    ).toBe(true);

    engine.setHTML('<p><s>gone</s></p>');
    expect(engine.getMarkdown()).toContain('~~gone~~');
  });
});

describe('trimmed plugin set', () => {
  it('drops feature schema + items when no plugins are given', () => {
    const engine = new EditorEngine({ mount: mount(), editorPlugins: [] });
    expect(engine.schema.marks.link).toBeUndefined();
    expect(engine.schema.nodes.image).toBeUndefined();
    expect(engine.schema.nodes.table).toBeUndefined();
    // Core survives.
    expect(engine.commands.has('bold')).toBe(true);
    expect(engine.schema.nodes.code_block).toBeTruthy();
    // Feature toolbar items are gone; core + history remain.
    const ids = engine.toolbarItems.filter((i) => i.type === 'command').map((i: any) => i.command);
    expect(ids).not.toContain('insert-link');
    expect(ids).not.toContain('insert-table');
    expect(ids).toContain('bold');
    expect(ids).toContain('undo');
  });
});

describe('default plugins', () => {
  it('reproduce the full editor (link/image/table + round-trip)', () => {
    const engine = new EditorEngine({
      mount: mount(),
      markdown: '[x](https://e.com) and ![a](img.png)',
    });
    expect(engine.schema.marks.link).toBeTruthy();
    expect(engine.schema.nodes.image).toBeTruthy();
    expect(engine.schema.nodes.table).toBeTruthy();

    const md = engine.getMarkdown();
    expect(md).toContain('[x](https://e.com)');
    expect(md).toContain('![a](img.png)');

    // Assembled toolbar includes the plugins' items, in order.
    const ids = engine.toolbarItems.filter((i) => i.type === 'command').map((i: any) => i.command);
    expect(ids).toEqual(
      expect.arrayContaining(['bold', 'insert-link', 'insert-image', 'insert-table', 'undo'])
    );
  });
});
