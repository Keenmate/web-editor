/**
 * EditorChrome — the Phase 4 command-driven UI around one engine. It owns the
 * three presenters that all bind to the engine's CommandRegistry and reflect
 * each command's `isActive` / `isEnabled`:
 *
 *   - a static toolbar (placed in the layout's toolbar slot),
 *   - a selection floating toolbar, and
 *   - a context menu.
 *
 * Chrome refreshes on every selection/doc change, and its lifetime is tied to the
 * engine's — the element rebuilds it whenever it rebuilds the engine (so the
 * presenters always bind to the live view). The static toolbar lives in the
 * layout's persistent `toolbarMount`; the floating presenters portal into the
 * persistent `overlayLayer`; both survive a view-mode re-render untouched.
 */
import type { EditorEngine } from '../engine/editor-engine';
import type { ViewLayout } from './view-layout';
import { CommandBar } from './command-bar';
import { SelectionToolbar } from './selection-toolbar';
import { ContextMenu } from './context-menu';
import {
  defaultToolbarItems,
  defaultSelectionItems,
  defaultContextMenuItems,
  type ToolbarItem,
} from './items';

export interface EditorChromeOptions {
  engine: EditorEngine;
  layout: ViewLayout;
  toolbarItems?: readonly ToolbarItem[];
  selectionItems?: readonly ToolbarItem[];
  contextMenuItems?: readonly ToolbarItem[];
}

export interface ChromeState {
  /** Whether editing is on — gates the selection toolbar + context menu and the static toolbar. */
  editable: boolean;
  /** Whether the static toolbar is wanted (the `toolbar` input, independent of `editable`). */
  showToolbar: boolean;
}

export class EditorChrome {
  #toolbar: CommandBar;
  #selection: SelectionToolbar;
  #menu: ContextMenu;
  #unsubscribe: Array<() => void> = [];

  constructor(opts: EditorChromeOptions) {
    const { engine, layout } = opts;
    const registry = engine.commands;

    this.#toolbar = new CommandBar(
      layout.toolbarMount,
      opts.toolbarItems ?? defaultToolbarItems,
      registry,
      { variant: 'bar' }
    );
    this.#selection = new SelectionToolbar({
      view: engine.view,
      registry,
      items: opts.selectionItems ?? defaultSelectionItems,
      container: layout.overlayLayer,
    });
    this.#menu = new ContextMenu({
      view: engine.view,
      registry,
      items: opts.contextMenuItems ?? defaultContextMenuItems,
      container: layout.overlayLayer,
    });

    // `selectionUpdate` covers typing + caret moves; `change` also covers a
    // whole-document replacement (setValue), which emits only `change`.
    this.#unsubscribe.push(engine.events.on('selectionUpdate', () => this.refresh()));
    this.#unsubscribe.push(engine.events.on('change', () => this.refresh()));

    this.refresh();
  }

  /** Reflect command state across the static toolbar + selection toolbar. */
  refresh(): void {
    this.#toolbar.refresh();
    this.#selection.update();
  }

  /** Apply presentation state (editable + whether the static toolbar is wanted). */
  setState(state: ChromeState): void {
    const showToolbar = state.editable && state.showToolbar;
    this.#toolbar.setVisible(showToolbar);
    if (showToolbar) this.#toolbar.refresh();
    this.#selection.setEnabled(state.editable);
    this.#menu.setEnabled(state.editable);
  }

  destroy(): void {
    this.#unsubscribe.forEach((off) => off());
    this.#unsubscribe = [];
    this.#toolbar.destroy();
    this.#selection.destroy();
    this.#menu.destroy();
  }
}
