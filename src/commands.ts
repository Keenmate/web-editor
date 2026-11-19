/**
 * Core command helpers — the prompt-driven code-block commands kept with the core
 * schema (`code_block` is a core node). Formatting / block / history commands are
 * built directly from the schema in `engine/default-commands.ts`; the feature
 * commands (link, image, table) live in their respective first-party plugins.
 *
 * Each helper is a ProseMirror `Command`: `(state, dispatch?, view?) => boolean`.
 */
import type { Command } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';
import { createLabelResolver, type LabelResolver } from './labels';
import { promptText, whenPrompted } from './dialogs';

/** English-only resolver for standalone use (no element `labels`). */
const englishLabels: LabelResolver = createLabelResolver(() => null);

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'css',
  'html',
  'json',
  'bash',
  'sql',
  'yaml',
  'markdown',
];

/** Insert a code block with the given language. */
export function insertCodeBlock(language = 'javascript'): Command {
  return (state, dispatch) => {
    const node = state.schema.nodes.code_block.create({ language });
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}

/** Prompt for a code-block language (label `codeLanguagePrompt`, core `/dialog`), then insert. */
export function promptForCodeBlock(label: LabelResolver = englishLabels): Command {
  return whenPrompted(
    (view) => promptText(view, label, { title: label('headers.codeLanguage', { languages: LANGUAGES.join(', ') }), value: 'javascript' }),
    (language, state) => {
      const node = state.schema.nodes.code_block.create({ language: language.toLowerCase() });
      return language ? state.tr.replaceSelectionWith(node).scrollIntoView() : null;
    },
  );
}

/** The code block around the selection: its position and node, or `null`. */
function codeBlockAt(state: EditorState): { pos: number; language: string } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'code_block') return { pos: $from.before(d), language: node.attrs.language };
  }
  return null;
}

/** Change the language of the code block the cursor is in (label `codeLanguageChangePrompt`, core `/dialog`). */
export function changeCodeBlockLanguage(label: LabelResolver = englishLabels): Command {
  const prompted = whenPrompted(
    (view) => {
      const block = codeBlockAt(view.state);
      return promptText(view, label, {
        title: label('headers.codeLanguageChange', { languages: LANGUAGES.join(', ') }),
        value: block?.language ?? '',
      });
    },
    (language, state) => {
      const block = codeBlockAt(state);
      return language && block ? state.tr.setNodeMarkup(block.pos, undefined, { language: language.toLowerCase() }) : null;
    },
  );
  return (state, dispatch, view) => (codeBlockAt(state) ? prompted(state, dispatch, view) : false);
}
