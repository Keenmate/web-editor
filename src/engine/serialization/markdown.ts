/**
 * Markdown serialization — import/export at the edges (single-model design).
 *
 * This module is the LOW-LEVEL, plugin-agnostic layer: the CORE node/mark
 * serializers + parse specs, and the `buildMarkdownSerializer` /
 * `buildMarkdownParser` factories the engine uses to fold in each plugin's
 * Markdown contribution (`engine/markdown-io.ts`). Feature Markdown (links,
 * images, the table raw-HTML fallback) lives in those plugins, not here.
 *
 * Export covers the core block/inline set. Import uses markdown-it (CommonMark
 * preset) — plugins re-enable the markdown-it rules they need.
 */
import { DOMSerializer } from 'prosemirror-model';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { MarkdownSerializer, MarkdownParser } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';

/** Serialize a single node to HTML (used by the table Markdown fallback). */
export function nodeToHTML(node: PMNode, schema: Schema): string {
  const dom = DOMSerializer.fromSchema(schema).serializeNode(node, { document });
  const container = document.createElement('div');
  container.appendChild(dom);
  return container.innerHTML;
}

type NodeSerializers = Record<string, (state: any, node: any, parent: any, index: number) => void>;
type MarkSerializers = Record<string, any>;
type ParseSpecs = Record<string, any>;

/** Core node serializers (paragraph, heading, lists, code block, text, break). */
export const coreMarkdownNodes: NodeSerializers = {
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
    state.renderList(node, '   ', (i: number) => `${start + i}. `);
  },
  list_item(state, node) {
    state.renderContent(node);
  },
  hard_break(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n');
        return;
      }
    }
  },
};

/** Core mark serializers (bold, italic, underline, inline code). */
export const coreMarkdownMarks: MarkSerializers = {
  bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  underline: { open: '<u>', close: '</u>', mixable: true },
  code: { open: '`', close: '`', escape: false },
};

/** Core token→node/mark parse specs. */
export const coreMarkdownParse: ParseSpecs = {
  paragraph: { block: 'paragraph' },
  heading: { block: 'heading', getAttrs: (tok: any) => ({ level: +tok.tag.slice(1) }) },
  bullet_list: { block: 'bullet_list' },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok: any) => ({ order: +(tok.attrGet('start') || 1) }),
  },
  list_item: { block: 'list_item' },
  fence: {
    block: 'code_block',
    getAttrs: (tok: any) => ({ language: tok.info ? tok.info.trim().split(/\s+/)[0] : 'javascript' }),
  },
  code_block: { block: 'code_block', getAttrs: () => ({ language: 'javascript' }) },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  code_inline: { mark: 'code' },
};

/** Build a MarkdownSerializer from merged node/mark maps. */
export function buildMarkdownSerializer(
  nodes: NodeSerializers,
  marks: MarkSerializers
): MarkdownSerializer {
  return new MarkdownSerializer(nodes, marks);
}

/**
 * Build a MarkdownParser for `schema` from merged parse specs. Starts from the
 * CommonMark preset with `blockquote` / `hr` disabled (the core schema has no
 * such nodes); `enableRules` re-enables markdown-it rules a plugin needs.
 */
export function buildMarkdownParser(
  schema: Schema,
  parseSpecs: ParseSpecs,
  enableRules: readonly string[] = []
): MarkdownParser {
  const md = MarkdownIt('commonmark', { html: false });
  md.disable(['blockquote', 'hr']);
  if (enableRules.length) md.enable([...enableRules]);
  return new MarkdownParser(schema, md, parseSpecs);
}

export function docToMarkdown(doc: PMNode, serializer: MarkdownSerializer): string {
  return serializer.serialize(doc);
}

export function markdownToDoc(markdown: string, parser: MarkdownParser): PMNode {
  return parser.parse(markdown);
}
