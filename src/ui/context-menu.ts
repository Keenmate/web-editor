/**
 * ContextMenu — the right-click editing menu (Phase 4). On `contextmenu` inside
 * the editor it opens a labelled {@link CommandBar} (menu variant) at the cursor
 * via the core `createPopover` primitive (a virtual point reference), reflecting
 * each command's enabled/active state. Dismisses on outside pointerdown, Escape,
 * or after running an item. Suppressed when editing is disabled, so the native
 * browser menu shows through in read-only / preview.
 */
import type { EditorView } from 'prosemirror-view';
import { createPopover, type PopoverHandle } from '@keenmate/web-components-core/positioning';
import type { CommandRegistry } from '../engine/command-registry';
import { CommandBar } from './command-bar';
import { domRect } from './virtual';
import type { ToolbarItem } from './items';
import { uiLogger } from '../logger';

export interface ContextMenuOptions {
  view: EditorView;
  registry: CommandRegistry;
  items: readonly ToolbarItem[];
  /** Shadow-local layer the floating panel portals into (so shadow styles apply). */
  container: HTMLElement;
}

export class ContextMenu {
  #view: EditorView;
  #bar: CommandBar;
  #panel: HTMLDivElement;
  #popover: PopoverHandle;
  #enabled = true;
  #open = false;
  #point = { x: 0, y: 0 };

  #onContextMenu: (e: MouseEvent) => void;
  #onDismiss: (e: Event) => void;
  #onKey: (e: KeyboardEvent) => void;

  constructor(opts: ContextMenuOptions) {
    this.#view = opts.view;

    this.#panel = document.createElement('div');
    this.#panel.className = 'km-floating km-context-menu';
    this.#panel.setAttribute('part', 'context-menu');
    this.#bar = new CommandBar(this.#panel, opts.items, opts.registry, {
      variant: 'menu',
      onRun: () => this.#close(),
    });

    this.#popover = createPopover({
      reference: {
        getBoundingClientRect: () => domRect(this.#point.x, this.#point.y, 0, 0),
        contextElement: this.#view.dom,
      },
      panel: this.#panel,
      container: opts.container,
      placement: 'bottom-start',
      offset: 4,
      inheritThemeFrom: this.#view.dom as HTMLElement,
    });

    this.#onContextMenu = (e) => {
      if (!this.#enabled) return;
      e.preventDefault();
      this.#point = { x: e.clientX, y: e.clientY };
      this.#openMenu();
    };
    // Use composedPath so a click on the portaled panel (in the shadow overlay)
    // isn't mistaken for an outside click after event retargeting.
    this.#onDismiss = (e) => {
      if (e.composedPath().includes(this.#panel)) return;
      this.#close();
    };
    this.#onKey = (e) => {
      if (e.key === 'Escape') this.#close();
    };

    this.#view.dom.addEventListener('contextmenu', this.#onContextMenu);
  }

  get open(): boolean {
    return this.#open;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#close();
  }

  destroy(): void {
    this.#view.dom.removeEventListener('contextmenu', this.#onContextMenu);
    this.#detachDismiss();
    this.#safely(() => this.#popover.destroy());
    this.#bar.destroy();
    this.#panel.remove();
    this.#open = false;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #openMenu(): void {
    this.#bar.refresh();
    this.#safely(() => {
      if (!this.#popover.isOpen) this.#popover.open();
      else this.#popover.update();
    });
    this.#open = true;
    this.#attachDismiss();
  }

  #close(): void {
    if (!this.#open && !this.#popover.isOpen) return;
    this.#safely(() => this.#popover.close());
    this.#open = false;
    this.#detachDismiss();
  }

  #attachDismiss(): void {
    document.addEventListener('pointerdown', this.#onDismiss, true);
    document.addEventListener('keydown', this.#onKey, true);
  }

  #detachDismiss(): void {
    document.removeEventListener('pointerdown', this.#onDismiss, true);
    document.removeEventListener('keydown', this.#onKey, true);
  }

  #safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      uiLogger.warn('context menu positioning failed', err);
    }
  }
}
