/**
 * `labels` (rulebook D-NC-24): one partial object of UI strings over built-in
 * English — command items by camel-cased id, toolbar groups, status items,
 * prompts. JSON attribute or property; applies live. Runs in happy-dom.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { KmEditorElement } from '../../src/web-component';
import { getEditorEngine } from '../../src/web-component';
import { labelKey, formatLabel, createLabelResolver } from '../../src/labels';

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

  it('resolver: instance labels → English default → fallback → key', () => {
    const label = createLabelResolver(() => ({ words: 'Slova: {count}' }));
    expect(label('words', { count: 2 })).toBe('Slova: 2');
    expect(label('chars', { count: 5 })).toBe('Chars: 5');
    expect(label('insertLink', undefined, 'Insert link')).toBe('Insert link');
    expect(label('nope')).toBe('nope');
  });
});

describe('<km-editor> labels', () => {
  it('English defaults: command text / tooltip, group name, status items', async () => {
    const el = await mount({ value: 'one two', statusbar: 'bottom' });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Bold');
    expect(cmd(el, 'insert-link').getAttribute('aria-label')).toBe('Insert link');
    expect(cmd(el, 'insert-link').title).toBe('Insert link (Ctrl+K)');
    const group = el.shadowRoot!.querySelector('[data-group="format"]')!;
    expect(group.getAttribute('aria-label')).toBe('Format');
    expect(status(el, 'words').textContent).toBe('Words: 2');
  });

  it('JSON attribute overrides per key; the rest stays English', async () => {
    const el = await mount({
      value: 'one two',
      statusbar: 'bottom',
      labels: JSON.stringify({ bold: 'Tučně', boldTooltip: 'Tučné písmo', formatGroup: 'Formát', words: 'Slova: {count}' }),
    });
    expect(cmd(el, 'bold').getAttribute('aria-label')).toBe('Tučně');
    expect(cmd(el, 'bold').title).toBe('Tučné písmo');
    expect(cmd(el, 'italic').getAttribute('aria-label')).toBe('Italic');
    expect(el.shadowRoot!.querySelector('[data-group="format"]')!.getAttribute('aria-label')).toBe('Formát');
    expect(status(el, 'words').textContent).toBe('Slova: 2');
  });

  it('a property change applies live, without rebuilding the engine', async () => {
    const el = await mount({ value: 'one', statusbar: 'bottom' });
    const engine = getEditorEngine(el);
    el.labels = { insertLink: 'Vložit odkaz', chars: 'Znaky: {count}' };
    await el.whenSettled();
    expect(getEditorEngine(el)).toBe(engine);
    expect(cmd(el, 'insert-link').getAttribute('aria-label')).toBe('Vložit odkaz');
    expect(cmd(el, 'insert-link').title).toBe('Vložit odkaz (Ctrl+K)');
    expect(status(el, 'chars').textContent).toBe('Znaky: 3');
  });

  it('prompts go through labels', async () => {
    const el = await mount({ value: 'x', labels: JSON.stringify({ imageUrlPrompt: 'URL obrázku:' }) });
    const spy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const engine = getEditorEngine(el)!;
    engine.commands.get('insert-image')!.run(engine.view.state, undefined);
    expect(spy).toHaveBeenCalledWith('URL obrázku:', expect.any(String));
    spy.mockRestore();
  });

  it('rejects a non-string value (warns, keeps the previous labels)', async () => {
    const el = await mount({ value: 'x' });
    el.labels = { bold: 'B!' };
    el.labels = { bold: 3 } as never;
    expect(el.labels).toEqual({ bold: 'B!' });
  });
});
