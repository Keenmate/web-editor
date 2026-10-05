/**
 * `<km-editor>` element tests — the BlissElement shell over the engine. Exercises
 * registration, content I/O through the `format` lens, readonly/editable, and the
 * outward `change` / `ready` / `mode-change` events. Runs in happy-dom (the same
 * environment the engine tests use, so EditorView works here).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KmEditorElement } from '../../src/web-component';

// Importing the public entry registers the custom element.
beforeAll(async () => {
  await import('../../src/index');
});

/** Mount a fresh element with the given attributes, settled and connected. */
async function mount(attrs: Record<string, string> = {}): Promise<KmEditorElement> {
  const el = document.createElement('km-editor') as KmEditorElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await el.whenSettled();
  return el;
}

describe('<km-editor>', () => {
  it('registers the custom element', () => {
    expect(customElements.get('km-editor')).toBeTruthy();
  });

  it('builds from a markdown value and becomes ready', async () => {
    const el = await mount({ value: '# Hello', format: 'markdown' });
    expect(el.isReady).toBe(true);
    expect(el.getMarkdown()).toContain('# Hello');
    expect(el.getHTML()).toContain('<h1');
  });

  it('fires the `ready` event once', async () => {
    const el = document.createElement('km-editor') as KmEditorElement;
    let readyCount = 0;
    el.addEventListener('ready', () => readyCount++);
    document.body.appendChild(el);
    await el.whenSettled();
    expect(readyCount).toBe(1);
    expect(el.isReady).toBe(true);
  });

  it('reads live content via the active format lens', async () => {
    const el = await mount({ value: '# Title', format: 'markdown' });
    expect(el.getValue()).toContain('# Title');
    expect(el.getValue('html')).toContain('<h1');
    expect(typeof el.getValue('json')).toBe('string'); // serialize() returns a JSON string
  });

  it('setValue replaces the document', async () => {
    const el = await mount({ value: '# One' });
    el.setValue('# Two', 'markdown');
    expect(el.getMarkdown()).toContain('# Two');
    expect(el.getMarkdown()).not.toContain('# One');
  });

  it('emits `change` with the content in the active format', async () => {
    const el = await mount({ value: 'start', format: 'markdown' });
    const details: Array<{ value: string; format: string }> = [];
    el.addEventListener('change', (e) => details.push((e as CustomEvent).detail));
    el.setValue('changed', 'markdown');
    expect(details.length).toBeGreaterThan(0);
    expect(details.at(-1)!.format).toBe('markdown');
    expect(details.at(-1)!.value).toContain('changed');
  });

  it('readonly disables editing; clearing it re-enables', async () => {
    const el = await mount({ value: 'x', readonly: '' });
    expect(el.engine!.isEditable()).toBe(false);
    el.removeAttribute('readonly');
    await el.whenSettled();
    expect(el.engine!.isEditable()).toBe(true);
  });

  it('mode="preview" forces read-only', async () => {
    const el = await mount({ value: 'x', mode: 'preview' });
    expect(el.engine!.isEditable()).toBe(false);
  });

  it('reflects `format` and re-announces change when it switches', async () => {
    const el = await mount({ value: '# H', format: 'markdown' });
    const formats: string[] = [];
    el.addEventListener('change', (e) => formats.push((e as CustomEvent).detail.format));
    el.setAttribute('format', 'html');
    await el.whenSettled();
    expect(el.getAttribute('format')).toBe('html');
    expect(formats.at(-1)).toBe('html');
  });

  it('emits `mode-change` when the mode switches', async () => {
    const el = await mount({ value: 'x' });
    const modes: string[] = [];
    el.addEventListener('mode-change', (e) => modes.push((e as CustomEvent).detail.mode));
    el.setAttribute('mode', 'split');
    await el.whenSettled();
    expect(modes.at(-1)).toBe('split');
  });
});
