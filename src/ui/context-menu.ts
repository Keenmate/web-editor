/**
 * ContextMenu — the right-click editing menu. On `contextmenu` inside the editor
 * it opens the items at the cursor with core `openMenu()`
 * (`@keenmate/web-components-core/menu`), which owns the rendering (`.km-menu*`,
 * themed through core's private `--_km-menu-*` — mapped from `--we-context-menu-*` on
 * the host, falling through to the page-wide `--km-menu-*`),
 * positioning, the WAI-ARIA keyboard (arrows / Home / End / Enter / Space /
 * Escape / Tab) and dismissal (outside press, scroll, blur, another overlay).
 * Each item resolves against the current state (`commandDefaults`: text,
 * shortcut, enabled, toggled — a toggle is a `menuitemcheckbox`) and activates
 * through the action host (core `runAction`, source `'context-menu'`).
 * Suppressed when editing is disabled, so the native browser menu shows through
 * in read-only / preview.
 */
import type { EditorView } from 'prosemirror-view';
import { normalizeActionItems } from '@keenmate/web-components-core/actions';
import { openMenu, type MenuHandle } from '@keenmate/web-components-core/menu';
import { commandDefaults, type ActionSurfaceHost } from './actions';
import type { EditorAction, EditorActionContext, EditorActionItem, EditorToolbarEntry } from '../interaction';

export interface ContextMenuOptions {
  view: EditorView;
  /** Resolves + activates the items (source `'context-menu'`). */
  host: ActionSurfaceHost;
  items: readonly EditorToolbarEntry[];
  /** Shadow-local layer the menu is appended to (so the host's custom properties reach it). */
  container: HTMLElement;
}

type Entry = EditorActionItem | { divider: true; text?: string };

export class ContextMenu {
  #view: EditorView;
  #host: ActionSurfaceHost;
  #container: HTMLElement;
  #entries: Entry[];
  #menu: MenuHandle | null = null;
  #enabled = true;
  #onContextMenu: (e: MouseEvent) => void;

  constructor(opts: ContextMenuOptions) {
    this.#view = opts.view;
    this.#host = opts.host;
    this.#container = opts.container;
    // Expand the string shorthand ONCE, so each item keeps its identity across
    // opens (core's busy guard keys on it).
    this.#entries = normalizeActionItems(opts.items as (string | EditorActionItem)[]) as Entry[];

    this.#onContextMenu = (e) => {
      if (!this.#enabled) return;
      e.preventDefault();
      this.#open(e.clientX, e.clientY);
    };
    this.#view.dom.addEventListener('contextmenu', this.#onContextMenu);
  }

  get open(): boolean {
    return this.#menu?.isOpen ?? false;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.close();
  }

  /** Close the menu (and drop its document listeners) if it is open. */
  close(): void {
    const menu = this.#menu;
    this.#menu = null;
    menu?.close();
  }

  destroy(): void {
    this.#view.dom.removeEventListener('contextmenu', this.#onContextMenu);
    this.close();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #open(x: number, y: number): void {
    this.close();
    const host = this.#host;
    const registry = host.registry;
    const menu = openMenu<EditorActionContext, EditorAction>(this.#entries, host.context(), {
      at: { x, y },
      host: this.#container,
      cssClass: 'we-context-menu',
      returnFocusTo: this.#view.dom as HTMLElement,
      inheritThemeFrom: this.#view.dom as HTMLElement,
      defaults: (item) => commandDefaults(registry, item, host.label),
      runAction: (item, { triggerElement, sourceEvent }) =>
        host.activate(item, 'context-menu', sourceEvent, triggerElement),
      onClose: () => {
        if (this.#menu === menu) this.#menu = null;
      },
    });
    if (!menu.isOpen) return; // nothing visible
    menu.element?.setAttribute('part', 'context-menu');
    this.#menu = menu;
  }
}
