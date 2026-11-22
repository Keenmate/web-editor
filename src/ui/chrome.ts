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
import { createTooltip, type TooltipHandle } from '@keenmate/web-components-core/positioning';
import { ToolbarZone } from './toolbar-zone';
import { StatusBar } from './status-bar';
import { SelectionToolbar } from './selection-toolbar';
import { ContextMenu, type ContextMenuOptions } from './context-menu';
import type { ToolGroup, StatusItem } from './items';
import type { EditorStatusBar } from '../web-component';
import type { EditorToolbarEntry } from '../interaction';
import { createActionHost, type ActionSurfaceHost } from './actions';
import { matchesShortcut } from '@keenmate/web-components-core/actions';

export interface EditorChromeOptions {
  engine: EditorEngine;
  layout: ViewLayout;
  /** Resolves + activates items (the element binds `beforeActionCallback` + the `action` event). */
  actions?: ActionSurfaceHost;
  toolbarGroups?: readonly ToolGroup[];
  selectionItems?: readonly EditorToolbarEntry[];
  contextMenuItems?: readonly EditorToolbarEntry[];
  statusItems?: readonly StatusItem[];
  /** The context menu's presentation, read per open (see `ContextMenuOptions.getPresentation`). */
  getMenuPresentation?: ContextMenuOptions['getPresentation'];
}

export interface ChromeState {
  /** Whether editing is on — gates the editing toolbar groups + selection toolbar + context menu. */
  isEditable: boolean;
  /** Effectively disabled — hides the whole toolbar (the view-mode group too). */
  isDisabled: boolean;
  /** Whether the static toolbar is wanted (the `toolbar` input, independent of `isEditable`). */
  isToolbarShown: boolean;
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
  #tooltip: TooltipHandle;

  constructor(opts: EditorChromeOptions) {
    const { engine, layout } = opts;
    const actions = opts.actions ?? createActionHost({ engine });
    const statusItems = opts.statusItems ?? engine.statusItems;
    const getContext = () => engine.createContext({ state: engine.view.state });

    this.#toolbar = new ToolbarZone(
      layout.toolbarMount,
      opts.toolbarGroups ?? engine.toolbarGroups,
      actions
    );
    // One StatusBar per edge, each holding every item; `setState` filters which
    // items each shows (single-edge → all; `both` → split by `item.bar`).
    this.#statusTop = new StatusBar(layout.statusTopMount, statusItems, getContext);
    this.#statusBottom = new StatusBar(layout.statusBottomMount, statusItems, getContext);
    this.#selection = new SelectionToolbar({
      view: engine.view,
      host: actions,
      items: opts.selectionItems ?? engine.selectionItems,
      container: layout.overlayLayer,
    });
    this.#menu = new ContextMenu({
      view: engine.view,
      host: actions,
      items: opts.contextMenuItems ?? engine.menuItems,
      container: layout.overlayLayer,
      getPresentation: opts.getMenuPresentation,
    });

    // `selection-change` covers typing + caret moves; `change` also covers a
    // whole-document replacement (setValue), which emits only `change`.
    // One delegated core tooltip for every toolbar button / status item (`data-tooltip`): themed, shown on
    // hover AND keyboard focus, `aria-describedby` while shown, Escape hides it (a native `title` does none).
    this.#tooltip = createTooltip({
      trigger: layout.overlayLayer.getRootNode() as ShadowRoot,
      selector: '[data-tooltip]',
      content: (target) => target.dataset.tooltip || null,
      container: layout.overlayLayer,
      placement: 'bottom',
      delay: { show: 400 },
      cssClass: 'we-tooltip',
      visibleClass: 'we-tooltip--visible',
    });

    // Keyboard openers on the editing surface (docs/accessibility.md): Alt+F10 → the selection toolbar
    // (while it shows), else the static toolbar; Shift+F10 / the ContextMenu key → the context menu at the
    // caret. Escape in a toolbar → back to the text, the selection kept (the view restores it on focus).
    const view = engine.view;
    const onSurfaceKeydown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      if (matchesShortcut(event, 'Alt+F10')) {
        const bar = this.#selection.focus() ? this.#selection.element : this.#toolbar.focus() ? this.#toolbar.el : null;
        if (!bar) return;
        event.preventDefault();
        // Chromium doesn't count a modified key (Alt+…) as keyboard interaction for `:focus-visible`, so the
        // landing button would show no ring: mark the bar until focus leaves it or the pointer is used there.
        bar.toggleAttribute('data-keyboard-focus', true);
      } else if (matchesShortcut(event, 'Shift+F10') || matchesShortcut(event, 'ContextMenu')) {
        if (this.#menu.openAtCaret()) event.preventDefault();
      }
    };
    const onToolbarKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A shown tooltip takes the first Escape (core createTooltip hides it, WCAG 1.4.13); the next one leaves.
      if (this.#tooltip.isVisible) return;
      event.preventDefault();
      view.focus();
    };
    const onBarFocusOut = (event: FocusEvent): void => {
      const bar = event.currentTarget as HTMLElement;
      if (!bar.contains(event.relatedTarget as Node | null)) bar.removeAttribute('data-keyboard-focus');
    };
    const onBarPointerDown = (event: PointerEvent): void => (event.currentTarget as HTMLElement).removeAttribute('data-keyboard-focus');
    view.dom.addEventListener('keydown', onSurfaceKeydown);
    for (const bar of [this.#toolbar.el, this.#selection.element]) {
      bar.addEventListener('keydown', onToolbarKeydown);
      bar.addEventListener('focusout', onBarFocusOut);
      bar.addEventListener('pointerdown', onBarPointerDown);
    }
    this.#unsubscribe.push(() => {
      view.dom.removeEventListener('keydown', onSurfaceKeydown);
      for (const bar of [this.#toolbar.el, this.#selection.element]) {
        bar.removeEventListener('keydown', onToolbarKeydown);
        bar.removeEventListener('focusout', onBarFocusOut);
        bar.removeEventListener('pointerdown', onBarPointerDown);
      }
    });

    this.#unsubscribe.push(engine.events.on('selection-change', () => this.refresh()));
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
    // Not editable (read-only / preview) keeps only the view-mode group — the way back.
    const isToolbarShown = state.isToolbarShown && !state.isDisabled;
    this.#toolbar.setVisible(isToolbarShown, state.isEditable);
    if (isToolbarShown) this.#toolbar.refresh();

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

    this.#selection.setEnabled(state.isEditable);
    this.#menu.setEnabled(state.isEditable);
  }

  /**
   * The host was detached: close the floating panels (selection toolbar, context
   * menu) so no positioning loop or document listener outlives the move. The
   * static toolbar / status bar are structure and stay; `refresh()` on reconnect
   * re-evaluates the selection toolbar.
   */
  deactivate(): void {
    this.#tooltip.hide();
    this.#selection.hide();
    this.#menu.close();
  }

  destroy(): void {
    this.#unsubscribe.forEach((off) => off());
    this.#unsubscribe = [];
    this.#tooltip.destroy();
    this.#toolbar.destroy();
    this.#statusTop.destroy();
    this.#statusBottom.destroy();
    this.#selection.destroy();
    this.#menu.destroy();
  }
}
