/**
 * Core command helpers — the prompt-driven code-block commands kept with the core
 * schema (`code_block` is a core node). Formatting / block / history commands are
 * built directly from the schema in `engine/default-commands.ts`; the feature
 * commands (link, image, table) live in their respective first-party plugins.
 *
 * Each helper is a ProseMirror `Command`: `(state, dispatch?, view?) => boolean`.
 */
import type { Command } from 'prosemirror-state';

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

/** Prompt for a code-block language, then insert. */
export const promptForCodeBlock: Command = (state, dispatch) => {
  const language = prompt(`Enter language (${LANGUAGES.join(', ')}):`, 'javascript');
  if (!language) return false;
  return insertCodeBlock(language.toLowerCase())(state, dispatch);
};

/** Change the language of the code block the cursor is in. */
export const changeCodeBlockLanguage: Command = (state, dispatch) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'code_block') {
      const pos = $from.before(d);
      const language = prompt(`Change language (${LANGUAGES.join(', ')}):`, node.attrs.language);
      if (!language) return false;
      if (dispatch) {
        dispatch(state.tr.setNodeMarkup(pos, undefined, { language: language.toLowerCase() }));
      }
      return true;
    }
  }
  return false;
};
