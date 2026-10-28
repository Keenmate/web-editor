/**
 * Placeholder — the `labels.placeholder` text shown while the document is empty
 * (one empty paragraph), like a native `<textarea placeholder>`. The text is
 * rendered by CSS from a `data-placeholder` attribute (never as HTML) and also
 * set as `aria-placeholder` on the editable surface. `''` (the default) = off.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const placeholderKey = new PluginKey('we-placeholder');

/** True when the document is a single empty paragraph (the empty-editor state). */
export function isDocEmpty(state: EditorState): boolean {
  const { doc } = state;
  if (doc.childCount !== 1) return false;
  const first = doc.firstChild!;
  return first.type === doc.type.schema.nodes.paragraph && first.content.size === 0;
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
