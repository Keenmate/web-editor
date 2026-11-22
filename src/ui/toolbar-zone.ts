/**
 * ToolbarZone — the static (zone) toolbar: a row/column of divider-separated
 * {@link ToolGroup}s docked to one editor edge. Each group is rendered as its own
 * {@link CommandBar} (class `we-group`), so a group is one contiguous cluster and
 * the unit future drag-and-drop will move. Groups wrap into multiple rows (top /
 * bottom zones) or columns (start / end zones) via CSS.
 *
 * Keyboard (WAI-ARIA toolbar, core `createRovingFocus`): the zone is ONE tab stop; the arrows along the
 * docked edge (Left / Right on top / bottom, Up / Down on start / end) and Home / End move focus across every
 * group. The groups are `role="group"` (named by `ariaLabels.<groupId>Group`).
 */
import { VIEW_MODE_GROUP_ID, type ToolGroup } from './items';
import type { ActionSurfaceHost } from './actions';
import { CommandBar } from './command-bar';
import { labelKey } from '../labels';
import { createRovingFocus, type RovingFocus } from '@keenmate/web-components-core/a11y';

export class ToolbarZone {
  readonly el: HTMLDivElement;
  #groups: CommandBar[] = [];
  /** The divider BEFORE each group (index-aligned with #groups; `undefined` for the first). */
  #seps: (HTMLElement | undefined)[] = [];
  #groupDefs: readonly ToolGroup[];
  #host: ActionSurfaceHost;
  /** Wanted at all (the `toolbar` input, not disabled). */
  #isWanted = true;
  /** Editing on: every group; off (read-only / preview): only the view-mode group. */
  #isEditable = true;
  #roving: RovingFocus | null = null;
  #orientation: 'horizontal' | 'vertical' | null = null;

  constructor(parent: HTMLElement, groups: readonly ToolGroup[], host: ActionSurfaceHost) {
    this.el = document.createElement('div');
    this.el.className = 'we-toolbar-zone';
    this.el.setAttribute('role', 'toolbar');
    this.#groupDefs = groups;
    this.#host = host;

    groups.forEach((group, i) => {
      let divider: HTMLElement | undefined;
      // The view-mode group is pushed to the far end (CSS) — no divider before it.
      if (i > 0 && group.id !== VIEW_MODE_GROUP_ID) {
        divider = document.createElement('span');
        divider.className = 'we-group-sep';
        this.el.appendChild(divider);
      }
      this.#seps.push(divider);
      const bar = new CommandBar(this.el, group.items, host, {
        className: 'we-group',
        source: 'toolbar',
        role: 'group',
      });
      bar.el.dataset.group = group.id;
      if (group.id === VIEW_MODE_GROUP_ID) bar.el.classList.add('we-group-view');
      this.#groups.push(bar);
    });

    parent.appendChild(this.el);
  }

  refresh(): void {
    this.#groups.forEach((bar, i) => {
      // Accessible group name through `labels` (`ariaLabels.<groupId>Group`, English: the group's `text`).
      const group = this.#groupDefs[i];
      const name = this.#host.label(`ariaLabels.${labelKey(group.id)}Group`, undefined, group.text ?? '');
      if (name) bar.el.setAttribute('aria-label', name);
      else bar.el.removeAttribute('aria-label');
      bar.refresh();
    });
    this.#applyVisibility();
    this.#syncKeyboard();
  }

  /** Roving focus along the docked edge; re-created when the zone moves between a row and a column. */
  #syncKeyboard(): void {
    const surface = this.el.closest('.we-surface');
    const orientation = surface?.classList.contains('we-tb-start') || surface?.classList.contains('we-tb-end') ? 'vertical' : 'horizontal';
    if (orientation === this.#orientation && this.#roving) {
      this.#roving.refresh();
      return;
    }
    this.#roving?.destroy();
    this.#orientation = orientation;
    this.el.setAttribute('aria-orientation', orientation);
    this.#roving = createRovingFocus(this.el, {
      getItems: () => this.#groups.flatMap((bar) => bar.focusableButtons()),
      orientation,
    });
  }

  /**
   * `isWanted`: the toolbar is on at all. `isEditable`: editing is on — off (read-only,
   * `preview`) keeps only the view-mode group, so the user can switch back.
   */
  setVisible(isWanted: boolean, isEditable = true): void {
    this.#isWanted = isWanted;
    this.#isEditable = isEditable;
    this.#applyVisibility();
  }

  /** Show the groups that pass the editable filter and have a visible item; dividers only between shown groups; hide an empty zone. */
  #applyVisibility(): void {
    let shown = 0;
    this.#groups.forEach((bar, i) => {
      const isShown =
        this.#isWanted &&
        (this.#isEditable || this.#groupDefs[i].id === VIEW_MODE_GROUP_ID) &&
        bar.el.childElementCount > 0;
      bar.setVisible(isShown);
      const sep = this.#seps[i];
      if (sep) sep.hidden = !(isShown && shown > 0);
      if (isShown) shown++;
    });
    this.el.hidden = shown === 0;
  }

  /** Focus the zone's tab stop (Alt+F10); `false` when the zone is hidden or has no enabled button. */
  focus(): boolean {
    if (this.el.hidden || !this.el.isConnected) return false;
    this.#syncKeyboard();
    const roving = this.#roving!;
    const target = roving.current ?? this.#groups.flatMap((bar) => bar.focusableButtons())[0];
    if (!target) return false;
    roving.focusItem(target);
    return true;
  }

  destroy(): void {
    this.#roving?.destroy();
    this.#roving = null;
    for (const bar of this.#groups) bar.destroy();
    this.#groups = [];
    this.el.remove();
  }
}
