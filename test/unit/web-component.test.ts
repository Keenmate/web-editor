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

  it('reflects `contentFormat`; switching it is silent (no `change`)', async () => {
    const el = await mount({ value: '# H', 'content-format': 'markdown' });
    const formats: string[] = [];
    el.addEventListener('change', (e) => formats.push((e as CustomEvent).detail.contentFormat));
    el.setAttribute('content-format', 'html');
    await el.whenSettled();
    el.contentFormat = 'markdown';
    await el.whenSettled();
    expect(el.getAttribute('content-format')).toBe('markdown');
    expect(el.value).toContain('# H');
    expect(formats).toEqual([]);
  });

  it('switching `viewMode` (attribute or property) is silent (no `view-mode-change`)', async () => {
    const el = await mount({ value: 'x' });
    const modes: string[] = [];
    el.addEventListener('view-mode-change', (e) => modes.push((e as CustomEvent).detail.viewMode));
    el.setAttribute('view-mode', 'split');
    await el.whenSettled();
    el.viewMode = 'preview';
    await el.whenSettled();
    expect(el.getAttribute('view-mode')).toBe('preview');
    expect(modes).toEqual([]);
  });

  it('setViewMode() fires `view-mode-change` { viewMode, oldViewMode, source: "api" } unless isSilent', async () => {
    const el = await mount({ value: 'x' });
    const seen: unknown[] = [];
    el.onViewModeChange = (d) => seen.push(['twin', d.viewMode, d.oldViewMode, d.source]);
    el.addEventListener('view-mode-change', (e) => {
      const d = (e as CustomEvent).detail;
      seen.push(['event', d.viewMode, d.oldViewMode, d.source, Object.keys(d).sort(), d.controller === el.controller]);
    });
    el.setViewMode('split');
    expect(el.viewMode).toBe('split');
    expect(el.getAttribute('view-mode')).toBe('split');
    expect(el.shadowRoot!.querySelector('.we-root')!.classList.contains('we-split')).toBe(true);
    el.controller.setViewMode('preview');
    el.setViewMode('preview'); // already active: no event
    el.setViewMode('edit', { isSilent: true });
    expect(el.viewMode).toBe('edit');
    el.setViewMode('bogus' as never); // invalid: warns, keeps the current mode, no event
    expect(el.viewMode).toBe('edit');
    expect(seen).toEqual([
      ['twin', 'split', 'edit', 'api'],
      ['event', 'split', 'edit', 'api', ['oldViewMode', 'source', 'viewMode'], true],
      ['twin', 'preview', 'split', 'api'],
      ['event', 'preview', 'split', 'api', ['oldViewMode', 'source', 'viewMode'], true],
    ]);
  });

  it('controller.runCommand("view-…") reports source "api"; a plugin port reports "plugin"', async () => {
    // Running a command focuses the view: only one live editor in the document
    // (happy-dom's shadow activeElement breaks with several).
    document.querySelectorAll('km-editor').forEach((e) => e.remove());
    const el = await mount({ value: 'x' });
    let setup: { setViewMode?: (m: 'edit' | 'split' | 'preview' | 'inline') => void } = {};
    let stageSet: ((m: 'edit' | 'split' | 'preview' | 'inline') => void) | undefined;
    const { defaultPlugins } = await import('../../src/engine/default-plugins');
    el.plugins = [
      ...defaultPlugins(),
      {
        name: 'vm-probe',
        setup: (ctx) => { setup = ctx; },
        pipelines: [{ name: 'vm:probe', timing: 'sync', stages: [{ id: 'grab', kind: 'derive', run: (_c: unknown, rt: { setViewMode?: typeof stageSet }) => { stageSet = rt.setViewMode; return { action: 'resolve' }; } }] }],
      } as never,
    ];
    const sources: string[] = [];
    el.addEventListener('view-mode-change', (e) => sources.push(`${(e as CustomEvent).detail.viewMode}:${(e as CustomEvent).detail.source}`));
    el.controller.runCommand('view-split');
    setup.setViewMode!('preview');
    el.controller.runCommand('vm:probe');
    stageSet!('edit');
    expect(sources).toEqual(['split:api', 'preview:plugin', 'edit:plugin']);
    el.remove(); // runCommand focused the view: detach it (happy-dom shadow-selection quirk)
  });

  it('assigning `value` / setValue({ isSilent }) is silent but syncs the hidden form input', async () => {
    const el = await mount({ value: 'a', name: 'body', 'content-format': 'markdown' });
    const changes: string[] = [];
    el.addEventListener('change', (e) => changes.push((e as CustomEvent).detail.value));
    el.value = '# assigned';
    expect(el.value).toContain('# assigned');
    const input = el.querySelector('input[type="hidden"]') as HTMLInputElement;
    expect(input.value).toContain('# assigned');
    el.setValue('# quiet', 'markdown', { isSilent: true });
    expect(input.value).toContain('# quiet');
    el.controller.setValue('# quiet too', undefined, { isSilent: true });
    expect(input.value).toContain('# quiet too');
    expect(changes).toEqual([]);
    el.setValue('# loud');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain('# loud');
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

  it("a throwing getValueFormatCallback submits '', marks the host invalid, fires value-format-error; success clears", async () => {
    const el = await mount({ name: 'body', value: 'x' });
    const calls: Array<[unknown, string | undefined]> = [];
    (el as any).setFormatError = (error: unknown, message?: string) => calls.push([error, message]);
    const events: Array<{ error: unknown; value: string }> = [];
    el.addEventListener('value-format-error', (e) => events.push((e as CustomEvent).detail));
    const twin: unknown[] = [];
    el.onValueFormatError = (d) => twin.push(d);
    const boom = new Error('boom');
    el.getValueFormatCallback = () => {
      throw boom;
    };
    await el.whenSettled();
    expect(hidden(el)!.value).toBe('');
    expect(calls).toEqual([[boom, 'The value could not be formatted.']]);
    expect(events).toEqual([{ error: boom, value: 'x' }]);
    expect(twin[0]).toBe(events[0]);
    el.labels = { valueFormatError: 'Nelze formátovat.' };
    el.value = 'y';
    expect(calls.at(-1)).toEqual([boom, 'Nelze formátovat.']);
    expect(events.at(-1)).toEqual({ error: boom, value: 'y' });
    el.getValueFormatCallback = ({ value }) => value + '!';
    await el.whenSettled();
    expect(hidden(el)!.value).toBe('y!');
    expect(calls.at(-1)).toEqual([null, undefined]);
    const n = calls.length;
    el.value = 'z';
    expect(calls.length).toBe(n); // no redundant clear while valid
  });

  it('form reset restores defaultValue silently (no `change`, like native form.reset())', async () => {
    const el = await mount({ name: 'body', value: 'initial' });
    el.value = 'edited';
    const changes: unknown[] = [];
    el.addEventListener('change', (e) => changes.push(e));
    el.formResetCallback();
    expect(el.value).toBe('initial');
    expect(hidden(el)!.value).toBe('initial');
    expect(changes).toEqual([]);
  });
});

