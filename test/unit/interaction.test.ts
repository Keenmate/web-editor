/**
 * Interaction model (web-components-core `/actions`, SPEC §12.5 / §12.12):
 * events + `on*` twins sharing one detail, `controller` / `element` on every
 * detail and ctx (non-enumerable), the `el.controller` facade, toolbar items as
 * core action items (defaults from the command registry, `onClick`, the
 * `action` event, `beforeActionCallback` veto), and single-ctx callbacks.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { KmEditorElement } from '../../src/web-component';
import { getEditorEngine } from '../../src/web-component';
import { definePlugin } from '../../src/engine/plugin';
import { defaultPlugins } from '../../src/engine/default-plugins';
import type { EditorActionEventDetail } from '../../src/interaction';

beforeAll(async () => {
  await import('../../src/index');
});
afterEach(() => {
  document.querySelectorAll('km-editor').forEach((el) => el.remove());
});

async function mount(attrs: Record<string, string> = {}, setup?: (el: KmEditorElement) => void): Promise<KmEditorElement> {
  const el = document.createElement('km-editor') as KmEditorElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  setup?.(el);
  document.body.appendChild(el);
  await el.whenSettled();
  return el;
}

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const toolbarButton = (el: KmEditorElement, action: string) =>
  el.shadowRoot!.querySelector(`.we-toolbar-zone [data-action="${action}"]`) as HTMLButtonElement;

describe('events', () => {
  it('ready: twin and DOM event share one detail carrying controller + element (non-enumerable)', async () => {
    const twin: unknown[] = [];
    const dom: unknown[] = [];
    const el = await mount({}, (e) => {
      e.onReady = (d) => twin.push(d);
      e.addEventListener('ready', (ev) => dom.push((ev as CustomEvent).detail));
    });
    expect(twin.length).toBe(1);
    expect(dom[0]).toBe(twin[0]);
    const detail = twin[0] as { controller: unknown; element: unknown };
    expect(detail.controller).toBe(el.controller);
    expect(detail.element).toBe(el);
    expect(Object.keys(detail)).toEqual([]);
    expect(JSON.stringify(detail)).toBe('{}');
  });

  it('change: onChange receives { value, format } + context', async () => {
    const el = await mount({ value: 'a' });
    const seen: any[] = [];
    el.onChange = (d) => seen.push(d);
    el.setValue('# changed', 'markdown');
    const d = seen.at(-1);
    expect(d.value).toContain('# changed');
    expect(d.format).toBe('markdown');
    expect(d.controller).toBe(el.controller);
    expect(d.element).toBe(el);
    expect(Object.keys(d).sort()).toEqual(['format', 'value']);
  });

  it('mode-change: onModeChange receives { mode }', async () => {
    const el = await mount({ value: 'x' });
    const modes: string[] = [];
    el.onModeChange = (d) => modes.push(d.mode);
    el.setAttribute('mode', 'split');
    await el.whenSettled();
    expect(modes).toEqual(['split']);
  });

  it('events are not composed', async () => {
    const el = await mount({ value: 'x' });
    let composed: boolean | undefined;
    el.addEventListener('change', (e) => (composed = e.composed), { once: true });
    el.setValue('y');
    expect(composed).toBe(false);
  });
});

describe('controller', () => {
  it('is the public facade — content I/O and commands, no engine', async () => {
    const el = await mount({ value: '# Title' });
    const c = el.controller;
    expect(c.isReady).toBe(true);
    expect(c.getValue()).toContain('# Title');
    expect(c.getHTML()).toContain('<h1');
    c.setValue('plain', 'markdown');
    expect(c.getMarkdown()).toContain('plain');
    expect(c.isCommandEnabled('bold')).toBe(true);
    expect(c.runCommand('heading')).toBe(true);
    expect(c.getMarkdown()).toContain('# plain');
    expect(c.isCommandToggled('heading')).toBe(true);
    // A ProseMirror command runs against the live view.
    const ok = c.runCommand((state, dispatch) => {
      dispatch?.(state.tr.insertText('!', state.doc.content.size - 1));
      return true;
    });
    expect(ok).toBe(true);
    expect(c.getMarkdown()).toContain('plain!');
    expect('engine' in el).toBe(false);
    expect('engine' in (c as object)).toBe(false);
  });
});

describe('toolbar items are core action items', () => {
  it('built-in defaults come from the command registry (text, tooltip with shortcut)', async () => {
    const el = await mount({ value: 'x' });
    const bold = toolbarButton(el, 'bold');
    expect(bold.textContent).toBe('B');
    expect(bold.getAttribute('aria-label')).toBe('Bold');
    expect(bold.title).toBe('Bold (Ctrl+B)');
  });

  it('a click runs the command, then fires `action` (+ onAction) with the context (after the fact)', async () => {
    const el = await mount({ value: '# Heading' });
    const order: string[] = [];
    let detail: EditorActionEventDetail | undefined;
    el.onAction = (d) => {
      order.push(`twin:${d.action}`);
      detail = d;
    };
    el.addEventListener('action', () => order.push(`dom:${el.getMarkdown().startsWith('#') ? 'before' : 'after'}`));
    toolbarButton(el, 'paragraph').click();
    await tick();
    expect(order).toEqual(['twin:paragraph', 'dom:after']);
    expect(el.getMarkdown()).not.toContain('#');
    expect(detail!.source).toBe('toolbar');
    expect(detail!.item).toEqual({ action: 'paragraph' });
    expect(detail!.state).toBeTruthy();
    expect(detail!.controller).toBe(el.controller);
    expect(detail!.element).toBe(el);
    expect(Object.keys(detail!)).not.toContain('controller');
  });

  it('beforeActionCallback → false cancels (no event, no command)', async () => {
    const el = await mount({ value: '# Heading' });
    const seen: string[] = [];
    el.beforeActionCallback = (d) => {
      seen.push(`before:${d.action}:${d.controller === el.controller}`);
      return false;
    };
    el.onAction = () => seen.push('action');
    toolbarButton(el, 'paragraph').click();
    await tick();
    expect(seen).toEqual(['before:paragraph:true']);
    expect(el.getMarkdown()).toContain('# Heading');
  });

  it('an async beforeActionCallback can allow', async () => {
    const el = await mount({ value: '# Heading' });
    el.beforeActionCallback = async () => undefined;
    toolbarButton(el, 'paragraph').click();
    await tick();
    expect(el.getMarkdown()).not.toContain('#');
  });

  it('custom items: onClick + action event with id, get*Callback(ctx), dividers', async () => {
    const clicks: EditorActionEventDetail[] = [];
    const actions: EditorActionEventDetail[] = [];
    let ctxSeen: any;
    const custom = definePlugin({
      name: 'custom-items',
      toolbarGroups: [
        {
          id: 'mine',
          text: 'Mine',
          items: [
            {
              action: 'custom',
              id: 'save',
              text: 'Save',
              icon: 'S',
              cssClass: 'my-save',
              getIsToggledCallback: (ctx) => {
                ctxSeen = ctx;
                return true;
              },
              onClick: (d) => {
                clicks.push(d);
              },
            },
            { divider: true },
            { id: 'hidden', text: 'Hidden', isVisible: false },
          ],
        },
      ],
    });
    const el = await mount({ value: 'x' }, (e) => (e.plugins = [...defaultPlugins(), custom]));
    el.onAction = (d) => actions.push(d);
    const group = el.shadowRoot!.querySelector('.we-group[data-group="mine"]')!;
    // Hidden item dropped → the trailing divider is trimmed too.
    expect(group.querySelectorAll('button').length).toBe(1);
    expect(group.querySelector('.we-sep')).toBeNull();
    const save = group.querySelector('[data-id="save"]') as HTMLButtonElement;
    expect(save.dataset.action).toBe('custom');
    expect(save.classList.contains('my-save')).toBe(true);
    expect(save.getAttribute('aria-pressed')).toBe('true');
    expect(ctxSeen.state).toBeTruthy();
    expect(ctxSeen.controller).toBe(el.controller);
    expect(ctxSeen.element).toBe(el);
    save.click();
    await tick();
    expect(clicks.length).toBe(1);
    expect(actions.length).toBe(1);
    expect(actions[0]).toBe(clicks[0]); // onClick and the event share one detail
    expect(actions[0].id).toBe('save');
    expect(actions[0].action).toBe('custom');
  });

  it('an unknown built-in (its plugin not loaded) renders disabled', async () => {
    const p = definePlugin({ name: 'ghost', toolbarGroups: [{ id: 'ghost', items: ['no-such-command'] }] });
    const el = await mount({ value: 'x' }, (e) => (e.plugins = [...defaultPlugins(), p]));
    expect(toolbarButton(el, 'no-such-command').disabled).toBe(true);
  });
});

describe('single-ctx callbacks carry controller + element', () => {
  it('CommandSpec.getIsToggledCallback / getIsEnabledCallback and StatusItem.render get { state } + context', async () => {
    const seen: any[] = [];
    const p = definePlugin({
      name: 'probe',
      commands: () => [
        {
          id: 'probe',
          run: () => true,
          getIsToggledCallback: (ctx) => (seen.push(['toggled', ctx]), false),
          getIsEnabledCallback: (ctx) => (seen.push(['enabled', ctx]), true),
        },
      ],
      toolbarGroups: [{ id: 'probe', items: ['probe'] }],
      statusItems: [{ id: 'probe', render: (ctx) => (seen.push(['status', ctx]), 'P') }],
    });
    const el = await mount({ value: 'x', statusbar: 'bottom' }, (e) => (e.plugins = [...defaultPlugins(), p]));
    for (const kind of ['toggled', 'enabled', 'status']) {
      const entry = seen.find(([k]) => k === kind);
      expect(entry, kind).toBeTruthy();
      expect(entry[1].state).toBeTruthy();
      expect(entry[1].controller).toBe(el.controller);
      expect(entry[1].element).toBe(el);
      expect(Object.keys(entry[1])).toEqual(['state']);
    }
  });

  it('interactionHost.request(ctx) gets the request + signal + context; lock-change fires around the run', async () => {
    const { imageBrowserPlugin } = await import('../../src/plugins/image-browser');
    let reqCtx: any;
    const locks: boolean[] = [];
    const el = await mount({ value: 'x' }, (e) => {
      e.plugins = [...defaultPlugins(), imageBrowserPlugin({ upload: async ({ asset, signal }) => (signal ? asset.url : '') })];
      e.interactionHost = {
        request: async (ctx) => {
          reqCtx = ctx;
          return { cancelled: false, value: { url: 'data:image/png;base64,AAAA' } };
        },
      };
      e.onLockChange = (d) => locks.push(d.isLocked);
    });
    el.controller.runCommand('image:browser:pick');
    await new Promise((r) => setTimeout(r, 20));
    expect(reqCtx.kind).toBe('cloud-picker');
    expect(reqCtx.signal).toBeInstanceOf(AbortSignal);
    expect(reqCtx.controller).toBe(el.controller);
    expect(reqCtx.element).toBe(el);
    expect(locks).toEqual([true, false]);
    expect(getEditorEngine(el)!.getHTML()).toContain('<img');
  });
});
