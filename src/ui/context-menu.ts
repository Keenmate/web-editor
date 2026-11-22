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
import { openMenu, type MenuHandle, type OpenMenuOptions } from '@keenmate/web-components-core/menu';
import { commandDefaults, type ActionSurfaceHost } from './actions';
import type { EditorAction, EditorActionContext, EditorActionItem, EditorToolbarEntry } from '../interaction';

export interface ContextMenuOptions {
  view: EditorView;
  /** Resolves + activates the items (source `'context-menu'`). */
  host: ActionSurfaceHost;
  items: readonly EditorToolbarEntry[];
  /** Shadow-local layer the menu is appended to (so the host's custom properties reach it). */
  container: HTMLElement;
  /**
   * The host's menu presentation, read at every open — inside `<km-editor>`:
   * core `menuPresentationOptions(this.config)` (`menu-presentation` / `menu-side`,
   * effective config). Absent → core's default (`auto`).
   */
  getPresentation?: () => Partial<Pick<OpenMenuOptions<EditorActionContext, EditorAction>, 'presentation' | 'side'>>;
}

type Entry = EditorActionItem | { divider: true; text?: string };

export class ContextMenu {
  #view: EditorView;
  #host: ActionSurfaceHost;
  #container: HTMLElement;
  #getPresentation: ContextMenuOptions['getPresentation'];
  #entries: Entry[];
  #menu: MenuHandle | null = null;
  #enabled = true;
  #onContextMenu: (e: MouseEvent) => void;

  constructor(opts: ContextMenuOptions) {
    this.#view = opts.view;
    this.#host = opts.host;
    this.#container = opts.container;
    this.#getPresentation = opts.getPresentation;
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

  /**
   * Open the menu from the keyboard (Shift+F10 / the ContextMenu key) at the caret, its first item focused.
   * The browser may raise its own `contextmenu` right after (on key-up) — swallowed, so the native menu
   * never shows over ours. `false` when the menu is off (read-only / preview) or has nothing to show.
   */
  openAtCaret(): boolean {
    if (!this.#enabled) return false;
    let at = { x: 0, y: 0 };
    try {
      const c = this.#view.coordsAtPos(this.#view.state.selection.head);
      at = { x: c.left, y: c.bottom };
    } catch {
      const r = (this.#view.dom as HTMLElement).getBoundingClientRect();
      at = { x: r.left, y: r.top };
    }
    this.#open(at.x, at.y, true);
    if (!this.#menu) return false;
    this.#swallowNativeMenu();
    return true;
  }

  /** Close the menu (and drop its document listeners) if it is open. */
  close(): void {
    const menu = this.#menu;
    this.#menu = null;
    menu?.close();
  }

  destroy(): void {
    this.#view.dom.removeEventListener('contextmenu', this.#onContextMenu);
    this.#stopSwallowing?.();
    this.close();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #stopSwallowing?: () => void;

  /** Cancel the one browser `contextmenu` a keyboard open may be followed by (within a second). */
  #swallowNativeMenu(): void {
    this.#stopSwallowing?.();
    const doc = (this.#view.dom as HTMLElement).ownerDocument;
    const onNative = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      stop();
    };
    const timer = setTimeout(() => stop(), 1000);
    const stop = (): void => {
      clearTimeout(timer);
      doc.removeEventListener('contextmenu', onNative, true);
      if (this.#stopSwallowing === stop) this.#stopSwallowing = undefined;
    };
    doc.addEventListener('contextmenu', onNative, true);
    this.#stopSwallowing = stop;
  }

  #open(x: number, y: number, isKeyboard = false): void {
    this.close();
    const host = this.#host;
    const registry = host.registry;
    const menu = openMenu<EditorActionContext, EditorAction>(this.#entries, host.context(), {
      ...this.#getPresentation?.(),
      // The sheet / drawer chrome strings (submenu back button, close button) via `labels`.
      labels: { back: host.label('buttons.back'), close: host.label('ariaLabels.close') },
      at: { x, y },
      // Opened from the keyboard: the first item takes focus (a pointer open focuses the menu itself).
      shouldFocusFirst: isKeyboard,
      host: this.#container,
      cssClass: 'we-context-menu',
      returnFocusTo: this.#view.dom as HTMLElement,
      inheritThemeFrom: this.#view.dom as HTMLElement,
      defaults: (item) => commandDefaults(registry, item, host.label, 'menu'),
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
