/**
 * CommandBar — renders a list of action-item entries ({@link EditorToolbarEntry})
 * as buttons and keeps them in sync with the current editor state: each refresh
 * resolves every item against the surface ctx (core `resolveMenuEntries` — the
 * item's `get*Callback` wins, then its static field, then the command's
 * defaults), drops hidden items and trims dividers.
 *
 * It is the shared presenter behind the button surfaces — compact icon buttons
 * in a row (static zone toolbar + selection toolbar). The context menu is core
 * `openMenu()` (see `context-menu.ts`).
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

export interface CommandBarOptions {
  /** Override the wrapper class (e.g. `'we-group'` when used as a tool group). */
  className?: string;
  /** The `source` reported on the `action` event. Default `'toolbar'`. */
  source?: EditorActionSource;
}

type Entry = EditorActionItem | { divider: true; text?: string };

export class CommandBar {
  /** The wrapper element (appended to the parent given to the constructor). */
  readonly el: HTMLDivElement;

  #host: ActionSurfaceHost;
  #entries: Entry[];
  #source: EditorActionSource;
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
    this.#source = opts.source ?? 'toolbar';

    this.el = document.createElement('div');
    this.el.className = opts.className ?? 'we-command-bar';
    this.el.setAttribute('role', 'toolbar');

    parent.appendChild(this.el);
    this.refresh();
  }

  /** Re-resolve every item against the current state (visibility, text, toggled, disabled). */
  refresh(): void {
    const registry = this.#host.registry;
    const resolved = resolveMenuEntries<any, EditorAction>(this.#entries, this.#host.context(), (item) =>
      commandDefaults(registry, item, this.#host.label)
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
      if (r.kind === 'item') this.#apply(this.#button(r.item), r.resolved);
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
    s.className = 'we-sep';
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
      void this.#host.activate(item, this.#source, e, btn!);
    });
    this.#buttons.set(item, btn);
    return btn;
  }

  #apply(btn: HTMLButtonElement, r: ResolvedActionItem<EditorAction>): void {
    btn.dataset.action = r.action;
    if (r.id !== undefined) btn.dataset.id = r.id;
    else delete btn.dataset.id;
    btn.className = ['we-cmd', r.cssClass, r.isToggled && 'toggled', r.isDanger && 'we-danger']
      .filter(Boolean)
      .join(' ');
    btn.textContent = r.icon ?? r.text;
    if (r.isToggled) btn.setAttribute('aria-pressed', 'true');
    else btn.removeAttribute('aria-pressed');
    btn.title = r.tooltip ?? r.text;
    btn.setAttribute('aria-label', r.text);
    btn.disabled = r.isDisabled;
    btn.setAttribute('aria-disabled', String(r.isDisabled));
  }
}
