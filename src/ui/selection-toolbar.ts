/**
 * SelectionToolbar — the floating formatting bar shown over a non-empty text
 * selection (Phase 4). It wraps a {@link CommandBar} in a floating panel and
 * positions it against a virtual element tracking the live selection rect via the
 * core `createPopover` primitive. Hidden inside code blocks (marks don't apply
 * there) and whenever editing is disabled.
 *
 * All positioning calls are wrapped: `view.coordsAtPos` can throw mid-render, and
 * a positioning failure must never break editing — it just leaves the bar hidden.
 */
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createPopover, type PopoverHandle } from '@keenmate/web-components-core/positioning';
import type { CommandRegistry } from '../engine/command-registry';
import { CommandBar } from './command-bar';
import { domRect } from './virtual';
import type { ToolbarItem } from './items';
import { uiLogger } from '../logger';

export interface SelectionToolbarOptions {
  view: EditorView;
  registry: CommandRegistry;
  items: readonly ToolbarItem[];
  /** Shadow-local layer the floating panel portals into (so shadow styles apply). */
  container: HTMLElement;
}

export class SelectionToolbar {
  #view: EditorView;
  #bar: CommandBar;
  #panel: HTMLDivElement;
  #popover: PopoverHandle;
  #enabled = true;
  #open = false;

  constructor(opts: SelectionToolbarOptions) {
    this.#view = opts.view;

    this.#panel = document.createElement('div');
    this.#panel.className = 'km-floating km-selection-toolbar';
    this.#panel.setAttribute('part', 'selection-toolbar');
    this.#bar = new CommandBar(this.#panel, opts.items, opts.registry, { variant: 'bar' });

    this.#popover = createPopover({
      reference: {
        getBoundingClientRect: () => this.#selectionRect(),
        contextElement: this.#view.dom,
      },
      panel: this.#panel,
      container: opts.container,
      placement: 'top',
      offset: 8,
      inheritThemeFrom: this.#view.dom as HTMLElement,
    });
  }

  /** Whether the toolbar currently intends to be visible (independent of positioning). */
  get visible(): boolean {
    return this.#open;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (!enabled) this.#hide();
  }

  /** Re-evaluate visibility + position from the current selection. */
  update(): void {
    if (!this.#enabled) return this.#hide();
    const sel = this.#view.state.selection;
    const show =
      !sel.empty && sel.to - sel.from > 0 && sel instanceof TextSelection && !this.#inCodeBlock();
    if (show) this.#show();
    else this.#hide();
  }

  destroy(): void {
    this.#safely(() => this.#popover.destroy());
    this.#bar.destroy();
    this.#panel.remove();
    this.#open = false;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #show(): void {
    this.#bar.refresh();
    this.#safely(() => {
      if (!this.#popover.isOpen) this.#popover.open();
      else this.#popover.update();
    });
    this.#open = true;
  }

  #hide(): void {
    if (!this.#open && !this.#popover.isOpen) return;
    this.#safely(() => this.#popover.close());
    this.#open = false;
  }

  #inCodeBlock(): boolean {
    const { $from } = this.#view.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'code_block') return true;
    }
    return false;
  }

  #selectionRect(): DOMRect {
    try {
      const { from, to } = this.#view.state.selection;
      const a = this.#view.coordsAtPos(from);
      const b = this.#view.coordsAtPos(to);
      const left = Math.min(a.left, b.left);
      const top = Math.min(a.top, b.top);
      const right = Math.max(a.right, b.right);
      const bottom = Math.max(a.bottom, b.bottom);
      return domRect(left, top, right - left, bottom - top);
    } catch {
      return domRect(0, 0, 0, 0);
    }
  }

  #safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      uiLogger.warn('selection toolbar positioning failed', err);
    }
  }
}
