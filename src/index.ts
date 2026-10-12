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
  EditorStatusBar,
  EditorChangeDetail,
  EditorModeChangeDetail,
} from './web-component';

// Toolbar zones / tool groups / status items model. Override the core groups or
// contribute via plugins to customise the zone toolbar, selection toolbar,
// context menu, or status bar.
export {
  defaultToolbarItems,
  defaultSelectionItems,
  defaultContextMenuItems,
  coreToolbarGroups,
  coreHistoryGroups,
  coreSelectionItems,
  coreMenuItems,
  coreMenuHistoryItems,
  coreStatusItems,
} from './ui/items';
export type { ToolbarItem, CommandItem, SeparatorItem, ToolGroup, StatusItem } from './ui/items';

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
export {
  definePlugin,
  orderPlugins,
  assembleItems,
  assembleGroups,
  assembleStatusItems,
  mergeSchemaSpecs,
} from './engine/plugin';
export type { EditorPlugin, PluginContext, SetupContext, MarkdownContribution } from './engine/plugin';
export { defaultPlugins } from './engine/default-plugins';
export { buildMarkdownIO, mergeMarkdown } from './engine/markdown-io';
export type { MarkdownIO, MergedMarkdown } from './engine/markdown-io';
export { linkPlugin } from './plugins/link';
export { imagePlugin } from './plugins/image';
export { tablePlugin } from './plugins/tables';
export { codeHighlightPlugin } from './plugins/code-highlight';
export { imageBrowserPlugin } from './plugins/image-browser';
export type { CloudAsset, ImageBrowserOptions } from './plugins/image-browser';
export { imageBase64Plugin } from './plugins/image-base64';

// Pipeline layer (Phase 7) — named, trigger/command-bound stage chains. Commands
// auto-wrap into one-stage sync pipelines; plugins declare pipelines and splice
// stages by anchor. See PIPELINES.md.
export { runStages, runStagesSync, DeferredRunner } from './engine/pipeline/runner';
export type { RunResult, DeferredRunnerDeps } from './engine/pipeline/runner';
export { assemblePipelines, wrapCommandAsPipeline } from './engine/pipeline/assemble';
export { PipelineRegistry, defaultInteractionHost } from './engine/pipeline/registry';
export type { PipelineRegistryDeps } from './engine/pipeline/registry';
export type {
  Pipeline,
  PipelineStage,
  PipelineContext,
  PipelinePolicy,
  Timing,
  StageOutcome,
  StageRuntime,
  StageServices,
  StageContribution,
  StageReport,
  StageReporter,
  StagePhase,
  RunStatus,
  PipelineEvent,
  PipelineListener,
  InteractionHost,
  InteractionRequest,
  InteractionResult,
} from './engine/pipeline/types';

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
