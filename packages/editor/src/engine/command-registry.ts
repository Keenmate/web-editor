/**
 * Command registry — the single abstraction that toolbars, context menus, and
 * keybindings all bind to.
 *
 * A command is a ProseMirror `Command` (`(state, dispatch?, view?) => boolean`)
 * plus optional metadata: keybindings, an `isActive` predicate (for toolbar
 * highlight) and an `isEnabled` predicate (defaults to a dry run of the command).
 */
import { keymap } from 'prosemirror-keymap';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export interface CommandSpec {
  id: string;
  run: Command;
  /** Keybindings in ProseMirror keymap syntax, e.g. `['Mod-b']`. */
  keys?: string[];
  /** Whether the command's effect is currently applied (toolbar highlight). */
  isActive?: (state: EditorState) => boolean;
  /** Whether the command can currently run. Defaults to a dry run of `run`. */
  isEnabled?: (state: EditorState) => boolean;
}

export class CommandRegistry {
  private map = new Map<string, CommandSpec>();

  constructor(private readonly getView: () => EditorView | undefined) {}

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

  /** Execute a command by id against the live view, then refocus. */
  run(id: string): boolean {
    const view = this.getView();
    const spec = this.map.get(id);
    if (!view || !spec) return false;
    const ok = spec.run(view.state, view.dispatch, view);
    view.focus();
    return ok;
  }

  isActive(id: string): boolean {
    const view = this.getView();
    const spec = this.map.get(id);
    if (!view || !spec?.isActive) return false;
    return spec.isActive(view.state);
  }

  isEnabled(id: string): boolean {
    const view = this.getView();
    const spec = this.map.get(id);
    if (!view || !spec) return false;
    return spec.isEnabled ? spec.isEnabled(view.state) : spec.run(view.state);
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
