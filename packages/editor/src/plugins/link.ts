/**
 * Link plugin — the `link` mark, its Markdown serializer/parser, the
 * `insert-link` command (Mod-k, prompt-driven), and the toolbar / selection /
 * menu items. HTML + JSON come from the mark spec; Markdown is wired here, so the
 * plugin satisfies the serializer contract for every target.
 */
import type { Command } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';
import { definePlugin } from '../engine/plugin';
import type { CommandSpec } from '../engine/command-registry';
import { linkMarkSpec } from '../schema';
import { markActive } from '../predicates';

/** Toggle or set a link on the selection (removes an existing one). */
function toggleLink(schema: Schema, href?: string, title = ''): Command {
  return (state, dispatch) => {
    const { tr, selection } = state;
    const { from, to } = selection;
    const linkMark = schema.marks.link;
    if (state.doc.rangeHasMark(from, to, linkMark)) {
      if (dispatch) dispatch(tr.removeMark(from, to, linkMark));
      return true;
    }
    if (!href) return false;
    if (dispatch) dispatch(tr.addMark(from, to, linkMark.create({ href, title })));
    return true;
  };
}

/** Prompt for a URL (or remove an existing link on the selection). */
function promptForLink(schema: Schema): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      alert('Please select some text first to create a link.');
      return false;
    }
    if (state.doc.rangeHasMark(from, to, schema.marks.link)) {
      return toggleLink(schema)(state, dispatch);
    }
    const href = prompt('Enter link URL:', 'https://');
    if (!href) return false;
    return toggleLink(schema, href)(state, dispatch);
  };
}

export const linkPlugin = definePlugin({
  name: 'link',
  marks: { link: linkMarkSpec },
  markdown: {
    marks: {
      link: {
        open: '[',
        close(_state: any, mark: any) {
          const href = mark.attrs.href || '';
          const title = mark.attrs.title
            ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"`
            : '';
          return `](${href}${title})`;
        },
      },
    },
    parse: {
      link: {
        mark: 'link',
        getAttrs: (tok: any) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }),
      },
    },
  },
  commands: ({ schema }): CommandSpec[] => [
    {
      id: 'insert-link',
      run: promptForLink(schema),
      keys: ['Mod-k'],
      isActive: (s) => markActive(s, schema.marks.link),
      // Non-empty selection only — also avoids the "select text first" alert.
      isEnabled: (s) => !s.selection.empty,
    },
  ],
  toolbarItems: [
    { type: 'separator' },
    { type: 'command', command: 'insert-link', label: 'Link', icon: '🔗', title: 'Insert link (select text first)' },
  ],
  selectionItems: [
    { type: 'separator' },
    { type: 'command', command: 'insert-link', label: 'Link', icon: '🔗', title: 'Insert link' },
  ],
  menuItems: [{ type: 'command', command: 'insert-link', label: 'Insert link' }],
});
