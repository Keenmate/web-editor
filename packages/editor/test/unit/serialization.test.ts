import { describe, it, expect } from 'vitest';
import { schema } from '../../src/schema';
import { docToHTML, htmlToDoc } from '../../src/engine/serialization/html';
import { docToJSON, jsonToDoc } from '../../src/engine/serialization/json';
import { docToMarkdown, markdownToDoc } from '../../src/engine/serialization/markdown';

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
    const md = docToMarkdown(sample);
    expect(md).toContain('## Title');
    expect(md).toContain('**world**');
    expect(md).toContain('*emphasis*');
    expect(md).toContain('`x()`');
    expect(md).toContain('- one');
    expect(md).toContain('- two');
  });

  it('parses the CommonMark core back into nodes', () => {
    const doc = markdownToDoc('# Heading\n\nHello **b** and *i*\n\n- a\n- b\n', schema);
    expect(doc.firstChild?.type.name).toBe('heading');
    expect(doc.firstChild?.attrs.level).toBe(1);
    // bold/italic marks survive
    const md = docToMarkdown(doc);
    expect(md).toContain('**b**');
    expect(md).toContain('*i*');
  });

  it('round-trips a fenced code block with language', () => {
    const doc = markdownToDoc('```ts\nconst a = 1;\n```\n', schema);
    const code = doc.firstChild;
    expect(code?.type.name).toBe('code_block');
    expect(code?.attrs.language).toBe('ts');
    expect(docToMarkdown(doc)).toContain('```ts');
  });
});
