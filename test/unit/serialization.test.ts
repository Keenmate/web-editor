import { describe, it, expect } from 'vitest';
import { schema } from '../../src/schema';
import { docToHTML, htmlToDoc } from '../../src/engine/serialization/html';
import { docToJSON, jsonToDoc } from '../../src/engine/serialization/json';
// Markdown needs the plugins' serializers, so go through the public helpers,
// which assemble a default Markdown I/O (core + link/image/table).
import { serialize, parse } from '../../src/engine/serialization';

const toMarkdown = (doc: Parameters<typeof docToHTML>[0]) => serialize(doc, schema, 'markdown');
const fromMarkdown = (md: string) => parse(md, schema, 'markdown');

const SAMPLE_HTML =
  '<h2>Title</h2>' +
  '<p>Hello <strong>world</strong> and <em>emphasis</em> plus <code>x()</code></p>' +
  '<ul><li><p>one</p></li><li><p>two</p></li></ul>';

const sample = htmlToDoc(SAMPLE_HTML, schema);

describe('HTML serialization', () => {
  it('round-trips a document losslessly', () => {
    const back = htmlToDoc(docToHTML(sample, schema), schema);
    expect(back.toJSON()).toEqual(sample.toJSON());
  });
});

describe('JSON serialization', () => {
  it('round-trips a document losslessly', () => {
    const back = jsonToDoc(schema, docToJSON(sample));
    expect(back.toJSON()).toEqual(sample.toJSON());
  });
});

describe('Markdown serialization', () => {
  it('serializes blocks and marks', () => {
    const md = toMarkdown(sample);
    expect(md).toContain('## Title');
    expect(md).toContain('**world**');
    expect(md).toContain('*emphasis*');
    expect(md).toContain('`x()`');
    expect(md).toContain('- one');
    expect(md).toContain('- two');
  });

  it('parses the CommonMark core back into nodes', () => {
    const doc = fromMarkdown('# Heading\n\nHello **b** and *i*\n\n- a\n- b\n');
    expect(doc.firstChild?.type.name).toBe('heading');
    expect(doc.firstChild?.attrs.level).toBe(1);
    // bold/italic marks survive
    const md = toMarkdown(doc);
    expect(md).toContain('**b**');
    expect(md).toContain('*i*');
  });

  it('round-trips a fenced code block with language', () => {
    const doc = fromMarkdown('```ts\nconst a = 1;\n```\n');
    const code = doc.firstChild;
    expect(code?.type.name).toBe('code_block');
    expect(code?.attrs.language).toBe('ts');
    expect(toMarkdown(doc)).toContain('```ts');
  });
});

describe('Markdown link / image destinations (ED-6)', () => {
  const urls = [
    'https://img.test/a.png',
    'https://img.test/my image (1).png',
    'https://img.test/a)b.png',
    'https://img.test/a(b).png',
    'https://img.test/a<b>.png',
    'https://img.test/back\slash.png',
  ];
  for (const src of urls) {
    it(`image src ${JSON.stringify(src)} survives a markdown round-trip`, () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.nodes.image.create({ src, alt: 'x', title: 'a "q" \ t' })]),
      ]);
      const back = fromMarkdown(toMarkdown(doc));
      const img = back.firstChild!.firstChild!;
      expect(decodeURI(img.attrs.src)).toBe(src);
      expect(img.attrs.title).toBe('a "q" \ t');
    });
    it(`link href ${JSON.stringify(src)} survives a markdown round-trip`, () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('t', [schema.marks.link.create({ href: src })])]),
      ]);
      const back = fromMarkdown(toMarkdown(doc));
      expect(decodeURI(back.firstChild!.firstChild!.marks[0].attrs.href)).toBe(src);
    });
  }
});
