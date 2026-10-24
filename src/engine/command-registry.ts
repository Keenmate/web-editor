/**
 * Command registry — the single abstraction that toolbars, context menus, and
 * keybindings all bind to.
 *
 * A command is a ProseMirror `Command` (`(state, dispatch?, view?) => boolean`)
 * plus optional metadata: keybindings, display defaults (`text` / `icon` /
 * `tooltip` — what a toolbar / menu item naming this command shows unless it
 * sets its own), a `getIsActiveCallback` (toggle state, the toolbar highlight)
 * and a `getIsEnabledCallback` (defaults to a dry run of the command).
 *
 * A registered command id is a built-in action name: a toolbar / menu item
 * `{ action: 'bold' }` (or the shorthand `'bold'`) runs it.
 */
import { keymap } from 'prosemirror-keymap';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CommandContext } from '../interaction';

export interface CommandSpec {
  /** The command / built-in action name — kebab-case (`'insert-link'`); plugin pipelines may namespace with `:`. */
  id: string;
  run: Command;
  /** Keybindings in ProseMirror keymap syntax, e.g. `['Mod-b']`. The first is the item's display `shortcut`. */
  keys?: string[];
  /** Default label of an item naming this command (`'Bold'`). */
  text?: string;
  /** Default compact glyph of a toolbar item naming this command (`'B'`). */
  icon?: string;
  /** Default tooltip; else `text` + the display shortcut (`'Bold (Ctrl+B)'`). */
  tooltip?: string;
  /** Whether the command's effect is currently applied (toolbar highlight / `aria-pressed`). */
  getIsActiveCallback?: (ctx: CommandContext) => boolean;
  /** Whether the command can currently run. Defaults to a dry run of `run`. */
  getIsEnabledCallback?: (ctx: CommandContext) => boolean;
}

/** Builds the ctx a command predicate receives (the engine attaches `controller` / `element` when hosted). */
export type CommandContextFactory = (fields: { state: EditorState }) => CommandContext;

const plainContext: CommandContextFactory = (fields) => fields as CommandContext;

const isApple = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** `'Mod-Shift-z'` → `'Ctrl+Shift+Z'` (`'Cmd+Shift+Z'` on Apple platforms). */
export function formatShortcut(key: string): string {
  return key
    .split('-')
    .map((part) => {
      if (part === 'Mod') return isApple() ? 'Cmd' : 'Ctrl';
      if (part.length === 1) return part.toUpperCase();
      return part;
    })
    .join('+');
}

export class CommandRegistry {
  private map = new Map<string, CommandSpec>();
  /** When set, `run(id)` delegates to this (the engine's PipelineRegistry), so
   * every command fires through its pipeline (hooks apply). Falls back to a
   * direct command run when unset (standalone registry use / tests). */
  private runner?: (id: string) => boolean;

  constructor(
    private readonly getView: () => EditorView | undefined,
    private readonly createContext: CommandContextFactory = plainContext
  ) {}

  /** Route `run(id)` through a pipeline runner (set by the engine). */
  attachRunner(runner: (id: string) => boolean): void {
    this.runner = runner;
  }

  /** Register (or overwrite) a command. */
  register(spec: CommandSpec): void {
    this.map.set(spec.id, spec);
  }

  registerMany(specs: CommandSpec[]): void {
    specs.forEach((s) => this.register(s));
  }

  get(id: string): CommandSpec | undefined {
    return this.map.get(id);
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  /** Execute a command by id against the live view, then refocus. Delegates to
   * the pipeline runner when one is attached (so hooked stages run too). */
  run(id: string): boolean {
    const view = this.getView();
    if (!view) return false;
    if (this.runner) {
      const ok = this.runner(id);
      view.focus();
      return ok;
    }
    const spec = this.map.get(id);
    if (!spec) return false;
    const ok = spec.run(view.state, view.dispatch, view);
    view.focus();
    return ok;
  }

  isActive(id: string): boolean {
    const view = this.getView();
    const spec = this.map.get(id);
    if (!view || !spec?.getIsActiveCallback) return false;
    return spec.getIsActiveCallback(this.createContext({ state: view.state }));
  }

  isEnabled(id: string): boolean {
    const view = this.getView();
    const spec = this.map.get(id);
    if (!view || !spec) return false;
    return spec.getIsEnabledCallback
      ? spec.getIsEnabledCallback(this.createContext({ state: view.state }))
      : spec.run(view.state);
  }

  /** The display shortcut of a command (its first key), e.g. `'Ctrl+B'`. */
  shortcut(id: string): string | undefined {
    const key = this.map.get(id)?.keys?.[0];
    return key ? formatShortcut(key) : undefined;
  }

  /** Build a ProseMirror keymap plugin from every command that declares `keys`. */
  keymap(): Plugin {
    const bindings: Record<string, Command> = {};
    for (const spec of this.map.values()) {
      for (const key of spec.keys ?? []) {
        bindings[key] = spec.run;
      }
    }
    return keymap(bindings);
  }
}
