/**
 * Floating toolbars — text-selection, table, and code-block context toolbars
 * positioned with @floating-ui/dom.
 *
 * PROVISIONAL (Phase 0): this is a behaviour-preserving port of the POC and is
 * tightly coupled to specific DOM ids in the dev playground's index.html. It is
 * replaced in Phase 3/4 by proper command-driven toolbar/context-menu components
 * built on the overlay + positioning primitives from
 * `@keenmate/web-components-core`. Kept here only so the playground keeps working.
 */
import { Plugin, TextSelection } from 'prosemirror-state';
import { isInTable } from 'prosemirror-tables';
import { computePosition, flip, shift, offset, arrow } from '@floating-ui/dom';
import type { Schema } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

function isMarkActive(state, markType) {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
}

function getSelectionVirtualElement(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);

  const rect = {
    x: Math.min(start.left, end.left),
    y: start.top,
    width: Math.abs(end.right - start.left),
    height: end.bottom - start.top,
    top: start.top,
    left: Math.min(start.left, end.left),
    right: Math.max(start.right, end.right),
    bottom: end.bottom,
  };

  return {
    getBoundingClientRect: () => rect as DOMRect,
    contextElement: view.dom,
  };
}

function findNodeOfType(state, typeName: string) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === typeName) {
      return { node, pos: $from.before(d), depth: d };
    }
  }
  return null;
}

/**
 * Build the floating-toolbar plugin. Call this once at bootstrap, after the
 * playground DOM exists — it captures the toolbar elements by id.
 */
export function createFloatingToolbarPlugin(schema: Schema): Plugin {
  const floatingToolbar = document.querySelector('#floating-toolbar') as HTMLElement;
  const floatingArrow = document.querySelector('#floating-toolbar-arrow') as HTMLElement;
  const tableToolbar = document.querySelector('#table-toolbar') as HTMLElement;
  const tableToolbarArrow = document.querySelector('#table-toolbar-arrow') as HTMLElement;
  const codeToolbar = document.querySelector('#code-toolbar') as HTMLElement;
  const codeToolbarArrow = document.querySelector('#code-toolbar-arrow') as HTMLElement;
  const codeLanguageLabel = document.querySelector('#code-language-label') as HTMLElement;

  function updateToolbarActiveStates(state, toolbar: HTMLElement = floatingToolbar) {
    const buttons = toolbar.querySelectorAll('button[data-command]');
    buttons.forEach((btn) => {
      const cmd = (btn as HTMLElement).dataset.command;
      let active = false;
      if (cmd === 'bold') active = isMarkActive(state, schema.marks.bold);
      else if (cmd === 'italic') active = isMarkActive(state, schema.marks.italic);
      else if (cmd === 'underline') active = isMarkActive(state, schema.marks.underline);
      else if (cmd === 'insert-link') active = isMarkActive(state, schema.marks.link);
      btn.classList.toggle('active', active);
    });
  }

  function positionArrow(arrowEl: HTMLElement, middlewareData, placement: string, fallbackLeft = '') {
    if (!middlewareData.arrow) return;
    const { x: arrowX } = middlewareData.arrow;
    const isTop = placement.startsWith('top');
    Object.assign(arrowEl.style, {
      left: arrowX != null ? `${arrowX}px` : fallbackLeft,
      top: isTop ? '' : '-6px',
      bottom: isTop ? '-6px' : '',
      transform: `translateX(-50%) ${isTop ? '' : 'rotate(180deg)'}`,
    });
  }

  async function showFloatingToolbar(view: EditorView) {
    const virtualEl = getSelectionVirtualElement(view);
    const { x, y, placement, middlewareData } = await computePosition(virtualEl, floatingToolbar, {
      placement: 'top',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['bottom', 'top'] }),
        shift({ padding: 8 }),
        arrow({ element: floatingArrow }),
      ],
    });
    Object.assign(floatingToolbar.style, { left: `${x}px`, top: `${y}px` });
    positionArrow(floatingArrow, middlewareData, placement);
    updateToolbarActiveStates(view.state);
    floatingToolbar.classList.add('visible');
  }

  function hideFloatingToolbar() {
    floatingToolbar.classList.remove('visible');
  }

  async function showTableToolbar(view: EditorView) {
    const table = findNodeOfType(view.state, 'table');
    if (!table) return;
    const tableDOM = view.nodeDOM(table.pos) as HTMLElement | null;
    if (!tableDOM) return;

    const { x, y, placement, middlewareData } = await computePosition(tableDOM, tableToolbar, {
      placement: 'top',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['bottom', 'top'] }),
        shift({ padding: 8 }),
        arrow({ element: tableToolbarArrow }),
      ],
    });
    Object.assign(tableToolbar.style, { left: `${x}px`, top: `${y}px` });
    positionArrow(tableToolbarArrow, middlewareData, placement);
    tableToolbar.classList.add('visible');
  }

  function hideTableToolbar() {
    tableToolbar.classList.remove('visible');
  }

  async function showCodeToolbar(view: EditorView) {
    const codeBlock = findNodeOfType(view.state, 'code_block');
    if (!codeBlock) return;
    codeLanguageLabel.textContent = codeBlock.node.attrs.language || 'text';
    const codeDOM = view.nodeDOM(codeBlock.pos) as HTMLElement | null;
    if (!codeDOM) return;

    const { x, y, placement, middlewareData } = await computePosition(codeDOM, codeToolbar, {
      placement: 'top-start',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['bottom-start', 'top-start'] }),
        shift({ padding: 8 }),
        arrow({ element: codeToolbarArrow }),
      ],
    });
    Object.assign(codeToolbar.style, { left: `${x}px`, top: `${y}px` });
    positionArrow(codeToolbarArrow, middlewareData, placement, '20px');
    codeToolbar.classList.add('visible');
  }

  function hideCodeToolbar() {
    codeToolbar.classList.remove('visible');
  }

  return new Plugin({
    view() {
      return {
        update(view) {
          const { state } = view;
          const { selection } = state;
          const { empty, from, to } = selection;

          const inTable = isInTable(state);
          const inCodeBlock = findNodeOfType(state, 'code_block') !== null;
          const hasSelection = !empty && to - from > 0;
          const isTextSel = selection instanceof TextSelection;

          if (inCodeBlock) {
            showCodeToolbar(view);
            hideTableToolbar();
            hideFloatingToolbar();
            return;
          }
          hideCodeToolbar();

          if (inTable) {
            showTableToolbar(view);
            if (hasSelection && isTextSel) showFloatingToolbar(view);
            else hideFloatingToolbar();
          } else {
            hideTableToolbar();
            if (hasSelection && isTextSel) showFloatingToolbar(view);
            else hideFloatingToolbar();
          }
        },
        destroy() {
          hideFloatingToolbar();
          hideTableToolbar();
          hideCodeToolbar();
        },
      };
    },
  });
}
