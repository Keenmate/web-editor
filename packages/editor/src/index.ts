/**
 * `@keenmate/web-editor` — public surface.
 *
 * Phase 0 exposes the ported building blocks (schema, commands, editor factory,
 * syntax-highlight plugin). The `<km-editor>` Web Component (BlissElement shell
 * on `@keenmate/web-components-core`) and the HTML/Markdown/JSON serialization
 * API arrive in Phases 1–2.
 */
import './css/editor.css';

export { schema } from './schema';
export { commands } from './commands';
export {
  insertImage,
  insertTable,
  insertCodeBlock,
  toggleLink,
} from './commands';
export {
  createEditor,
  createEditorState,
  createDefaultDoc,
  type CreateEditorOptions,
} from './editor';
export { syntaxHighlightPlugin } from './plugins/syntax-highlight';
