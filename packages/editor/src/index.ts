/**
 * `@keenmate/web-editor` — public surface.
 *
 * Importing this module registers the `<km-editor>` custom element (the primary
 * entry point, a BlissElement shell on `@keenmate/web-components-core`) and
 * re-exports the headless engine + serialization layer for programmatic use.
 */
// Produces the shipped dist/style.css via Vite, and feeds the inlined stylesheet
// the element adopts into its shadow root.
import './css/editor.css';

import { registerComponent } from '@keenmate/web-components-core';
import { KmEditorElement } from './web-component';
import { logging } from './logger';

// ── Web Component ─────────────────────────────────────────────────────────
export { KmEditorElement } from './web-component';
export type {
  EditorMode,
  EditorFormat,
  EditorToolbar,
  EditorChangeDetail,
  EditorModeChangeDetail,
} from './web-component';

// Command-driven toolbar / menu item model (Phase 4) — override the defaults to
// customise the static toolbar, selection toolbar, or context menu.
export {
  defaultToolbarItems,
  defaultSelectionItems,
  defaultContextMenuItems,
} from './ui/items';
export type { ToolbarItem, CommandItem, SeparatorItem } from './ui/items';

// Logging controls
export {
  enableLogging,
  disableLogging,
  setLogLevel,
  setCategoryLevel,
  LOGGING_CATEGORIES,
  initLogger,
  contentLogger,
  uiLogger,
} from './logger';

// Headless engine
export { EditorEngine } from './engine/editor-engine';
export type {
  EditorEngineOptions,
  EngineEventMap,
} from './engine/editor-engine';
export { CommandRegistry } from './engine/command-registry';
export type { CommandSpec } from './engine/command-registry';
export { EventEmitter } from './engine/event-emitter';
export { registerCoreCommands } from './engine/default-commands';

// Plugin system (Phase 5)
export { definePlugin, orderPlugins, assembleItems, mergeSchemaSpecs } from './engine/plugin';
export type { EditorPlugin, PluginContext, SetupContext, MarkdownContribution } from './engine/plugin';
export { defaultPlugins } from './engine/default-plugins';
export { buildMarkdownIO, mergeMarkdown } from './engine/markdown-io';
export type { MarkdownIO, MergedMarkdown } from './engine/markdown-io';
export { linkPlugin } from './plugins/link';
export { imagePlugin } from './plugins/image';
export { tablePlugin } from './plugins/tables';
export { codeHighlightPlugin } from './plugins/code-highlight';

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
  nodeToHTML,
  buildMarkdownSerializer,
  buildMarkdownParser,
  type SerializationFormat,
  type DocJSON,
} from './engine/serialization';

// Schema + building blocks
export {
  schema,
  buildSchema,
  baseNodes,
  baseMarks,
  coreNodes,
  coreMarks,
  linkMarkSpec,
  imageNodeSpec,
  tableNodeSpecs,
} from './schema';
export type { SchemaExtensions } from './schema';
export { insertCodeBlock, promptForCodeBlock, changeCodeBlockLanguage } from './commands';
export {
  createEditorState,
  createDefaultDoc,
  type CreateEditorStateOptions,
} from './editor';
export { syntaxHighlightPlugin } from './plugins/syntax-highlight';

// ── Registration ────────────────────────────────────────────────────────────
// Defines the element, publishes build metadata + the flattened logging controls
// on window.components['km-editor'], and wires getInstances() to the live-instance
// registry BlissElement maintains. Idempotent with the define in web-component.ts.
declare const __PACKAGE_NAME__: string;
declare const __VERSION__: string;
declare const __AUTHOR__: string;
declare const __LICENSE__: string;
declare const __REPOSITORY__: string;
declare const __HOMEPAGE__: string;

registerComponent('km-editor', KmEditorElement as unknown as CustomElementConstructor, {
  config: {
    name: typeof __PACKAGE_NAME__ !== 'undefined' ? __PACKAGE_NAME__ : '@keenmate/web-editor',
    version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0',
    author: typeof __AUTHOR__ !== 'undefined' ? __AUTHOR__ : 'Keenmate s.r.o.',
    license: typeof __LICENSE__ !== 'undefined' ? __LICENSE__ : 'MIT',
    repository: typeof __REPOSITORY__ !== 'undefined' ? __REPOSITORY__ : '',
    homepage: typeof __HOMEPAGE__ !== 'undefined' ? __HOMEPAGE__ : '',
  },
  logging,
});

declare global {
  interface HTMLElementTagNameMap {
    'km-editor': KmEditorElement;
  }
}
