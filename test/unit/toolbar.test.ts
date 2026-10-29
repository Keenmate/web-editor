/**
 * Phase 4 chrome tests — the command-driven toolbar / selection toolbar / context
 * menu. Covers the static toolbar through the `<km-editor>` element (rendering,
 * visibility gating, active/enabled reflection, click-to-run) and the two floating
 * presenters as units against a raw engine. Runs in happy-dom.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { KmEditorElement } from '../../src/web-component';
import { getEditorEngine } from '../../src/web-component';
import { createActionHost } from '../../src/ui/actions';
import { EditorEngine } from '../../src/engine/editor-engine';
import { definePlugin } from '../../src/engine/plugin';
import { defaultPlugins } from '../../src/engine/default-plugins';
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

const bar = (el: KmEditorElement) => el.shadowRoot!.querySelector('.we-toolbar-zone') as HTMLElement;
const cmd = (el: KmEditorElement, id: string) =>
  el.shadowRoot!.querySelector(`.we-toolbar-zone [data-action="${id}"]`) as HTMLButtonElement;

describe('<km-editor> view-mode toolbar items', () => {
  it('the default toolbar ends with the view-edit / view-split / view-preview group', async () => {
    const el = await mount({ value: 'x' });
    const groups = [...bar(el).querySelectorAll<HTMLElement>('.we-group')];
    const last = groups[groups.length - 1];
    expect(last.dataset.group).toBe('view');
    expect([...last.querySelectorAll('button')].map((b) => [b.dataset.action, b.textContent])).toEqual([
      ['view-edit', 'Edit'],
      ['view-split', 'Split'],
      ['view-preview', 'Preview'],
    ]);
    expect(cmd(el, 'view-edit').getAttribute('aria-pressed')).toBe('true');
    expect(cmd(el, 'view-split').hasAttribute('aria-pressed')).toBe(false);
  });

  it('click switches the mode with source "user"; toggled state follows any path', async () => {
    // Running a command focuses the view: only one live editor in the document
    // (happy-dom's shadow activeElement breaks with several).
    document.querySelectorAll('km-editor').forEach((e) => e.remove());
    const el = await mount({ value: 'x' });
    const seen: unknown[] = [];
    el.addEventListener('view-mode-change', (e) => {
      const d = (e as CustomEvent).detail;
      seen.push([d.viewMode, d.oldViewMode, d.source]);
    });
    cmd(el, 'view-split').click();
    await el.whenSettled();
    expect(el.viewMode).toBe('split');
    expect(el.getAttribute('view-mode')).toBe('split');
    expect(seen).toEqual([['split', 'edit', 'user']]);
    expect(cmd(el, 'view-split').getAttribute('aria-pressed')).toBe('true');
    expect(cmd(el, 'view-edit').hasAttribute('aria-pressed')).toBe(false);
    // silent assignment still re-renders the toggled state
    el.viewMode = 'preview';
    await el.whenSettled();
    expect(cmd(el, 'view-preview').getAttribute('aria-pressed')).toBe('true');
    expect(seen).toHaveLength(1);
    el.remove(); // the click focused the view: detach it (happy-dom shadow-selection quirk)
  });

  it('labels viewEdit / viewSplit / viewPreview / viewGroup override the texts', async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ viewEdit: 'Upravit', viewGroup: 'Zobrazení' }) });
    expect(cmd(el, 'view-edit').textContent).toBe('Upravit');
    expect(bar(el).querySelector('[data-group="view"]')!.getAttribute('aria-label')).toBe('Zobrazení');
  });

  it('is hidden in inline view mode', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'inline' });
    expect(cmd(el, 'view-edit')).toBeNull();
    expect((bar(el).querySelector('[data-group="view"]') as HTMLElement).hidden).toBe(true);
  });
});

describe('<km-editor> static toolbar', () => {
  it('renders the command toolbar above the editor in edit mode', async () => {
    const el = await mount({ value: '# Hi' });
    expect(bar(el)).toBeTruthy();
    expect(cmd(el, 'bold')).toBeTruthy();
    expect(cmd(el, 'insert-table')).toBeTruthy();
    // Surface = toolbar + body(editor); toolbar first (flush, 'top').
    const surface = el.shadowRoot!.querySelector('.we-surface')!;
    expect(surface.classList.contains('we-tb-top')).toBe(true);
    const kids = Array.from(surface.children);
    expect(kids.indexOf(el.shadowRoot!.querySelector('.we-toolbar')!)).toBeLessThan(
      kids.indexOf(el.shadowRoot!.querySelector('.we-body')!)
    );
  });

  it('places the toolbar on the requested side', async () => {
    const el = await mount({ value: 'x', toolbar: 'start' });
    expect(el.shadowRoot!.querySelector('.we-surface')!.classList.contains('we-tb-start')).toBe(true);
    el.setAttribute('toolbar', 'bottom');
    await el.whenSettled();
    expect(el.shadowRoot!.querySelector('.we-surface')!.classList.contains('we-tb-bottom')).toBe(true);
    expect(bar(el).hidden).toBe(false);
  });

  it('renders divider-separated tool groups (core + plugin)', async () => {
    const el = await mount({ value: 'x' });
    const groups = el.shadowRoot!.querySelectorAll('.we-toolbar-zone .we-group');
    expect(groups.length).toBeGreaterThan(1);
    const format = el.shadowRoot!.querySelector('.we-group[data-group="format"]')!;
    expect(format.querySelectorAll('[data-action]').length).toBe(3); // bold/italic/underline
    // A plugin contributes its own group.
    expect(el.shadowRoot!.querySelector('.we-group[data-group="table"]')).toBeTruthy();
  });
});

describe('<km-editor> status bar', () => {
  it('is absent by default (statusbar="none")', async () => {
    const el = await mount({ value: 'x' });
    expect(el.shadowRoot!.querySelector('.we-statusbar')).toBeNull();
  });

  it('renders live indicators when enabled', async () => {
    const el = await mount({ value: 'one two three', statusbar: 'bottom' });
    const status = el.shadowRoot!.querySelector('.we-statusbar') as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.hidden).toBe(false);
    const words = el.shadowRoot!.querySelector('.we-status-item[data-status="words"]');
    expect(words?.textContent).toBe('Words: 3');
    const chars = el.shadowRoot!.querySelector('.we-status-item[data-status="chars"]');
    expect(chars?.textContent).toBe(`Chars: ${'one two three'.length}`);
    // Hugs the body: status lives inside the body group, after the editor (bottom).
    const body = el.shadowRoot!.querySelector('.we-body')!;
    const kids = Array.from(body.children);
    expect(kids.indexOf(el.shadowRoot!.querySelector('.we-status')!)).toBeGreaterThan(
      kids.indexOf(el.shadowRoot!.querySelector('.km-editor')!)
    );
  });

  it('hugs the body in top position (status between toolbar and editor)', async () => {
    const el = await mount({ value: 'x', toolbar: 'top', statusbar: 'top' });
    // Toolbar is the outer surface child; status sits inside the body, before the editor.
    const body = el.shadowRoot!.querySelector('.we-body')!;
    const kids = Array.from(body.children);
    expect(kids.indexOf(el.shadowRoot!.querySelector('.we-status')!)).toBeLessThan(
      kids.indexOf(el.shadowRoot!.querySelector('.km-editor')!)
    );
    // The toolbar is outside the body group (direct child of the surface).
    expect(el.shadowRoot!.querySelector('.we-surface > .we-toolbar')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.we-body .we-toolbar')).toBeNull();
  });

  it('supports a status bar on both edges (Chars top, Words bottom)', async () => {
    const el = await mount({ value: 'hi there', statusbar: 'both' });
    const body = el.shadowRoot!.querySelector('.we-body')!;
    const slots = Array.from(body.children).filter((c) => c.classList.contains('we-status'));
    expect(slots.length).toBe(2); // top + bottom slots both present
    const [top, bottom] = slots.map((s) => s.querySelector('.we-statusbar') as HTMLElement);
    expect(top.hidden).toBe(false);
    expect(bottom.hidden).toBe(false);
    // Top strip shows Chars; Words is hidden there. Bottom strip shows Words.
    const topChars = top.querySelector('[data-status="chars"]') as HTMLElement;
    expect(topChars.hidden).toBe(false);
    expect(topChars.textContent).toBe(`Chars: ${'hi there'.length}`);
    expect((top.querySelector('[data-status="words"]') as HTMLElement).hidden).toBe(true);
    const bottomWords = bottom.querySelector('[data-status="words"]') as HTMLElement;
    expect(bottomWords.hidden).toBe(false);
    expect(bottomWords.textContent).toBe('Words: 2');
  });

  it('accepts custom plugins via the `plugins` property', async () => {
    const el = await mount({ value: 'x', statusbar: 'bottom' });
    const p = definePlugin({
      name: 'custom-status',
      statusItems: [{ id: 'custom', align: 'start', render: () => 'CUSTOM' }],
    });
    el.plugins = [...defaultPlugins(), p];
    await el.whenSettled();
    expect(getEditorEngine(el)!.statusItems.some((i) => i.id === 'custom')).toBe(true);
    const node = el.shadowRoot!.querySelector('.we-status-item[data-status="custom"]');
    expect(node?.textContent).toBe('CUSTOM');
  });

  it('preview (read-only) keeps only the view-mode group', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'preview' });
    expect(bar(el).hidden).toBe(false);
    const shown = [...bar(el).querySelectorAll<HTMLElement>('.we-group')].filter((g) => !g.hidden);
    expect(shown.map((g) => g.dataset.group)).toEqual(['view']);
    expect(cmd(el, 'view-preview').getAttribute('aria-pressed')).toBe('true');
  });

  it('readonly keeps only the view-mode group; disabled hides the toolbar', async () => {
    const el = await mount({ value: 'x', readonly: '' });
    const shown = () => [...bar(el).querySelectorAll<HTMLElement>('.we-group')].filter((g) => !g.hidden).map((g) => g.dataset.group);
    expect(shown()).toEqual(['view']);
    el.removeAttribute('readonly');
    el.setAttribute('disabled', '');
    await el.whenSettled();
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
// so the element describe above sticks to rendering/visibility and the toggled /
// enabled / click-to-run behaviour is covered here on the raw renderer.
describe('CommandBar', () => {
  function setup(markdown = '# Hello world') {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const engine = new EditorEngine({ mount: mountEl, markdown });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const bar = new CommandBar(parent, defaultToolbarItems, createActionHost({ engine }));
    return { engine, bar, parent };
  }
  const btn = (parent: HTMLElement, id: string) =>
    parent.querySelector(`[data-action="${id}"]`) as HTMLButtonElement;
  const select = (engine: EditorEngine, from: number, to: number) =>
    engine.view.dispatch(
      engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, from, to))
    );

  it('runs a command on click and reflects its toggled state', async () => {
    const { engine, bar, parent } = setup();
    select(engine, 2, 7); // inside "Hello world"
    btn(parent, 'bold').click();
    await Promise.resolve(); // core runAction settles on a microtask
    await Promise.resolve();
    expect(engine.getMarkdown()).toContain('**');
    bar.refresh();
    expect(btn(parent, 'bold').classList.contains('toggled')).toBe(true);
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
      host: createActionHost({ engine }),
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
      host: createActionHost({ engine }),
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
    expect(container.querySelector('.km-menu.we-context-menu .km-menu__item')).toBeTruthy();
    expect(container.querySelector('.we-context-menu')!.getAttribute('part')).toBe('context-menu');
    menu.destroy();
    expect(container.querySelector('.km-menu')).toBeNull();
  });

  it('a toggle command is a menuitemcheckbox (aria-checked), the rest menuitems', () => {
    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const engine = new EditorEngine({ mount: mountEl, markdown: '# Hello world' });
    const menu = new ContextMenu({
      view: engine.view,
      host: createActionHost({ engine }),
      items: ['heading', 'bold', { action: 'custom', id: 'plain', text: 'Plain' }],
      container,
    });
    engine.view.dispatch(engine.view.state.tr.setSelection(TextSelection.create(engine.view.state.doc, 3, 3)));
    engine.view.dom.dispatchEvent(contextmenu());
    const item = (sel: string) => container.querySelector(`.km-menu__item${sel}`) as HTMLElement;
    expect(item('[data-action="heading"]').getAttribute('role')).toBe('menuitemcheckbox');
    expect(item('[data-action="heading"]').getAttribute('aria-checked')).toBe('true');
    expect(item('[data-action="heading"]').classList.contains('km-menu__item--toggled')).toBe(true);
    expect(item('[data-action="bold"]').getAttribute('aria-checked')).toBe('false');
    const plain = item('[data-id="plain"]');
    expect(plain.getAttribute('role')).toBe('menuitem');
    expect(plain.hasAttribute('aria-checked')).toBe(false);
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
