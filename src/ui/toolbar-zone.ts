/**
 * ToolbarZone — the static (zone) toolbar: a row/column of divider-separated
 * {@link ToolGroup}s docked to one editor edge. Each group is rendered as its own
 * {@link CommandBar} (class `we-group`), so a group is one contiguous cluster and
 * the unit future drag-and-drop will move. Groups wrap into multiple rows (top /
 * bottom zones) or columns (start / end zones) via CSS.
 */
import type { ToolGroup } from './items';
import type { ActionSurfaceHost } from './actions';
import { CommandBar } from './command-bar';
import { labelKey } from '../labels';

export class ToolbarZone {
  readonly el: HTMLDivElement;
  #groups: CommandBar[] = [];
  #groupDefs: readonly ToolGroup[];
  #host: ActionSurfaceHost;

  constructor(parent: HTMLElement, groups: readonly ToolGroup[], host: ActionSurfaceHost) {
    this.el = document.createElement('div');
    this.el.className = 'we-toolbar-zone';
    this.el.setAttribute('role', 'toolbar');
    this.#groupDefs = groups;
    this.#host = host;

    groups.forEach((group, i) => {
      if (i > 0) {
        const divider = document.createElement('span');
        divider.className = 'we-group-sep';
        this.el.appendChild(divider);
      }
      const bar = new CommandBar(this.el, group.items, host, {
        className: 'we-group',
        source: 'toolbar',
      });
      bar.el.dataset.group = group.id;
      this.#groups.push(bar);
    });

    parent.appendChild(this.el);
  }

  refresh(): void {
    this.#groups.forEach((bar, i) => {
      // Accessible group name through `labels` (`<groupId>Group`, English: the group's `text`).
      const group = this.#groupDefs[i];
      const name = this.#host.label(`${labelKey(group.id)}Group`, undefined, group.text ?? '');
      if (name) bar.el.setAttribute('aria-label', name);
      else bar.el.removeAttribute('aria-label');
      bar.refresh();
    });
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
