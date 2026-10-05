/**
 * Markdown serialization — import/export at the edges (single-model design).
 *
 * Export covers the full node set. Tables have no portable Markdown form in our
 * schema, so they are emitted as raw HTML (valid in GFM) — a deliberate,
 * documented fallback rather than a lossy conversion.
 *
 * Import uses markdown-it (CommonMark preset) for the core block/inline set.
 * Known Phase-1 limitation: Markdown *tables* and *blockquotes* are not parsed
 * back into nodes yet (the schema has no blockquote; table token→node mapping is
 * deferred to the plugin work in Phase 5). HTML/JSON remain fully lossless.
 */
import { DOMSerializer } from 'prosemirror-model';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { MarkdownSerializer, MarkdownParser } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';

function nodeToHTML(node: PMNode, schema: Schema): string {
  const dom = DOMSerializer.fromSchema(schema).serializeNode(node, { document });
  const container = document.createElement('div');
  container.appendChild(dom);
  return container.innerHTML;
}

export const markdownSerializer = new MarkdownSerializer(
  {
    text(state, node) {
      state.text(node.text || '');
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(state.repeat('#', node.attrs.level) + ' ');
      state.renderInline(node);
      state.closeBlock(node);
    },
    code_block(state, node) {
      state.write('```' + (node.attrs.language || '') + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    ordered_list(state, node) {
      const start = node.attrs.order || 1;
      state.renderList(node, '   ', (i) => `${start + i}. `);
    },
    list_item(state, node) {
      state.renderContent(node);
    },
    image(state, node) {
      const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : '';
      state.write(`![${state.esc(node.attrs.alt || '')}](${node.attrs.src}${title})`);
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n');
          return;
        }
      }
    },
    // Tables → raw HTML fallback (see module docblock). Children are not
    // recursed into, so the row/cell serializers below are never reached; they
    // exist only to satisfy completeness.
    table(state, node) {
      state.write(nodeToHTML(node, node.type.schema));
      state.closeBlock(node);
    },
    table_row() {},
    table_cell() {},
    table_header() {},
  },
  {
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    underline: { open: '<u>', close: '</u>', mixable: true },
    code: { open: '`', close: '`', escape: false },
    link: {
      open: '[',
      close(_state, mark) {
        const href = mark.attrs.href || '';
        const title = mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : '';
        return `](${href}${title})`;
      },
    },
  }
);

const parsers = new WeakMap<Schema, MarkdownParser>();

function getParser(schema: Schema): MarkdownParser {
  let parser = parsers.get(schema);
  if (parser) return parser;

  const md = MarkdownIt('commonmark', { html: false });
  // Our schema has no blockquote / thematic-break nodes; drop those rules so the
  // parser never emits tokens it cannot map.
  md.disable(['blockquote', 'hr']);

  parser = new MarkdownParser(schema, md, {
    paragraph: { block: 'paragraph' },
    heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
    bullet_list: { block: 'bullet_list' },
    ordered_list: {
      block: 'ordered_list',
      getAttrs: (tok) => ({ order: +(tok.attrGet('start') || 1) }),
    },
    list_item: { block: 'list_item' },
    fence: {
      block: 'code_block',
      getAttrs: (tok) => ({ language: tok.info ? tok.info.trim().split(/\s+/)[0] : 'javascript' }),
    },
    code_block: { block: 'code_block', getAttrs: () => ({ language: 'javascript' }) },
    image: {
      node: 'image',
      getAttrs: (tok) => ({
        src: tok.attrGet('src'),
        title: tok.attrGet('title') || null,
        alt: (tok.children?.[0] && tok.children[0].content) || null,
      }),
    },
    hardbreak: { node: 'hard_break' },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    code_inline: { mark: 'code' },
    link: {
      mark: 'link',
      getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }),
    },
  });

  parsers.set(schema, parser);
  return parser;
}

export function docToMarkdown(doc: PMNode): string {
  return markdownSerializer.serialize(doc);
}

export function markdownToDoc(markdown: string, schema: Schema): PMNode {
  return getParser(schema).parse(markdown);
}
