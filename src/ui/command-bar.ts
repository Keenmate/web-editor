/**
 * CommandBar — renders a list of action-item entries ({@link EditorToolbarEntry})
 * as buttons and keeps them in sync with the current editor state: each refresh
 * resolves every item against the surface ctx (core `resolveMenuEntries` — the
 * item's `get*Callback` wins, then its static field, then the command's
 * defaults), drops hidden items and trims dividers.
 *
 * It is the shared presenter behind all three surfaces:
 *   - `variant: 'bar'`  — compact icon buttons in a row (static + selection toolbars)
 *   - `variant: 'menu'` — labelled items in a column (context menu)
 *
 * A click activates the item through the host (core `runAction`). The bar owns
 * a single wrapper element appended to `parent`; {@link destroy} removes exactly
 * that wrapper, so a parent slot can be reused across rebuilds.
 */
import {
  normalizeActionItems,
  resolveMenuEntries,
  type ResolvedActionItem,
} from '@keenmate/web-components-core/actions';
import type { EditorAction, EditorActionItem, EditorActionSource, EditorToolbarEntry } from '../interaction';
import { commandDefaults, type ActionSurfaceHost } from './actions';

export type CommandBarVariant = 'bar' | 'menu';

export interface CommandBarOptions {
  variant?: CommandBarVariant;
  /** Override the wrapper class (e.g. `'we-group'` when used as a tool group). */
  className?: string;
  /** The `source` reported on the `action` event. Default `'toolbar'`. */
  source?: EditorActionSource;
  /** Called when an item is activated (e.g. to close a menu), before the action runs. */
  onActivate?: (item: EditorActionItem) => void;
}

type Entry = EditorActionItem | { divider: true; text?: string };

export class CommandBar {
  /** The wrapper element (appended to the parent given to the constructor). */
  readonly el: HTMLDivElement;

  #host: ActionSurfaceHost;
  #entries: Entry[];
  #variant: CommandBarVariant;
  #source: EditorActionSource;
  #onActivate?: (item: EditorActionItem) => void;
  /** One button per item, reused across re-layouts. */
  #buttons = new Map<EditorActionItem, HTMLButtonElement>();
  /** The visible layout last rendered (item indexes + `|` for dividers). */
  #layout = '';

  constructor(
    parent: HTMLElement,
    entries: readonly EditorToolbarEntry[],
    host: ActionSurfaceHost,
    opts: CommandBarOptions = {}
  ) {
    this.#host = host;
    // Expand the string shorthand ONCE, so each item keeps its identity (core's
    // busy guard and the button cache key on it).
    this.#entries = normalizeActionItems(entries as (string | EditorActionItem)[]) as Entry[];
    this.#variant = opts.variant ?? 'bar';
    this.#source = opts.source ?? 'toolbar';
    this.#onActivate = opts.onActivate;

    this.el = document.createElement('div');
    this.el.className = opts.className ?? (this.#variant === 'menu' ? 'we-menu' : 'we-command-bar');
    this.el.setAttribute('role', this.#variant === 'menu' ? 'menu' : 'toolbar');

    parent.appendChild(this.el);
    this.refresh();
  }

  /** Re-resolve every item against the current state (visibility, text, toggled, disabled). */
  refresh(): void {
    const registry = this.#host.registry;
    const resolved = resolveMenuEntries<any, EditorAction>(this.#entries, this.#host.context(), (item) =>
      commandDefaults(registry, item)
    );

    const layout = resolved
      .map((r) => (r.kind === 'divider' ? '|' : String(this.#entries.indexOf(r.item))))
      .join(',');
    if (layout !== this.#layout) {
      this.#layout = layout;
      this.el.replaceChildren(
        ...resolved.map((r) => (r.kind === 'divider' ? this.#divider() : this.#button(r.item)))
      );
    }
    for (const r of resolved) {
      if (r.kind !== 'item') continue;
      // A toggle defines its toggle state (the item, or its command's getIsToggledCallback).
      const isToggle =
        r.item.isToggled !== undefined ||
        typeof r.item.getIsToggledCallback === 'function' ||
        commandDefaults(registry, r.item)?.isToggled !== undefined;
      this.#apply(this.#button(r.item), r.resolved, isToggle);
    }
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }

  destroy(): void {
    this.el.remove();
    this.#buttons.clear();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #divider(): HTMLElement {
    const s = document.createElement('span');
    s.className = this.#variant === 'menu' ? 'we-menu-sep' : 'we-sep';
    s.setAttribute('role', 'separator');
    return s;
  }

  #button(item: EditorActionItem): HTMLButtonElement {
    let btn = this.#buttons.get(item);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    // Keep the editor's selection alive while clicking the chrome (mousedown
    // in a toolbar would otherwise blur the editor and collapse the range).
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn!.disabled) return;
      this.#onActivate?.(item);
      void this.#host.activate(item, this.#source, e, btn!);
    });
    this.#buttons.set(item, btn);
    return btn;
  }

  #apply(btn: HTMLButtonElement, r: ResolvedActionItem<EditorAction>, isToggle: boolean): void {
    const isMenu = this.#variant === 'menu';
    btn.dataset.action = r.action;
    if (r.id !== undefined) btn.dataset.id = r.id;
    else delete btn.dataset.id;
    btn.className = [isMenu ? 'we-menu-item' : 'we-cmd', r.cssClass, r.isToggled && 'toggled', r.isDanger && 'we-danger']
      .filter(Boolean)
      .join(' ');
    if (isMenu) {
      // A toggle is a menuitemcheckbox (aria-checked); everything else a menuitem.
      btn.setAttribute('role', isToggle ? 'menuitemcheckbox' : 'menuitem');
      if (isToggle) btn.setAttribute('aria-checked', String(r.isToggled));
      else btn.removeAttribute('aria-checked');
    }

    if (isMenu) {
      const label = document.createElement('span');
      label.className = 'we-menu-label';
      label.textContent = r.text;
      const parts: Node[] = [label];
      if (r.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'we-menu-shortcut';
        shortcut.textContent = r.shortcut;
        parts.push(shortcut);
      }
      btn.replaceChildren(...parts);
    } else {
      btn.textContent = r.icon ?? r.text;
      if (r.isToggled) btn.setAttribute('aria-pressed', 'true');
      else btn.removeAttribute('aria-pressed');
    }
    btn.title = r.tooltip ?? r.text;
    btn.setAttribute('aria-label', r.text);
    btn.disabled = r.isDisabled;
    btn.setAttribute('aria-disabled', String(r.isDisabled));
  }
}
