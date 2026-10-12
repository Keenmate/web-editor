/**
 * Syntax-highlight plugin — decorates `code_block` text using Prism.js.
 *
 * Self-contained: it imports the Prism grammars and theme it needs, so any
 * consumer of this plugin gets highlighting without extra wiring. Ported from
 * the POC.
 */
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';

function getTokenContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(getTokenContent).join('');
  return getTokenContent(content.content);
}

function getDecorations(doc) {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      const language = node.attrs.language || 'javascript';
      const grammar = Prism.languages[language];

      if (grammar) {
        const code = node.textContent;
        const tokens = Prism.tokenize(code, grammar);

        let offset = pos + 1; // +1 for the <pre> tag

        const processTokens = (tokens) => {
          for (const token of tokens) {
            if (typeof token === 'string') {
              offset += token.length;
            } else {
              const content =
                typeof token.content === 'string' ? token.content : getTokenContent(token.content);
              const length = content.length;

              if (length > 0) {
                decorations.push(
                  Decoration.inline(offset, offset + length, {
                    class: `token ${token.type}${
                      token.alias
                        ? ' ' + (Array.isArray(token.alias) ? token.alias.join(' ') : token.alias)
                        : ''
                    }`,
                  })
                );
              }

              if (Array.isArray(token.content)) {
                processTokens(token.content);
              } else {
                offset += length;
              }
            }
          }
        };

        processTokens(tokens);
      }
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export const syntaxHighlightPlugin = new Plugin({
  state: {
    init(_, { doc }) {
      return getDecorations(doc);
    },
    apply(tr, decorations) {
      if (tr.docChanged) {
        return getDecorations(tr.doc);
      }
      return decorations.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});
