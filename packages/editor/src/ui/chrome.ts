/**
 * EditorChrome — the command-driven UI around one engine. It owns four
 * presenters bound to the engine's CommandRegistry:
 *
 *   - the static zone toolbar (grouped tool clusters, in the layout's toolbar slot),
 *   - the selection floating toolbar,
 *   - the context menu, and
 *   - the dedicated status bar (live state indicators, in the status slot).
 *
 * The item lists are the ones the engine assembled from its plugin set (groups +
 * flat selection/menu items + status items). Chrome refreshes on every
 * selection/doc change; its lifetime is tied to the engine (rebuilt with it). The
 * static toolbar + status bar live in the layout's persistent slots; the floating
 * presenters portal into the persistent overlay layer — all survive a view-mode
 * re-render.
 */
import type { EditorEngine } from '../engine/editor-engine';
import type { ViewLayout } from './view-layout';
import { ToolbarZone } from './toolbar-zone';
import { StatusBar } from './status-bar';
import { SelectionToolbar } from './selection-toolbar';
import { ContextMenu } from './context-menu';
import type { ToolGroup, ToolbarItem, StatusItem } from './items';
import type { EditorStatusBar } from '../web-component';

export interface EditorChromeOptions {
  engine: EditorEngine;
  layout: ViewLayout;
  toolbarGroups?: readonly ToolGroup[];
  selectionItems?: readonly ToolbarItem[];
  contextMenuItems?: readonly ToolbarItem[];
  statusItems?: readonly StatusItem[];
}

export interface ChromeState {
  /** Whether editing is on — gates the toolbar + selection toolbar + context menu. */
  editable: boolean;
  /** Whether the static toolbar is wanted (the `toolbar` input, independent of `editable`). */
  showToolbar: boolean;
  /** Which status-bar edge(s) to show (the `statusbar` input; shows read-only too). */
  status: EditorStatusBar;
}

export class EditorChrome {
  #toolbar: ToolbarZone;
  #statusTop: StatusBar;
  #statusBottom: StatusBar;
  #selection: SelectionToolbar;
  #menu: ContextMenu;
  #unsubscribe: Array<() => void> = [];

  constructor(opts: EditorChromeOptions) {
    const { engine, layout } = opts;
    const registry = engine.commands;
    const statusItems = opts.statusItems ?? engine.statusItems;
    const getState = () => engine.view.state;

    this.#toolbar = new ToolbarZone(
      layout.toolbarMount,
      opts.toolbarGroups ?? engine.toolbarGroups,
      registry
    );
    // One StatusBar per edge, each holding every item; `setState` filters which
    // items each shows (single-edge → all; `both` → split by `item.bar`).
    this.#statusTop = new StatusBar(layout.statusTopMount, statusItems, getState);
    this.#statusBottom = new StatusBar(layout.statusBottomMount, statusItems, getState);
    this.#selection = new SelectionToolbar({
      view: engine.view,
      registry,
      items: opts.selectionItems ?? engine.selectionItems,
      container: layout.overlayLayer,
    });
    this.#menu = new ContextMenu({
      view: engine.view,
      registry,
      items: opts.contextMenuItems ?? engine.menuItems,
      container: layout.overlayLayer,
    });

    // `selectionUpdate` covers typing + caret moves; `change` also covers a
    // whole-document replacement (setValue), which emits only `change`.
    this.#unsubscribe.push(engine.events.on('selectionUpdate', () => this.refresh()));
    this.#unsubscribe.push(engine.events.on('change', () => this.refresh()));

    this.refresh();
  }

  /** Reflect command state (toolbar + selection toolbar) and status indicators. */
  refresh(): void {
    this.#toolbar.refresh();
    this.#selection.update();
    this.#statusTop.refresh();
    this.#statusBottom.refresh();
  }

  /** Apply presentation state (editable + whether the toolbar / status bar(s) are wanted). */
  setState(state: ChromeState): void {
    const showToolbar = state.editable && state.showToolbar;
    this.#toolbar.setVisible(showToolbar);
    if (showToolbar) this.#toolbar.refresh();

    const top = state.status === 'top' || state.status === 'both';
    const bottom = state.status === 'bottom' || state.status === 'both';
    // Single edge shows every item; `both` splits by `item.bar` (default bottom).
    if (state.status === 'both') {
      this.#statusTop.setFilter((i) => i.bar === 'top');
      this.#statusBottom.setFilter((i) => i.bar !== 'top');
    } else {
      this.#statusTop.setFilter(() => true);
      this.#statusBottom.setFilter(() => true);
    }
    // Hide an edge that's off — or has no items to show.
    this.#statusTop.setVisible(top && this.#statusTop.activeCount > 0);
    this.#statusBottom.setVisible(bottom && this.#statusBottom.activeCount > 0);
    if (top) this.#statusTop.refresh();
    if (bottom) this.#statusBottom.refresh();

    this.#selection.setEnabled(state.editable);
    this.#menu.setEnabled(state.editable);
  }

  destroy(): void {
    this.#unsubscribe.forEach((off) => off());
    this.#unsubscribe = [];
    this.#toolbar.destroy();
    this.#statusTop.destroy();
    this.#statusBottom.destroy();
    this.#selection.destroy();
    this.#menu.destroy();
  }
}
