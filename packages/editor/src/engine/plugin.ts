/**
 * Plugin system (Phase 5 / PLAN B2).
 *
 * An {@link EditorPlugin} is the single unit through which a feature contributes
 * to the editor: schema nodes/marks, commands, keybindings, ProseMirror plugins,
 * toolbar/menu items, and — the contract that keeps the three output formats in
 * sync — a Markdown serializer/parser for every node/mark it adds. (HTML and JSON
 * are schema-driven, so a node/mark's `toDOM`/`parseDOM` already serve them; only
 * Markdown needs explicit wiring. The engine enforces this at assembly time.)
 *
 * The engine merges the plugin set in dependency order: `dependencies` names must
 * resolve to earlier plugins, so a plugin can rely on another's schema/commands
 * already being present.
 */
import type { NodeSpec, MarkSpec, Schema } from 'prosemirror-model';
import type { SchemaExtensions } from '../schema';
import type { Command, EditorState, Plugin as PMPlugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CommandSpec } from './command-registry';
import type { ToolbarItem } from '../ui/items';

/**
 * Markdown (de)serialization a plugin contributes for its own nodes/marks. The
 * shapes match `prosemirror-markdown` (kept loose to avoid leaking its internal
 * state types across the plugin boundary).
 */
export interface MarkdownContribution {
  /** Per-node serializers: `(state, node, parent, index) => void`. */
  nodes?: Record<string, (state: any, node: any, parent: any, index: number) => void>;
  /** Per-mark serializer specs (`{ open, close, mixable?, ... }`). */
  marks?: Record<string, any>;
  /** Token→node/mark parse specs merged into the `MarkdownParser` (`ParseSpec`). */
  parse?: Record<string, any>;
  /** markdown-it rules to (re)enable — the CommonMark preset disables some. */
  enableRules?: string[];
}

/** Context handed to a plugin's builder callbacks once the schema is assembled. */
export interface PluginContext {
  schema: Schema;
}

/** Context handed to {@link EditorPlugin.setup} (after the view exists). */
export interface SetupContext extends PluginContext {
  view: EditorView;
  getState: () => EditorState;
}

export interface EditorPlugin {
  /** Unique id. Used for dependency resolution and dedup. */
  name: string;
  /** Names of plugins that must be assembled before this one. */
  dependencies?: string[];

  /** Schema nodes this plugin adds. Each MUST have a Markdown serializer (below). */
  nodes?: Record<string, NodeSpec>;
  /** Schema marks this plugin adds. Each MUST have a Markdown serializer (below). */
  marks?: Record<string, MarkSpec>;
  /** Markdown serializer/parser wiring for this plugin's nodes/marks. */
  markdown?: MarkdownContribution;

  /** Commands registered into the CommandRegistry (toolbars/menus/keys bind to these). */
  commands?: (ctx: PluginContext) => CommandSpec[];
  /** Extra structural keybindings (command keybindings belong on the commands). */
  keymap?: (ctx: PluginContext) => Record<string, Command>;
  /** Raw ProseMirror plugins (decorations, input rules, node views, …). */
  pmPlugins?: (ctx: PluginContext) => PMPlugin[];

  /** Items appended to the static toolbar / selection toolbar / context menu. */
  toolbarItems?: readonly ToolbarItem[];
  selectionItems?: readonly ToolbarItem[];
  menuItems?: readonly ToolbarItem[];

  /** Run once after the view is created. */
  setup?: (ctx: SetupContext) => void;
  /** Run once when the engine is destroyed. */
  destroy?: () => void;
}

/** Identity helper — gives call-site type-checking without a runtime cost. */
export function definePlugin(plugin: EditorPlugin): EditorPlugin {
  return plugin;
}

/**
 * Order plugins so every plugin follows its `dependencies` (stable topological
 * sort; input order breaks ties). Throws on a missing dependency or a cycle.
 */
export function orderPlugins(plugins: readonly EditorPlugin[]): EditorPlugin[] {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const result: EditorPlugin[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (plugin: EditorPlugin) => {
    if (done.has(plugin.name)) return;
    if (visiting.has(plugin.name)) {
      throw new Error(`Plugin dependency cycle involving "${plugin.name}"`);
    }
    visiting.add(plugin.name);
    for (const dep of plugin.dependencies ?? []) {
      const target = byName.get(dep);
      if (!target) {
        throw new Error(`Plugin "${plugin.name}" depends on missing plugin "${dep}"`);
      }
      visit(target);
    }
    visiting.delete(plugin.name);
    done.add(plugin.name);
    result.push(plugin);
  };

  for (const plugin of plugins) visit(plugin);
  return result;
}

/** Merge every plugin's node/mark specs into one `SchemaExtensions` for `buildSchema`. */
export function mergeSchemaSpecs(plugins: readonly EditorPlugin[]): SchemaExtensions {
  const nodes: Record<string, NodeSpec> = {};
  const marks: Record<string, MarkSpec> = {};
  for (const plugin of plugins) {
    Object.assign(nodes, plugin.nodes);
    Object.assign(marks, plugin.marks);
  }
  return { nodes, marks };
}

type ItemKey = 'toolbarItems' | 'selectionItems' | 'menuItems';

/**
 * Assemble one presenter's item list: `leading` core items, then each plugin's
 * items (in plugin order), then `trailing` core items.
 */
export function assembleItems(
  plugins: readonly EditorPlugin[],
  key: ItemKey,
  leading: readonly ToolbarItem[] = [],
  trailing: readonly ToolbarItem[] = []
): ToolbarItem[] {
  return [...leading, ...plugins.flatMap((p) => [...(p[key] ?? [])]), ...trailing];
}
