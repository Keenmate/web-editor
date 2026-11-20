/**
 * `labels` (rulebook D-NC-24): one partial object of UI strings over built-in
 * English — command items by camel-cased id, toolbar groups, status items,
 * prompts. JSON attribute or property; applies live. Runs in happy-dom.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { KmEditorElement } from '../../src/web-component';
import { getEditorEngine } from '../../src/web-component';
import { labelKey, formatLabel, createLabelResolver } from '../../src/labels';
import { EditorEngine } from '../../src/engine/editor-engine';

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

const cmd = (el: KmEditorElement, id: string) =>
  el.shadowRoot!.querySelector(`.we-toolbar-zone [data-action="${id}"]`) as HTMLButtonElement;
const status = (el: KmEditorElement, id: string) =>
  el.shadowRoot!.querySelector(`.we-status-item[data-status="${id}"]`) as HTMLElement;

describe('label helpers', () => {
  it('labelKey camel-cases command ids', () => {
    expect(labelKey('insert-link')).toBe('insertLink');
    expect(labelKey('image:browser:pick')).toBe('imageBrowserPick');
    expect(labelKey('bold')).toBe('bold');
  });

  it('formatLabel fills {name} placeholders and leaves unknown ones', () => {
    expect(formatLabel('Words: {count}', { count: 3 })).toBe('Words: 3');
    expect(formatLabel('{a} {b}', { a: 'x' })).toBe('x {b}');
  });

  it('resolver: instance labels → English default → fallback → key (standalone: no host)', () => {
    const label = createLabelResolver(() => ({ 'labels.words': 'Slova: {count}' }));
    expect(label('labels.words', { count: 2 })).toBe('Slova: 2');
    expect(label('labels.chars', { count: 5 })).toBe('Chars: 5');
    expect(label('ariaLabels.insertLink', undefined, 'Insert link')).toBe('Insert link');
    expect(label('nope')).toBe('nope');
  });

  it('standalone resolver: instance labels → own translateCallback → page-wide one (null = not mine) → built-in', () => {
    const reg = (window as any).components;
    const page = vi.fn(({ key, template }: { key: string; template: string }) => (key === 'km-editor.ariaLabels.bold' ? 'Tučné' : `P:${template}`));
    const own = vi.fn(({ key, template }: { key: string; template: string }) => (key === 'km-editor.labels.chars' ? `T:${template}` : null));
    try {
      reg.locale = { translateCallback: page };
      const label = createLabelResolver(() => ({ 'labels.words': 'Slova: {count}' }), null, () => own);
      expect(label('labels.words', { count: 2 })).toBe('Slova: 2'); // instance key: beats both callbacks
      expect(label('labels.chars', { count: 5 })).toBe('T:Chars: {count}'); // own beats page
      expect(label('ariaLabels.bold', undefined, 'Bold')).toBe('Tučné'); // own null → page
      expect(own).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'km-editor.labels.words' }));
      expect(page).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'km-editor.labels.words' }));
      expect(page).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'km-editor.labels.chars' }));
      expect(own).toHaveBeenCalledWith(expect.objectContaining({ component: 'km-editor', key: 'km-editor.labels.chars', params: { count: 5 } }));
      // Page callback null → built-in; a throwing callback is logged and the next rule decides.
      reg.locale = { translateCallback: () => null };
      expect(label('ariaLabels.bold', undefined, 'Bold')).toBe('Bold');
      const throwing = createLabelResolver(() => null, null, () => () => { throw new Error('boom'); });
      reg.locale = { translateCallback: ({ template }: { template: string }) => `P:${template}` };
      expect(throwing('buttons.ok')).toBe('P:OK');
    } finally {
      reg.locale = null;
    }
  });

  it('a standalone EditorEngine takes a translateCallback option', () => {
    const mountEl = document.body.appendChild(document.createElement('div'));
    const engine = new EditorEngine({
      mount: mountEl,
      markdown: 'x',
      translateCallback: ({ key }) => (key === 'km-editor.buttons.ok' ? 'Dobře' : null),
    });
    try {
      expect(engine.label('buttons.ok')).toBe('Dobře');
      expect(engine.label('buttons.cancel')).toBe('Cancel');
      // The page-wide translateCallback is asked after the engine's own (same order as the element).
      (window as any).components.locale = { translateCallback: ({ key }: { key: string }) => (key === 'km-editor.buttons.cancel' || key === 'km-editor.buttons.ok' ? 'PAGE' : null) };
      expect(engine.label('buttons.ok')).toBe('Dobře');
      expect(engine.label('buttons.cancel')).toBe('PAGE');
    } finally {
      (window as any).components.locale = null;
      engine.destroy();
      mountEl.remove();
    }
  });
});

describe('<km-editor> labels', () => {
  it("resolver: '' is deliberately empty, undefined falls back to English", () => {
    const label = createLabelResolver(() => ({ 'labels.words': '', 'ariaLabels.bold': undefined }));
    expect(label('labels.words', { count: 3 })).toBe('');
    expect(label('ariaLabels.bold', undefined, 'Bold')).toBe('Bold');
    expect(label('placeholders.document')).toBe('');
  });

  it('English defaults: command text / tooltip, group name, status items', async () => {
    const el = await mount({ value: 'one two', statusbar: 'bottom' });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Bold');
    expect(cmd(el, 'insert-link').getAttribute('aria-label')).toBe('Insert link');
    expect(cmd(el, 'insert-link').dataset.tooltip).toBe('Insert link (Ctrl+K)');
    const group = el.shadowRoot!.querySelector('[data-group="format"]')!;
    expect(group.getAttribute('aria-label')).toBe('Format');
    expect(status(el, 'words').textContent).toBe('Words: 2');
  });

  it('JSON attribute overrides per key; the rest stays English', async () => {
    const el = await mount({
      value: 'one two',
      statusbar: 'bottom',
      labels: JSON.stringify({ 'ariaLabels.bold': 'Tučně', 'tooltips.bold': 'Tučné písmo', 'ariaLabels.formatGroup': 'Formát', 'labels.words': 'Slova: {count}' }),
    });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Tučně');
    expect(cmd(el, 'bold').dataset.tooltip).toBe('Tučné písmo');
    expect(cmd(el, 'italic').getAttribute('aria-label')).toBe('Italic');
    expect(el.shadowRoot!.querySelector('[data-group="format"]')!.getAttribute('aria-label')).toBe('Formát');
    expect(status(el, 'words').textContent).toBe('Slova: 2');
  });

  it('full keys (km-editor.<key>) work on the instance too; a text toolbar button takes buttons.<name>', async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ 'km-editor.ariaLabels.bold': 'Tučně', 'buttons.viewEdit': 'Upravit' }) });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Tučně');
    expect(cmd(el, 'view-edit').textContent).toBe('Upravit');
    expect(cmd(el, 'view-edit').hasAttribute('aria-label')).toBe(false); // a text button is named by its text (D-NC-24)
  });

  it("an icon button's twins share <name>: an unset one follows the customized one (core fallback)", async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ 'tooltips.bold': 'Tučné písmo', 'ariaLabels.italic': 'Kurzíva' }) });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Tučné písmo');
    expect(cmd(el, 'bold').dataset.tooltip).toBe('Tučné písmo');
    expect(cmd(el, 'italic').getAttribute('aria-label')).toBe('Kurzíva');
    expect(cmd(el, 'italic').dataset.tooltip).toBe('Kurzíva (Ctrl+I)'); // the text + shortcut, as in English
  });

  it('a property change applies live, without rebuilding the engine', async () => {
    const el = await mount({ value: 'one', statusbar: 'bottom' });
    const engine = getEditorEngine(el);
    el.labels = { 'ariaLabels.insertLink': 'Vložit odkaz', 'labels.chars': 'Znaky: {count}' };
    await el.whenSettled();
    expect(getEditorEngine(el)).toBe(engine);
    expect(cmd(el, 'insert-link').getAttribute('aria-label')).toBe('Vložit odkaz');
    expect(cmd(el, 'insert-link').dataset.tooltip).toBe('Vložit odkaz (Ctrl+K)');
    expect(status(el, 'chars').textContent).toBe('Znaky: 3');
  });

  it('prompts go through labels (a core /dialog, not window.prompt)', async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ 'headers.imageUrl': 'URL obrázku', 'buttons.cancel': 'Zrušit' }) });
    const spy = vi.spyOn(window, 'prompt');
    const engine = getEditorEngine(el)!;
    const { view } = engine;
    engine.commands.get('insert-image')!.run(view.state, view.dispatch, view);
    const panel = document.querySelector('.km-dialog-layer')?.shadowRoot?.querySelector('.km-dialog');
    expect(panel?.querySelector('.km-sheet-title')?.textContent).toBe('URL obrázku');
    expect([...panel!.querySelectorAll('.km-dialog__action')].map((b) => b.textContent)).toEqual(['Zrušit', 'OK']);
    expect(spy).not.toHaveBeenCalled();
    (panel!.querySelector('[data-value="cancel"]') as HTMLButtonElement).click();
    expect(document.querySelector('.km-dialog-layer')).toBeNull();
    spy.mockRestore();
  });

  it('page-wide labels (window.components.locale) sit between the instance labels and English; a change re-renders live', async () => {
    const el = await mount({ value: 'one two', statusbar: 'bottom', labels: JSON.stringify({ 'ariaLabels.italic': 'Kurzíva' }) });
    const reg = (window as any).components;
    try {
      reg.locale = { labels: { 'km-editor.ariaLabels.bold': 'Tučně', 'km-editor.ariaLabels.italic': 'page loses', 'km-editor.labels.words': 'Slova: {count}', 'web-editor.ariaLabels.underline': 'not ours' } };
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Tučně');
      expect(cmd(el, 'italic').getAttribute('aria-label')).toBe('Kurzíva');
      expect(cmd(el, 'underline').getAttribute('aria-label')).toBe('Underline');
      expect(status(el, 'words').textContent).toBe('Slova: 2');
      reg.locale = { translateCallback: ({ key, template }: { key: string; template: string }) => (key === 'km-editor.ariaLabels.bold' ? `[${template}]` : undefined) };
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('[Bold]');
    } finally {
      reg.locale = null;
    }
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Bold');
  });

  it('translateCallback (instance): beats the page-wide one, null → the page one, instance labels beat both; live', async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ 'ariaLabels.italic': 'Kurzíva' }) });
    const reg = (window as any).components;
    try {
      reg.locale = { translateCallback: ({ template }: { template: string }) => `page:${template}` };
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('page:Bold');
      el.translateCallback = ({ key, template }) => (key === 'km-editor.ariaLabels.bold' ? `own:${template}` : null);
      await el.whenSettled();
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('own:Bold'); // element beats page
      expect(cmd(el, 'underline').getAttribute('aria-label')).toBe('page:Underline'); // null → page
      expect(cmd(el, 'italic').getAttribute('aria-label')).toBe('Kurzíva'); // instance labels beat both
      reg.locale = null;
      expect(cmd(el, 'underline').getAttribute('aria-label')).toBe('Underline');
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('own:Bold'); // one element needs no page setup
      el.translateCallback = null;
      await el.whenSettled();
      expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Bold');
    } finally {
      reg.locale = null;
    }
  });

  it('the split view output tabs take labels (buttons.markdownTab / htmlTab / jsonTab), live', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'split' });
    const tabs = () => [...el.shadowRoot!.querySelectorAll('.we-output-tabs button')].map((b) => b.textContent);
    expect(tabs()).toEqual(['Markdown', 'HTML', 'JSON']);
    el.labels = { 'buttons.markdownTab': 'MD' };
    await el.whenSettled();
    expect(tabs()).toEqual(['MD', 'HTML', 'JSON']);
  });

  it('rejects a non-string value (warns, keeps the previous labels)', async () => {
    const el = await mount({ value: 'x' });
    el.labels = { 'ariaLabels.bold': 'B!' };
    el.labels = { 'ariaLabels.bold': 3 } as never;
    expect(el.labels).toEqual({ 'ariaLabels.bold': 'B!' });
  });
});
