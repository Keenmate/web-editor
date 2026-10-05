/**
 * Phase 4 chrome tests — the command-driven toolbar / selection toolbar / context
 * menu. Covers the static toolbar through the `<km-editor>` element (rendering,
 * visibility gating, active/enabled reflection, click-to-run) and the two floating
 * presenters as units against a raw engine. Runs in happy-dom.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { KmEditorElement } from '../../src/web-component';
import { EditorEngine } from '../../src/engine/editor-engine';
import { CommandBar } from '../../src/ui/command-bar';
import { SelectionToolbar } from '../../src/ui/selection-toolbar';
import { ContextMenu } from '../../src/ui/context-menu';
import {
  defaultToolbarItems,
  defaultSelectionItems,
  defaultContextMenuItems,
} from '../../src/ui/items';

beforeAll(async () => {
  await import('../../src/index');
});

async function mount(attrs: Record<string, string> = {}): Promise<KmEditorElement> {
  const el = document.createElement('km-editor') as KmEditorElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await el.whenSettled();
  return el;
}

const bar = (el: KmEditorElement) => el.shadowRoot!.querySelector('.km-command-bar') as HTMLElement;
const cmd = (el: KmEditorElement, id: string) =>
  el.shadowRoot!.querySelector(`.km-command-bar [data-command="${id}"]`) as HTMLButtonElement;

describe('<km-editor> static toolbar', () => {
  it('renders the command toolbar above the editor in edit mode', async () => {
    const el = await mount({ value: '# Hi' });
    expect(bar(el)).toBeTruthy();
    expect(cmd(el, 'bold')).toBeTruthy();
    expect(cmd(el, 'insert-table')).toBeTruthy();
    // The toolbar slot precedes the editor surface.
    const root = el.shadowRoot!.querySelector('.km-root')!;
    const kids = Array.from(root.children);
    expect(kids.indexOf(el.shadowRoot!.querySelector('.km-toolbar')!)).toBeLessThan(
      kids.indexOf(el.shadowRoot!.querySelector('.km-editor')!)
    );
  });

  it('hides the toolbar in preview (read-only) mode', async () => {
    const el = await mount({ value: 'x', mode: 'preview' });
    expect(bar(el).hidden).toBe(true);
  });

  it('hides the toolbar when toolbar="none"', async () => {
    const el = await mount({ value: 'x', toolbar: 'none' });
    expect(bar(el).hidden).toBe(true);
    el.setAttribute('toolbar', 'top');
    await el.whenSettled();
    expect(bar(el).hidden).toBe(false);
  });
});

// CommandBar is exercised against a light-DOM engine: dispatching a selection
// into a *shadow*-mounted ProseMirror view trips a happy-dom `activeElement` bug,
// so the element describe above sticks to rendering/visibility and the active /
// enabled / click-to-run behaviour is covered here on the raw renderer.
describe('CommandBar', () => {
  function setup(markdown = '# Hello world') {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const engine = new EditorEngine({ mount: mountEl, markdown });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const bar = new CommandBar(parent, defaultToolbarItems, engine.commands, { variant: 'bar' });
    return { engine, bar, parent };
  }
  const btn = (parent: HTMLElement, id: string) =>
    parent.querySelector(`[data-command="${id}"]`) as HTMLButtonElement;
  const select = (engine: EditorEngine, from: number, to: number) =>
    engine.view.dispatch(
      engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, from, to))
    );

  it('runs a command on click and reflects its active state', () => {
    const { engine, bar, parent } = setup();
    select(engine, 2, 7); // inside "Hello world"
    btn(parent, 'bold').click();
    expect(engine.getMarkdown()).toContain('**');
    bar.refresh();
    expect(btn(parent, 'bold').classList.contains('active')).toBe(true);
    bar.destroy();
  });

  it('reflects isEnabled — link disabled without a selection, enabled with one', () => {
    const { engine, bar, parent } = setup();
    select(engine, 3, 3); // collapsed caret → link disabled (and no prompt on refresh)
    bar.refresh();
    expect(btn(parent, 'insert-link').disabled).toBe(true);
    select(engine, 2, 7);
    bar.refresh();
    expect(btn(parent, 'insert-link').disabled).toBe(false);
    bar.destroy();
  });

  it('setVisible toggles the whole bar', () => {
    const { bar } = setup();
    bar.setVisible(false);
    expect(bar.el.hidden).toBe(true);
    bar.setVisible(true);
    expect(bar.el.hidden).toBe(false);
    bar.destroy();
  });
});

describe('SelectionToolbar', () => {
  function setup(markdown = '# Hello world') {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const engine = new EditorEngine({ mount: mountEl, markdown });
    const toolbar = new SelectionToolbar({
      view: engine.view,
      registry: engine.commands,
      items: defaultSelectionItems,
      container,
    });
    return { engine, toolbar, container };
  }

  it('stays hidden for an empty selection', () => {
    const { toolbar } = setup();
    toolbar.update();
    expect(toolbar.visible).toBe(false);
    toolbar.destroy();
  });

  it('shows for a non-empty text selection', () => {
    const { engine, toolbar } = setup();
    engine.view.dispatch(
      engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 2, 7))
    );
    toolbar.update();
    expect(toolbar.visible).toBe(true);
    toolbar.destroy();
  });

  it('is suppressed while disabled', () => {
    const { engine, toolbar } = setup();
    engine.view.dispatch(
      engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 2, 7))
    );
    toolbar.setEnabled(false);
    toolbar.update();
    expect(toolbar.visible).toBe(false);
    toolbar.destroy();
  });
});

describe('ContextMenu', () => {
  function setup() {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const engine = new EditorEngine({ mount: mountEl, markdown: '# Hello' });
    const menu = new ContextMenu({
      view: engine.view,
      registry: engine.commands,
      items: defaultContextMenuItems,
      container,
    });
    return { engine, menu, container };
  }

  const contextmenu = () =>
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });

  it('opens a labelled menu at the cursor on contextmenu', () => {
    const { engine, menu, container } = setup();
    const ev = contextmenu();
    engine.view.dom.dispatchEvent(ev);
    expect(menu.open).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(container.querySelector('.km-context-menu .km-menu-item')).toBeTruthy();
    menu.destroy();
  });

  it('is suppressed while disabled (native menu shows through)', () => {
    const { engine, menu } = setup();
    menu.setEnabled(false);
    const ev = contextmenu();
    engine.view.dom.dispatchEvent(ev);
    expect(menu.open).toBe(false);
    expect(ev.defaultPrevented).toBe(false);
    menu.destroy();
  });
});
