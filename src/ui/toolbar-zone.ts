/**
 * ToolbarZone — the static (zone) toolbar: a row/column of divider-separated
 * {@link ToolGroup}s docked to one editor edge. Each group is rendered as its own
 * {@link CommandBar} (class `km-group`), so a group is one contiguous cluster and
 * the unit future drag-and-drop will move. Groups wrap into multiple rows (top /
 * bottom zones) or columns (start / end zones) via CSS.
 */
import type { CommandRegistry } from '../engine/command-registry';
import type { ToolGroup } from './items';
import { CommandBar } from './command-bar';

export class ToolbarZone {
  readonly el: HTMLDivElement;
  #groups: CommandBar[] = [];

  constructor(parent: HTMLElement, groups: readonly ToolGroup[], registry: CommandRegistry) {
    this.el = document.createElement('div');
    this.el.className = 'km-toolbar-zone';
    this.el.setAttribute('role', 'toolbar');

    groups.forEach((group, i) => {
      if (i > 0) {
        const divider = document.createElement('span');
        divider.className = 'km-group-sep';
        this.el.appendChild(divider);
      }
      const bar = new CommandBar(this.el, group.items, registry, {
        variant: 'bar',
        className: 'km-group',
      });
      bar.el.dataset.group = group.id;
      if (group.label) bar.el.setAttribute('aria-label', group.label);
      this.#groups.push(bar);
    });

    parent.appendChild(this.el);
  }

  refresh(): void {
    for (const bar of this.#groups) bar.refresh();
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }

  destroy(): void {
    for (const bar of this.#groups) bar.destroy();
    this.#groups = [];
    this.el.remove();
  }
}
