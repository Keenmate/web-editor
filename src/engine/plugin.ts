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
import type { ToolbarItem, ToolGroup, StatusItem } from '../ui/items';
import type { Pipeline, StageContribution } from './pipeline/types';

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

  /**
   * Tool groups added to the static (zone) toolbar — each a draggable unit. A
   * group whose `id` matches an existing one (core or an earlier plugin) REPLACES
   * it in place (last plugin wins); a new id slots in after the core leading
   * groups. Use {@link removeToolbarGroups} to drop one.
   */
  toolbarGroups?: readonly ToolGroup[];
  /** Ids of toolbar groups to remove from the assembled toolbar (incl. core). */
  removeToolbarGroups?: readonly string[];
  /** Flat items appended to the selection toolbar / context menu (not grouped). */
  selectionItems?: readonly ToolbarItem[];
  menuItems?: readonly ToolbarItem[];
  /**
   * Live indicators added to the status bar. Same id semantics as
   * {@link toolbarGroups}: a matching `id` replaces in place (last wins), a new id
   * is appended. Use {@link removeStatusItems} to drop one (e.g. a core `words`).
   */
  statusItems?: readonly StatusItem[];
  /** Ids of status items to remove from the assembled status bar (incl. core). */
  removeStatusItems?: readonly string[];

  /**
   * Pipelines this plugin DECLARES (named, trigger/command-bound stage chains).
   * A name matching a command wrapper overrides it (last plugin wins). See
   * PIPELINES.md — "commands ARE pipelines".
   */
  pipelines?: Pipeline[];
  /**
   * Stage contributions INTO other pipelines, keyed by pipeline name — the
   * universal extension bus. Each entry inserts (before/after an id), replaces
   * in place, or removes a stage, without importing the owning plugin. An
   * unknown pipeline name or a missing anchor throws at assembly.
   */
  stages?: Record<string, StageContribution[]>;

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

type ItemKey = 'selectionItems' | 'menuItems';

/**
 * Assemble one flat presenter list (selection toolbar / context menu): `leading`
 * core items, then each plugin's items (in plugin order), then `trailing`.
 */
export function assembleItems(
  plugins: readonly EditorPlugin[],
  key: ItemKey,
  leading: readonly ToolbarItem[] = [],
  trailing: readonly ToolbarItem[] = []
): ToolbarItem[] {
  return [...leading, ...plugins.flatMap((p) => [...(p[key] ?? [])]), ...trailing];
}

/** Collapse duplicate ids among a plugin contribution: last value wins, first slot kept. */
function dedupeLastWins<T extends { id: string }>(items: readonly T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const item of items) {
    const i = at.get(item.id);
    if (i === undefined) {
      at.set(item.id, out.length);
      out.push(item);
    } else {
      out[i] = item;
    }
  }
  return out;
}

/**
 * Layer plugin contributions over the core `leading`/`trailing`:
 * - a plugin entry whose id matches a core one REPLACES it in place,
 * - a brand-new id is inserted between leading and trailing,
 * - later plugins win over earlier ones (by id),
 * - ids in `removed` are dropped last.
 */
function layerById<T extends { id: string }>(
  leading: readonly T[],
  middle: readonly T[],
  trailing: readonly T[],
  removed: ReadonlySet<string>
): T[] {
  const mid = dedupeLastWins(middle);
  const byId = new Map(mid.map((x) => [x.id, x]));
  const used = new Set<string>();
  const take = (x: T): T => {
    const override = byId.get(x.id);
    if (override) {
      used.add(x.id);
      return override;
    }
    return x;
  };
  const lead = leading.map(take);
  const trail = trailing.map(take);
  const fresh = mid.filter((x) => !used.has(x.id));
  return [...lead, ...fresh, ...trail].filter((x) => !removed.has(x.id));
}

/** Assemble the zone toolbar's groups: core `leading`/`trailing` layered with plugin groups. */
export function assembleGroups(
  plugins: readonly EditorPlugin[],
  leading: readonly ToolGroup[] = [],
  trailing: readonly ToolGroup[] = []
): ToolGroup[] {
  const middle = plugins.flatMap((p) => [...(p.toolbarGroups ?? [])]);
  const removed = new Set(plugins.flatMap((p) => [...(p.removeToolbarGroups ?? [])]));
  return layerById(leading, middle, trailing, removed);
}

/** Assemble the status bar's items: core `leading` layered with each plugin's. */
export function assembleStatusItems(
  plugins: readonly EditorPlugin[],
  leading: readonly StatusItem[] = []
): StatusItem[] {
  const middle = plugins.flatMap((p) => [...(p.statusItems ?? [])]);
  const removed = new Set(plugins.flatMap((p) => [...(p.removeStatusItems ?? [])]));
  return layerById(leading, middle, [], removed);
}
