import { test, expect, load, selectText, type Page } from './fixtures';

// Interaction model (web-components-core /actions): events + on* twins sharing
// one detail, controller/element on every detail and ctx (non-enumerable), the
// el.controller facade, toolbar / selection-toolbar / context-menu items as core
// action items (`action` event, onClick, beforeActionCallback veto).
// Fixture: test/interaction.html.

type Log = Array<Record<string, unknown>>;

async function open(page: Page): Promise<void> {
  await load(page, 'interaction.html', { flag: 'ix' });
  await expect(page.locator('#subject .ProseMirror h1')).toHaveText('Hello');
}

const log = (page: Page) => page.evaluate(() => (window as any).ix.log as Log);
const clearLog = (page: Page) => page.evaluate(() => ((window as any).ix.log.length = 0));

const selectPlain = (page: Page) => selectText(page, 'plain');

test.describe('interaction model', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('ready: twin gets the detail with controller + element, non-enumerable', async ({ page }) => {
    const ready = (await log(page)).find((e) => e.kind === 'onReady');
    expect(ready).toEqual({ kind: 'onReady', keys: [], json: '{}', isElement: true, hasController: true });
  });

  test('controller is the public facade; the engine is not exposed', async ({ page }) => {
    const out = await page.evaluate(() => {
      const el = document.getElementById('subject') as any;
      const c = el.controller;
      const ran = c.runCommand((state: any, dispatch: any) => {
        dispatch(state.tr.insertText('!', state.doc.child(0).nodeSize - 1));
        return true;
      });
      return {
        hasEngine: 'engine' in el || 'engine' in c,
        isReady: el.isReady && !('isReady' in c),
        ran,
        markdown: c.getMarkdown(),
        boldEnabled: c.isCommandEnabled('bold'),
        keys: Object.keys(c).sort(),
      };
    });
    expect(out.hasEngine).toBe(false);
    expect(out.isReady).toBe(true);
    expect(out.ran).toBe(true);
    expect(out.markdown).toContain('# Hello!');
    expect(out.boldEnabled).toBe(true);
    expect(out.keys).toEqual(
      [
        'focus', 'getHTML', 'getJSON', 'getMarkdown', 'isCommandToggled',
        'isCommandEnabled', 'runCommand', 'setValue', 'value',
      ].sort()
    );
  });

  test('change: twin and DOM event share the detail { value, format } + context', async ({ page }) => {
    await page.locator('#subject .ProseMirror h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type('!');
    const d = await page.evaluate(() => {
      const c = (window as any).ix.lastChange;
      const el = document.getElementById('subject') as any;
      return { keys: Object.keys(c).sort(), value: c.value, format: c.format, ok: c.controller === el.controller && c.element === el };
    });
    expect(d.keys).toEqual(['format', 'value']);
    expect(d.value).toContain('# Hello!');
    expect(d.format).toBe('markdown');
    expect(d.ok).toBe(true);
  });

  test('toolbar click: command → onAction twin → action event (not composed); aria-pressed reflects', async ({ page }) => {
    await selectPlain(page);
    await clearLog(page);
    const bold = page.locator('#subject .we-toolbar-zone [data-action="bold"]');
    await expect(bold).toHaveAttribute('title', 'Bold (Ctrl+B)');
    await bold.click();
    await expect(page.locator('#subject .ProseMirror p strong')).toHaveText('plain');
    expect(await log(page)).toEqual([
      { kind: 'onAction', action: 'bold', id: undefined, source: 'toolbar' },
      { kind: 'action', action: 'bold', composed: false },
    ]);
    // The event is a notification after the fact: the command already ran.
    expect(await page.evaluate(() => (window as any).ix.strongAtEvent)).toBe(1);
    const shared = await page.evaluate(() => {
      const ix = (window as any).ix;
      const el = document.getElementById('subject') as any;
      const d = ix.lastEvent;
      return {
        same: d === ix.lastTwin,
        ctx: d.controller === el.controller && d.element === el,
        hasState: !!d.state,
        trigger: d.triggerElement?.dataset.action,
        enumerable: Object.keys(d).includes('controller') || Object.keys(d).includes('element'),
      };
    });
    expect(shared).toEqual({ same: true, ctx: true, hasState: true, trigger: 'bold', enumerable: false });
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
  });

  test('beforeActionCallback → false cancels (sync and async); undefined continues', async ({ page }) => {
    await selectPlain(page);
    await page.evaluate(() => {
      const el = document.getElementById('subject') as any;
      el.beforeActionCallback = (d: any) => {
        (window as any).ix.log.push({ kind: 'before', action: d.action, ctx: d.controller === el.controller });
        return false;
      };
    });
    await clearLog(page);
    const bold = page.locator('#subject .we-toolbar-zone [data-action="bold"]');
    await bold.click();
    await page.waitForTimeout(50);
    expect(await log(page)).toEqual([{ kind: 'before', action: 'bold', ctx: true }]);
    await expect(page.locator('#subject .ProseMirror p strong')).toHaveCount(0);

    await page.evaluate(() => {
      (document.getElementById('subject') as any).beforeActionCallback = async () => {
        await new Promise((r) => setTimeout(r, 10));
        return false;
      };
    });
    await bold.click();
    await page.waitForTimeout(50);
    await expect(page.locator('#subject .ProseMirror p strong')).toHaveCount(0);

    await page.evaluate(() => {
      (document.getElementById('subject') as any).beforeActionCallback = () => undefined;
    });
    await bold.click();
    await expect(page.locator('#subject .ProseMirror p strong')).toHaveText('plain');
  });

  test('custom item: onClick then action event, with id; render-time ctx carries controller', async ({ page }) => {
    await clearLog(page);
    const save = page.locator('#subject .we-group[data-group="ix"] [data-id="save"]');
    await expect(save).toHaveAttribute('data-action', 'custom');
    await save.click();
    await expect.poll(() => log(page)).toEqual([
      { kind: 'onClick', id: 'save', hasController: true },
      { kind: 'onAction', action: 'custom', id: 'save', source: 'toolbar' },
      { kind: 'action', action: 'custom', composed: false },
    ]);
    const ctx = await page.evaluate(() => {
      const ix = (window as any).ix;
      const el = document.getElementById('subject') as any;
      const check = (c: any) => ({ state: !!c.state, ctx: c.controller === el.controller && c.element === el, keys: Object.keys(c) });
      return { item: check(ix.ctx.item), command: check(ix.ctx.command), status: check(ix.ctx.status) };
    });
    for (const c of Object.values(ctx)) expect(c).toEqual({ state: true, ctx: true, keys: ['state'] });
    await expect(page.locator('#subject .we-status-item[data-status="ix"]')).toHaveText('IX');
  });

  test('context menu: items show shortcuts; activation reports source context-menu', async ({ page }) => {
    await page.locator('#subject .ProseMirror p').click({ button: 'right' });
    const menu = page.locator('#subject .we-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-action="bold"] .km-menu__shortcut')).toHaveText('Ctrl+B');
    await clearLog(page);
    await menu.locator('[data-action="insert-table"]').click();
    await expect(page.locator('#subject .ProseMirror table')).toHaveCount(1);
    expect((await log(page))[0]).toEqual({ kind: 'onAction', action: 'insert-table', id: undefined, source: 'context-menu' });
    await expect(menu).toBeHidden();
  });

  test('selection toolbar reports source selection-toolbar', async ({ page }) => {
    await selectPlain(page);
    const bar = page.locator('#subject .we-selection-toolbar');
    await expect(bar).toBeVisible();
    await clearLog(page);
    await bar.locator('[data-action="italic"]').click();
    await expect(page.locator('#subject .ProseMirror p em')).toHaveText('plain');
    expect((await log(page))[0]).toEqual({ kind: 'onAction', action: 'italic', id: undefined, source: 'selection-toolbar' });
  });

  test('keyboard shortcuts run the command directly — no action event', async ({ page }) => {
    await selectPlain(page);
    await clearLog(page);
    await page.keyboard.press('Control+b');
    await expect(page.locator('#subject .ProseMirror p strong')).toHaveText('plain');
    expect((await log(page)).filter((e) => e.kind === 'onAction' || e.kind === 'action')).toEqual([]);
  });

  test('interactionHost.request(ctx) carries request + signal + context; lock-change brackets the run', async ({ page }) => {
    await clearLog(page);
    await page.locator('#subject .we-toolbar-zone [data-action="image:browser:pick"]').click();
    await expect(page.locator('#subject .ProseMirror img[src^="data:"]')).toHaveCount(1);
    await expect.poll(async () => (await log(page)).filter((e) => e.kind === 'lock')).toEqual([
      { kind: 'lock', isLocked: true },
      { kind: 'lock', isLocked: false },
    ]);
    const req = await page.evaluate(() => {
      const r = (window as any).ix.ctx.request;
      const el = document.getElementById('subject') as any;
      return { kind: r.kind, signal: r.signal instanceof AbortSignal, ctx: r.controller === el.controller && r.element === el };
    });
    expect(req).toEqual({ kind: 'cloud-picker', signal: true, ctx: true });
  });
});
