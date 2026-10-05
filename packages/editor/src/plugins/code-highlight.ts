/**
 * Code-highlight plugin — Prism-based syntax highlighting for `code_block` nodes.
 *
 * The `code_block` node itself is CORE (its Markdown fence serializer lives in the
 * core maps); this plugin only contributes the decoration ProseMirror plugin, so
 * it adds no schema and needs no serializer wiring.
 */
import { definePlugin } from '../engine/plugin';
import { syntaxHighlightPlugin } from './syntax-highlight';

export const codeHighlightPlugin = definePlugin({
  name: 'code-highlight',
  pmPlugins: () => [syntaxHighlightPlugin],
});
