/**
 * JSON serialization — ProseMirror's native, fully lossless document form.
 */
import { Node as PMNode } from 'prosemirror-model';
import type { Schema } from 'prosemirror-model';

export type DocJSON = Record<string, any>;

export function docToJSON(doc: PMNode): DocJSON {
  return doc.toJSON();
}

export function jsonToDoc(schema: Schema, json: DocJSON): PMNode {
  return PMNode.fromJSON(schema, json);
}
