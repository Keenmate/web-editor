/**
 * Image plugin — the inline `image` node, its Markdown serializer/parser, the
 * `insert-image` command (prompt-driven), and the toolbar / menu items.
 */
import type { Command } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { definePlugin } from '../engine/plugin';
import { promptText, whenPrompted } from '../dialogs';
import type { LabelResolver } from '../labels';
import type { CommandSpec } from '../engine/command-registry';
import { imageNodeSpec } from '../schema';
import { markdownDestination, markdownTitle } from '../engine/serialization/markdown';

/** Prompt for an image URL, then its alt text (core `/dialog`), then insert. Cancelling the alt text keeps `''`. */
function promptForImage(schema: Schema, label: LabelResolver): Command {
  return whenPrompted(
    async (view) => {
      const src = await promptText(view, label, { title: label('imageUrlPrompt'), value: 'https://picsum.photos/300/200', inputType: 'url' });
      if (!src) return null;
      const alt = (await promptText(view, label, { title: label('imageAltPrompt') })) || '';
      return { src, alt };
    },
    ({ src, alt }, state) => state.tr.replaceSelectionWith(schema.nodes.image.create({ src, alt, title: null })).scrollIntoView(),
  );
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
