/**
 * Serialization layer — one ProseMirror document, three output formats.
 * The view modes (Phase 3) and the `<km-editor>` `format` input (Phase 2) are
 * thin consumers of these functions.
 *
 * HTML and JSON are schema-driven (plugin-agnostic). Markdown needs the plugins'
 * serializer contributions, so the standalone `serialize`/`parse` here assemble a
 * DEFAULT Markdown I/O from the markdown-bearing first-party plugins (link, image,
 * tables). The engine uses its OWN I/O, assembled from its actual plugin set.
 */
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { docToHTML, htmlToDoc } from './html';
import { docToJSON, jsonToDoc, type DocJSON } from './json';
import { docToMarkdown, markdownToDoc } from './markdown';
import { buildMarkdownIO, type MarkdownIO } from '../markdown-io';
import { linkPlugin } from '../../plugins/link';
import { imagePlugin } from '../../plugins/image';
import { tablePlugin } from '../../plugins/tables';

export { docToHTML, htmlToDoc } from './html';
export { docToJSON, jsonToDoc, type DocJSON } from './json';
export {
  docToMarkdown,
  markdownToDoc,
  nodeToHTML,
  buildMarkdownSerializer,
  buildMarkdownParser,
} from './markdown';

export type SerializationFormat = 'html' | 'markdown' | 'json';

// Default Markdown feature set for the standalone helpers (no Prism — code
// highlighting contributes no Markdown). Cached per schema.
const DEFAULT_MARKDOWN_PLUGINS = [linkPlugin, imagePlugin, tablePlugin];
const ioCache = new WeakMap<Schema, MarkdownIO>();

function defaultIO(schema: Schema): MarkdownIO {
  let io = ioCache.get(schema);
  if (!io) {
    io = buildMarkdownIO(schema, DEFAULT_MARKDOWN_PLUGINS);
    ioCache.set(schema, io);
  }
  return io;
}

/** Serialize a document to the given format (JSON is returned pretty-printed). */
export function serialize(doc: PMNode, schema: Schema, format: SerializationFormat): string {
  switch (format) {
    case 'html':
      return docToHTML(doc, schema);
    case 'markdown':
      return docToMarkdown(doc, defaultIO(schema).serializer);
    case 'json':
      return JSON.stringify(docToJSON(doc), null, 2);
  }
}

/** Parse a string in the given format into a document. */
export function parse(value: string, schema: Schema, format: SerializationFormat): PMNode {
  switch (format) {
    case 'html':
      return htmlToDoc(value, schema);
    case 'markdown':
      return markdownToDoc(value, defaultIO(schema).parser);
    case 'json':
      return jsonToDoc(schema, JSON.parse(value) as DocJSON);
  }
}
