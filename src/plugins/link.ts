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
import { markdownDestination, markdownTitle } from '../engine/serialization/markdown';

/** Toggle or set a link on the selection (removes an existing one). */
function toggleLink(schema: Schema, href?: string, title: string | null = null): Command {
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
    // Nothing to link: a silent no-op (the toolbar / menu entry is disabled here;
    // Mod-k runs the command directly, so it must not pop a blocking alert — ED-5).
    if (empty) return false;
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
          // Same destination / title escaping as images (ED-6).
          return `](${markdownDestination(String(mark.attrs.href || ''))}${markdownTitle(mark.attrs.title)})`;
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
      text: 'Link',
      icon: '🔗',
      tooltip: 'Insert link (select text first)',
      getIsToggledCallback: ({ state }) => markActive(state, schema.marks.link),
      // Non-empty selection only.
      getIsEnabledCallback: ({ state }) => !state.selection.empty,
    },
  ],
  toolbarGroups: [{ id: 'link', text: 'Link', items: ['insert-link'] }],
  selectionItems: [{ divider: true }, { action: 'insert-link', tooltip: 'Insert link' }],
  menuItems: [{ action: 'insert-link', text: 'Insert link' }],
});
