/**
 * CommandBar — renders a {@link ToolbarItem} list as command buttons and keeps
 * their `active` / `disabled` state in sync with the engine's CommandRegistry.
 *
 * It is the shared presenter behind all three Phase 4 surfaces:
 *   - `variant: 'bar'`  — compact icon buttons in a row (static + selection toolbars)
 *   - `variant: 'menu'` — labelled items in a column (context menu)
 *
 * The bar owns a single wrapper element appended to `parent`; {@link destroy}
 * removes exactly that wrapper, so a parent slot can be reused across rebuilds.
 */
import type { CommandRegistry } from '../engine/command-registry';
import type { ToolbarItem } from './items';

export type CommandBarVariant = 'bar' | 'menu';

export interface CommandBarOptions {
  variant?: CommandBarVariant;
  /** Override the wrapper class (e.g. `'km-group'` when used as a tool group). */
  className?: string;
  /** Called after a command runs (e.g. to close a menu). */
  onRun?: (command: string) => void;
}

export class CommandBar {
  /** The wrapper element (appended to the parent given to the constructor). */
  readonly el: HTMLDivElement;

  #registry: CommandRegistry;
  #buttons: Array<{ command: string; btn: HTMLButtonElement }> = [];
  #onRun?: (command: string) => void;

  constructor(
    parent: HTMLElement,
    items: readonly ToolbarItem[],
    registry: CommandRegistry,
    opts: CommandBarOptions = {}
  ) {
    this.#registry = registry;
    this.#onRun = opts.onRun;
    const variant = opts.variant ?? 'bar';

    this.el = document.createElement('div');
    this.el.className = opts.className ?? (variant === 'menu' ? 'km-menu' : 'km-command-bar');
    this.el.setAttribute('role', variant === 'menu' ? 'menu' : 'toolbar');

    for (const item of items) {
      if (item.type === 'separator') {
        const s = document.createElement('span');
        s.className = variant === 'menu' ? 'km-menu-sep' : 'km-sep';
        this.el.appendChild(s);
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = variant === 'menu' ? 'km-menu-item' : 'km-cmd';
      btn.dataset.command = item.command;
      btn.textContent = variant === 'menu' ? item.label : item.icon ?? item.label;
      btn.title = item.title ?? item.label;
      btn.setAttribute('aria-label', item.label);
      if (variant === 'menu') btn.setAttribute('role', 'menuitem');

      // Keep the editor's selection alive while clicking the chrome (mousedown
      // in a toolbar would otherwise blur the editor and collapse the range).
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        this.#registry.run(item.command);
        this.#onRun?.(item.command);
      });

      this.el.appendChild(btn);
      this.#buttons.push({ command: item.command, btn });
    }

    parent.appendChild(this.el);
  }

  /** Reflect each command's current active / enabled state. */
  refresh(): void {
    for (const { command, btn } of this.#buttons) {
      btn.classList.toggle('active', this.#registry.isActive(command));
      const enabled = this.#registry.isEnabled(command);
      btn.disabled = !enabled;
      btn.setAttribute('aria-disabled', String(!enabled));
    }
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }

  destroy(): void {
    this.el.remove();
    this.#buttons = [];
  }
}
