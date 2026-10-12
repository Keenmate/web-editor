/**
 * HTML serialization — lossless round-trip via ProseMirror's DOM (de)serializer.
 */
import { DOMParser, DOMSerializer } from 'prosemirror-model';
import type { Node as PMNode, Schema } from 'prosemirror-model';

export function docToHTML(doc: PMNode, schema: Schema): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document });
  const container = document.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}

export function htmlToDoc(html: string, schema: Schema): PMNode {
  const container = document.createElement('div');
  container.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(container);
}
