/**
 * `@keenmate/web-editor` — public surface.
 *
 * Phase 1 exposes the headless engine and serialization layer. The `<km-editor>`
 * Web Component (BlissElement shell on `@keenmate/web-components-core`) arrives in
 * Phase 2 and will become the primary entry point.
 */
import './css/editor.css';

// Headless engine
export { EditorEngine } from './engine/editor-engine';
export type {
  EditorEngineOptions,
  EngineEventMap,
} from './engine/editor-engine';
export { CommandRegistry } from './engine/command-registry';
export type { CommandSpec } from './engine/command-registry';
export { EventEmitter } from './engine/event-emitter';
export { registerDefaultCommands } from './engine/default-commands';

// Serialization layer
export {
  serialize,
  parse,
  docToHTML,
  htmlToDoc,
  docToJSON,
  jsonToDoc,
  docToMarkdown,
  markdownToDoc,
  markdownSerializer,
  type SerializationFormat,
  type DocJSON,
} from './engine/serialization';

// Schema + building blocks
export { schema, buildSchema, baseNodes, baseMarks } from './schema';
export type { SchemaExtensions } from './schema';
export { commands } from './commands';
export {
  createEditorState,
  createDefaultDoc,
  type CreateEditorStateOptions,
} from './editor';
export { syntaxHighlightPlugin } from './plugins/syntax-highlight';
