/**
 * Image plugin — the inline `image` node, its Markdown serializer/parser, the
 * `insert-image` command (prompt-driven), and the toolbar / menu items.
 */
import type { Command } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { definePlugin } from '../engine/plugin';
import type { LabelResolver } from '../labels';
import type { CommandSpec } from '../engine/command-registry';
import { imageNodeSpec } from '../schema';
import { markdownDestination, markdownTitle } from '../engine/serialization/markdown';

/** Insert an image at the current position. */
function insertImage(schema: Schema, src: string, alt = '', title: string | null = null): Command {
  return (state, dispatch) => {
    const node = schema.nodes.image.create({ src, alt, title });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}

/** Prompt for an image URL (and alt text), then insert. */
function promptForImage(schema: Schema, label: LabelResolver): Command {
  return (state, dispatch) => {
    const src = prompt(label('imageUrlPrompt'), 'https://picsum.photos/300/200');
    if (!src) return false;
    const alt = prompt(label('imageAltPrompt'), '') || '';
    return insertImage(schema, src, alt)(state, dispatch);
  };
}

export const imagePlugin = definePlugin({
  name: 'image',
  nodes: { image: imageNodeSpec },
  markdown: {
    nodes: {
      image(state: any, node: any) {
        // src / title escaped so spaces, `)` or quotes survive the round-trip (ED-6).
        const dest = markdownDestination(String(node.attrs.src ?? ''));
        state.write(`![${state.esc(node.attrs.alt || '')}](${dest}${markdownTitle(node.attrs.title)})`);
      },
    },
    parse: {
      image: {
        node: 'image',
        getAttrs: (tok: any) => ({
          src: tok.attrGet('src'),
          title: tok.attrGet('title') || null,
          alt: (tok.children?.[0] && tok.children[0].content) || null,
        }),
      },
    },
  },
  commands: ({ schema, label }): CommandSpec[] => [
    {
      id: 'insert-image',
      run: promptForImage(schema, label),
      text: 'Insert image',
      icon: '🖼',
      getIsEnabledCallback: () => true,
    },
  ],
  toolbarGroups: [{ id: 'image', text: 'Image', items: ['insert-image'] }],
  menuItems: ['insert-image'],
});
