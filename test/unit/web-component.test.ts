/**
 * `<km-editor>` element tests — the BlissElement shell over the engine. Exercises
 * registration, content I/O through the `contentFormat` lens, readonly/editable, and the
 * outward `change` / `ready` / `view-mode-change` events. Runs in happy-dom (the same
 * environment the engine tests use, so EditorView works here).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { KmEditorElement } from '../../src/web-component';
import { getEditorEngine } from '../../src/web-component';

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
    const el = await mount({ value: '# Hello', 'content-format': 'markdown' });
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

  it('core `defer` holds the first build until release()', async () => {
    const el = document.createElement('km-editor') as KmEditorElement;
    el.shouldDefer = true;
    let readyCount = 0;
    el.addEventListener('ready', () => readyCount++);
    document.body.appendChild(el);
    el.setAttribute('value', '# Deferred');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.isReady).toBe(false);
    expect(el.shadowRoot!.querySelector('.ProseMirror')).toBeNull();
    el.release();
    await el.whenReady();
    expect(readyCount).toBe(1);
    expect(el.hasAttribute('ready')).toBe(true);
    expect(el.getMarkdown()).toContain('# Deferred');
  });

  it('destroy() tears the engine down for good — re-inserting does not rebuild', async () => {
    const el = await mount({ value: '# Gone' });
    el.destroy();
    expect(el.isDestroyed).toBe(true);
    expect(el.shadowRoot!.querySelector('.ProseMirror')).toBeNull();
    el.remove();
    document.body.appendChild(el);
    await el.whenSettled();
    expect(el.shadowRoot!.querySelector('.ProseMirror')).toBeNull();
    expect(el.getMarkdown()).toBe('');
  });

  it('`value` property replaces the live document; the `value` attribute stays the default', async () => {
    const el = await mount({ value: '# Initial' });
    el.value = '# Assigned';
    expect(el.getMarkdown()).toContain('# Assigned');
    expect(el.getAttribute('value')).toBe('# Initial');
    expect(el.defaultValue).toBe('# Initial');
  });

  it('reads live content via the active format lens', async () => {
    const el = await mount({ value: '# Title', 'content-format': 'markdown' });
    expect(el.value).toContain('# Title');
    expect(el.defaultValue).toBe('# Title');
    el.contentFormat = 'html';
    expect(el.value).toContain('<h1');
    el.contentFormat = 'json';
    expect(typeof el.value).toBe('string'); // serialize() returns a JSON string
    expect('getValue' in el).toBe(false);
  });

  it('setValue replaces the document', async () => {
    const el = await mount({ value: '# One' });
    el.setValue('# Two', 'markdown');
    expect(el.getMarkdown()).toContain('# Two');
    expect(el.getMarkdown()).not.toContain('# One');
  });

  it('emits `change` with the content in the active format', async () => {
    const el = await mount({ value: 'start', 'content-format': 'markdown' });
    const details: Array<{ value: string; contentFormat: string }> = [];
    el.addEventListener('change', (e) => details.push((e as CustomEvent).detail));
    el.setValue('changed', 'markdown');
    expect(details.length).toBeGreaterThan(0);
    expect(details.at(-1)!.contentFormat).toBe('markdown');
    expect(details.at(-1)!.value).toContain('changed');
  });

  it('readonly disables editing; clearing it re-enables', async () => {
    const el = await mount({ value: 'x', readonly: '' });
    expect(getEditorEngine(el)!.isEditable()).toBe(false);
    el.removeAttribute('readonly');
    await el.whenSettled();
    expect(getEditorEngine(el)!.isEditable()).toBe(true);
  });

  it('view-mode="preview" forces read-only', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'preview' });
    expect(getEditorEngine(el)!.isEditable()).toBe(false);
  });

  it('reflects `contentFormat` and re-announces change when it switches', async () => {
    const el = await mount({ value: '# H', 'content-format': 'markdown' });
    const formats: string[] = [];
    el.addEventListener('change', (e) => formats.push((e as CustomEvent).detail.contentFormat));
    el.setAttribute('content-format', 'html');
    await el.whenSettled();
    expect(el.getAttribute('content-format')).toBe('html');
    expect(formats.at(-1)).toBe('html');
  });

  it('emits `view-mode-change` when the mode switches', async () => {
    const el = await mount({ value: 'x' });
    const modes: string[] = [];
    el.addEventListener('view-mode-change', (e) => modes.push((e as CustomEvent).detail.viewMode));
    el.setAttribute('view-mode', 'split');
    await el.whenSettled();
    expect(modes.at(-1)).toBe('split');
  });
});

describe('<km-editor> view modes', () => {
  const root = (el: KmEditorElement) => el.shadowRoot!.querySelector('.we-root')!;

  it('edit (default) renders just the editor surface', async () => {
    const el = await mount({ value: '# Edit' });
    expect(root(el).classList.contains('we-edit')).toBe(true);
    expect(root(el).getAttribute('part')).toBe('container');
    expect(el.shadowRoot!.querySelector('.km-editor')).toBeTruthy();
    expect(el.shadowRoot!.querySelector('.we-output')).toBeNull();
  });

  it('split renders a live output panel reflecting the document', async () => {
    const el = await mount({ value: '# Split', 'view-mode': 'split' });
    expect(root(el).classList.contains('we-split')).toBe(true);
    const pre = el.shadowRoot!.querySelector('.we-output-pre') as HTMLPreElement;
    expect(pre).toBeTruthy();
    // Default output lens is the I/O format (markdown here).
    expect(pre.textContent).toContain('# Split');
  });

  it('split output tabs switch the serialization lens', async () => {
    const el = await mount({ value: '# Tabs', 'view-mode': 'split' });
    const pre = el.shadowRoot!.querySelector('.we-output-pre') as HTMLPreElement;
    const htmlTab = el.shadowRoot!.querySelector('.we-output-tabs button[data-format="html"]') as HTMLButtonElement;
    htmlTab.click();
    expect(htmlTab.classList.contains('active')).toBe(true);
    expect(pre.textContent).toContain('<h1');
  });

  it('switching modes preserves the document (mount is re-parented, not rebuilt)', async () => {
    const el = await mount({ value: '# Keep me', 'view-mode': 'edit' });
    const before = el.getMarkdown();
    el.setAttribute('view-mode', 'split');
    await el.whenSettled();
    el.setAttribute('view-mode', 'edit');
    await el.whenSettled();
    expect(el.getMarkdown()).toBe(before);
    expect(el.getMarkdown()).toContain('# Keep me');
  });

  it('preview renders read-only', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'preview' });
    expect(root(el).classList.contains('we-preview')).toBe(true);
    expect(getEditorEngine(el)!.isEditable()).toBe(false);
  });

  it('inline renders a floating card (no anchor → normal flow, no throw)', async () => {
    const el = await mount({ value: 'x', 'view-mode': 'inline' });
    expect(root(el).classList.contains('we-inline')).toBe(true);
  });
});

describe('<km-editor> empty document + placeholder', () => {
  it('starts with an empty document when no value is given', async () => {
    const el = await mount();
    expect(el.value).toBe('');
    const pm = el.shadowRoot!.querySelector('.ProseMirror')!;
    expect(pm.textContent).toBe('');
    // labels.placeholder defaults to '' — no placeholder decoration.
    expect(pm.querySelector('.we-placeholder')).toBeNull();
  });

  it('labels.placeholder shows while empty, hides with content, applies live', async () => {
    const el = await mount();
    el.labels = { placeholder: 'Write something…' };
    await el.whenSettled();
    const pm = el.shadowRoot!.querySelector('.ProseMirror')!;
    expect(pm.querySelector('.we-placeholder')?.getAttribute('data-placeholder')).toBe('Write something…');
    expect(pm.getAttribute('aria-placeholder')).toBe('Write something…');
    el.value = 'text';
    expect(pm.querySelector('.we-placeholder')).toBeNull();
    expect(pm.hasAttribute('aria-placeholder')).toBe(false);
    el.value = '';
    expect(pm.querySelector('.we-placeholder')).not.toBeNull();
  });
});

describe('<km-editor> form', () => {
  const hidden = (el: KmEditorElement) => (Array.from(el.children).find((c) => c instanceof HTMLInputElement && c.type === "hidden") as HTMLInputElement | undefined) ?? null;

  it('no `name` → no hidden input', async () => {
    const el = await mount({ value: '# A' });
    expect(hidden(el)).toBeNull();
  });

  it('`name` renders a light-DOM hidden input synced with the live value', async () => {
    const form = document.createElement('form');
    document.body.appendChild(form);
    const el = document.createElement('km-editor') as KmEditorElement;
    el.setAttribute('name', 'body');
    el.setAttribute('value', '# A');
    form.appendChild(el);
    await el.whenSettled();
    const input = hidden(el)!;
    expect(input.name).toBe('body');
    expect(input.value).toBe(el.value);
    expect(new FormData(form).get('body')).toBe(el.value);
    el.value = 'changed';
    expect(input.value).toBe('changed');
    el.contentFormat = 'html';
    await el.whenSettled();
    expect(input.value).toContain('<p>changed</p>');
    el.removeAttribute('name');
    await el.whenSettled();
    expect(hidden(el)).toBeNull();
  });

  it('disabled → the hidden input is disabled (not submitted)', async () => {
    const el = await mount({ name: 'body', value: 'x' });
    el.isDisabled = true;
    await el.whenSettled();
    expect(hidden(el)!.disabled).toBe(true);
    el.isDisabled = false;
    await el.whenSettled();
    expect(hidden(el)!.disabled).toBe(false);
  });

  it('getValueFormatCallback formats only the submitted value; el.value stays the document', async () => {
    const el = await mount({ name: 'body', value: '<h1>A</h1>', 'content-format': 'html' });
    const seen: Array<{ keys: string[]; contentFormat: string; isCtx: boolean }> = [];
    el.getValueFormatCallback = (ctx) => {
      seen.push({ keys: Object.keys(ctx).sort(), contentFormat: ctx.contentFormat, isCtx: ctx.element === el && ctx.controller === el.controller });
      return ctx.value.replace(/<[^>]+>/g, '');
    };
    await el.whenSettled();
    expect(hidden(el)!.value).toBe('A');
    expect(el.value).toBe('<h1>A</h1>');
    expect(seen.at(-1)).toEqual({ keys: ['contentFormat', 'value'], contentFormat: 'html', isCtx: true });
    el.value = '<p>B <b>x</b></p>';
    expect(hidden(el)!.value).toBe('B x');
    el.getValueFormatCallback = null;
    await el.whenSettled();
    expect(hidden(el)!.value).toBe(el.value);
  });

  it('a throwing getValueFormatCallback submits the unformatted value', async () => {
    const el = await mount({ name: 'body', value: 'x' });
    el.getValueFormatCallback = () => {
      throw new Error('boom');
    };
    await el.whenSettled();
    expect(hidden(el)!.value).toBe(el.value);
  });

  it('form reset restores defaultValue', async () => {
    const el = await mount({ name: 'body', value: 'initial' });
    el.value = 'edited';
    el.formResetCallback();
    expect(el.value).toBe('initial');
    expect(hidden(el)!.value).toBe('initial');
  });
});
