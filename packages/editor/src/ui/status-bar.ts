/**
 * StatusBar — the dedicated strip of live {@link StatusItem} indicators
 * (`Words: 234`, …). Deliberately separate from the tool zones: status items are
 * never commands and never draggable, so the future group drag-and-drop in the
 * toolbar zones never has to exclude them. Items dock to the `start` or `end` of
 * the bar; `refresh()` re-renders each from the current editor state.
 */
import type { EditorState } from 'prosemirror-state';
import type { StatusItem } from './items';

export class StatusBar {
  readonly el: HTMLDivElement;
  #items: Array<{ item: StatusItem; node: HTMLSpanElement }> = [];
  #getState: () => EditorState;
  #filter: (item: StatusItem) => boolean = () => true;

  constructor(parent: HTMLElement, items: readonly StatusItem[], getState: () => EditorState) {
    this.#getState = getState;

    this.el = document.createElement('div');
    this.el.className = 'km-statusbar';
    this.el.setAttribute('part', 'statusbar');

    const start = document.createElement('div');
    start.className = 'km-status-start';
    const end = document.createElement('div');
    end.className = 'km-status-end';
    this.el.append(start, end);

    for (const item of items) {
      const node = document.createElement('span');
      node.className = 'km-status-item';
      node.dataset.status = item.id;
      if (item.title) node.title = item.title;
      (item.align === 'end' ? end : start).appendChild(node);
      this.#items.push({ item, node });
    }

    parent.appendChild(this.el);
  }

  refresh(): void {
    const state = this.#getState();
    for (const { item, node } of this.#items) {
      if (!this.#filter(item)) continue;
      const out = item.render(state);
      if (typeof out === 'string') node.textContent = out;
      else node.replaceChildren(out);
    }
  }

  /** Restrict which items this strip shows (used to split items across both strips). */
  setFilter(predicate: (item: StatusItem) => boolean): void {
    this.#filter = predicate;
    for (const { item, node } of this.#items) node.hidden = !predicate(item);
  }

  /** How many items currently pass the filter (so an empty strip can be hidden). */
  get activeCount(): number {
    return this.#items.reduce((n, { item }) => n + (this.#filter(item) ? 1 : 0), 0);
  }

  setVisible(visible: boolean): void {
    this.el.hidden = !visible;
  }

  destroy(): void {
    this.el.remove();
    this.#items = [];
  }
}
