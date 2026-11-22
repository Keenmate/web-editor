/**
 * Placeholder — the `labels` `placeholders.document` text shown while the document is empty
 * (one empty paragraph), like a native `<textarea placeholder>`. The text is
 * rendered by CSS from a `data-placeholder` attribute (never as HTML) and also
 * set as `aria-placeholder` on the editable surface. `''` (the default) = off.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const placeholderKey = new PluginKey('we-placeholder');

/** True when the document is a single empty paragraph (the empty-editor state). */
export function isDocEmpty(state: EditorState): boolean {
  const { doc } = state;
  if (doc.childCount !== 1) return false;
  const first = doc.firstChild!;
  return first.type === doc.type.schema.nodes.paragraph && first.content.size === 0;
}

/**
 * True when the document holds no CONTENT — the `required` rule's "empty" (`<km-editor required>`, core SPEC
 * §6.6): no text after trimming whitespace AND no non-text content. Every {@link isDocEmpty} document is blank;
 * so is one of only whitespace, empty headings / list items / quotes / code blocks and hard breaks. Content
 * that is not text counts: any leaf node other than a hard break (image, horizontal rule, embed, an inline
 * atom a plugin adds) and a table (even with empty cells).
 */
export function isDocBlank(doc: PMNode): boolean {
  let hasContent = false;
  doc.descendants((node) => {
    if (hasContent) return false;
    if (node.isText) {
      if ((node.text ?? '').trim() !== '') hasContent = true;
      return false;
    }
    if (node.isLeaf ? node.type.name !== 'hard_break' : node.type.spec.tableRole === 'table') {
      hasContent = true;
      return false;
    }
    return true;
  });
  return !hasContent;
}

/** `getText` is read on every view update, so a `labels` change applies on the next redraw. */
export function placeholderPlugin(getText: () => string): Plugin {
  return new Plugin({
    key: placeholderKey,
    props: {
      decorations(state) {
        const text = getText();
        if (!text || !isDocEmpty(state)) return null;
        const first = state.doc.firstChild!;
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: 'we-placeholder', 'data-placeholder': text }),
        ]);
      },
      attributes(state): Record<string, string> {
        const text = getText();
        return text && isDocEmpty(state) ? { 'aria-placeholder': text } : {};
      },
    },
  });
}