describe('<km-editor> pending loader (core renderLoader)', () => {
  /** A deferred pipeline that resolves when `release()` is called. */
  function slowPlugin() {
    let release!: () => void;
    const plugin = {
      name: 'slow',
      pipelines: [
        {
          name: 'slow:run',
          timing: 'deferred' as const,
          policy: { thresholdMs: 0 },
          stages: [
            {
              id: 'wait',
              run: () => new Promise<{ action: 'resolve' }>((r) => (release = () => r({ action: 'resolve' }))),
            },
          ],
        },
      ],
    };
    return { plugin, release: () => release() };
  }

  async function mountSlow() {
    const { defaultPlugins } = await import('../../src/index');
    const el = await mount();
    const slow = slowPlugin();
    el.plugins = [...defaultPlugins(), slow.plugin];
    await el.whenSettled();
    const slot = el.shadowRoot!.querySelector('.we-pending') as HTMLElement;
    return { el, slot, release: slow.release };
  }
  const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

  it('shows the default .we__loader with role=status + labels.loading past the threshold, removes it after', async () => {
    const { el, slot, release } = await mountSlow();
    expect(slot.hidden).toBe(true);
    getEditorEngine(el)!.run('slow:run');
    await tick();
    expect(slot.hidden).toBe(false);
    expect(slot.getAttribute('role')).toBe('status');
    expect(slot.getAttribute('aria-label')).toBe('Loading…');
    expect(slot.querySelector('.we__loader')).toBeTruthy();
    release();
    await tick();
    expect(slot.hidden).toBe(true);
    expect(slot.hasAttribute('role')).toBe(false);
    expect(slot.childElementCount).toBe(0);
  });

  it('renderLoadingCallback draws instead of the default (context "pipeline"), cleanup runs on remove', async () => {
    const { el, slot, release } = await mountSlow();
    const seen: string[] = [];
    el.labels = { loading: 'Nahrávám…' };
    el.renderLoadingCallback = ({ context, containerElement, label, component }) => {
      seen.push(`${component}:${context}:${label}`);
      containerElement.append(Object.assign(document.createElement('b'), { className: 'mine' }));
      return () => seen.push('cleanup');
    };
    await el.whenSettled();
    getEditorEngine(el)!.run('slow:run');
    await tick();
    expect(slot.querySelector('.mine')).toBeTruthy();
    expect(slot.querySelector('.we__loader')).toBeNull();
    release();
    await tick();
    expect(slot.querySelector('.mine')).toBeNull();
    expect(seen).toEqual(['km-editor:pipeline:Nahrávám…', 'cleanup']);
  });
});
