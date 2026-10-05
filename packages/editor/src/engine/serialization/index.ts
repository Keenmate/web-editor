/**
 * Serialization layer — one ProseMirror document, three output formats.
 * The view modes (Phase 3) and the `<km-editor>` `format` input (Phase 2) are
 * thin consumers of these functions.
 */
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { docToHTML, htmlToDoc } from './html';
import { docToJSON, jsonToDoc, type DocJSON } from './json';
import { docToMarkdown, markdownToDoc } from './markdown';

export { docToHTML, htmlToDoc } from './html';
export { docToJSON, jsonToDoc, type DocJSON } from './json';
export { docToMarkdown, markdownToDoc, markdownSerializer } from './markdown';

export type SerializationFormat = 'html' | 'markdown' | 'json';

/** Serialize a document to the given format (JSON is returned pretty-printed). */
export function serialize(doc: PMNode, schema: Schema, format: SerializationFormat): string {
  switch (format) {
    case 'html':
      return docToHTML(doc, schema);
    case 'markdown':
      return docToMarkdown(doc);
    case 'json':
      return JSON.stringify(docToJSON(doc), null, 2);
  }
}

/** Parse a string in the given format into a document. */
export function parse(
  value: string,
  schema: Schema,
  format: SerializationFormat
): PMNode {
  switch (format) {
    case 'html':
      return htmlToDoc(value, schema);
    case 'markdown':
      return markdownToDoc(value, schema);
    case 'json':
      return jsonToDoc(schema, JSON.parse(value) as DocJSON);
  }
}
