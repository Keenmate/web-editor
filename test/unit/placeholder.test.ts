import { describe, it, expect } from 'vitest';
import { schema } from '../../src/schema';
import { isDocBlank, isDocEmpty } from '../../src/engine/placeholder';
import { EditorState } from 'prosemirror-state';

const n = schema.nodes;
const doc = (...blocks: any[]) => n.doc.create(null, blocks);
const p = (text?: string) => n.paragraph.create(null, text ? schema.text(text) : null);

describe('isDocBlank (the `required` rule\'s "empty")', () => {
  it('every isDocEmpty document is blank', () => {
    const d = doc(p());
    expect(isDocEmpty(EditorState.create({ doc: d }))).toBe(true);
    expect(isDocBlank(d)).toBe(true);
  });

  it('whitespace-only text, empty headings / lists / code blocks and hard breaks are blank', () => {
    expect(isDocBlank(doc(p('   \u00a0 '), p()))).toBe(true);
    expect(isDocBlank(doc(n.heading.create({ level: 1 }), p()))).toBe(true);
    expect(isDocBlank(doc(n.bullet_list.create(null, n.list_item.create(null, p()))))).toBe(true);
    expect(isDocBlank(doc(n.code_block.create(null, schema.text('  \n  '))))).toBe(true);
    expect(isDocBlank(doc(n.paragraph.create(null, [n.hard_break.create(), n.hard_break.create()])))).toBe(true);
  });

  it('any non-whitespace text is content', () => {
    expect(isDocBlank(doc(p(), p('  x ')))).toBe(false);
  });

  it('non-text content counts: an image, a table (even with empty cells)', () => {
    expect(isDocBlank(doc(n.paragraph.create(null, n.image.create({ src: 'a.png' }))))).toBe(false);
    const cell = n.table_cell.create(null, p());
    const table = n.table.create(null, n.table_row.create(null, cell));
    expect(isDocBlank(doc(table))).toBe(false);
  });
});
