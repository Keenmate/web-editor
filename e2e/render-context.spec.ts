import { test, expect, load, pm, type Page } from './fixtures';

// Render-callback ctx (the web-treeview / web-multiselect shape): every editor callback ctx carries `labels`
// (core createLabelsView), `isReadonly` and `isDisabled` (the effective state), and a change of one of them
// re-runs the rendered callbacks IN PLACE — no engine rebuild: same surface, document, selection, undo history.
// Fixture: test/render-context.html.

async function open(page: Page): Promise<void> {
  await load(page, 'render-context.html', { flag: 'fixtureReady' });
}

/** What each callback last showed: `<buttons.ok>|<isReadonly>|<isDisabled>`. */
const outputs = (page: Page) =>
  page.evaluate(() => {
    const el = document.getElementById('subject') as any;
    const root = el.shadowRoot as ShadowRoot;
    const rc = (window as any).rc;
    return {
      status: root.querySelector('[data-status="rc"]')?.textContent ?? null,
      item: root.querySelector('[data-id="rc-item"]')?.textContent?.trim() ?? null,
      command: rc.command as string,
      format: (el.querySelector('input[type="hidden"]') as HTMLInputElement | null)?.value ?? null,
      styles: rc.styles as string,
    };
  });

/** Settle a write: the element's flush, then the next frame. */
const set = (page: Page, write: string) =>
  page.evaluate(async (w) => {
    const el = document.getElementById('subject') as any;
    new Function('el', w)(el);
    await el.whenSettled();
  }, write);

/** Tags the live surface so a rebuild (a fresh ProseMirror DOM) would show. */
const tagSurface = (page: Page) =>
  page.evaluate(() => (((document.getElementById('subject') as any).shadowRoot.querySelector('.ProseMirror') as any).__rcTag = 1));
const isSameSurface = (page: Page) =>
  page.evaluate(() => ((document.getElementById('subject') as any).shadowRoot.querySelector('.ProseMirror') as any).__rcTag === 1);

test.describe('render-callback ctx: labels / isReadonly / isDisabled', () => {
  test.beforeEach(async ({ page }) => open(page));

  test('every callback ctx carries labels, isReadonly, isDisabled (non-enumerable)', async ({ page }) => {
    const out = await outputs(page);
    expect(out.status).toBe('status:OK|false|false');
    expect(out.item).toBe('item:OK|false|false');
    expect(out.command).toBe('OK|false|false');
    expect(out.format).toBe('format:OK|false|false:Some plain text here.');
    expect(out.styles).toBe('OK|false|false');
    // Non-enumerable, like controller / element / label: the action detail's JSON stays data only.
    const keys = await page.evaluate(async () => {
      const el = document.getElementById('subject') as any;
      const fired = new Promise<any>((resolve) => el.addEventListener('action', (e: CustomEvent) => resolve(e.detail), { once: true }));
      (el.shadowRoot.querySelector('[data-id="rc-item"]') as HTMLElement).click();
      const detail = await fired;
      return { keys: Object.keys(detail), has: 'labels' in detail && 'isReadonly' in detail && 'isDisabled' in detail };
    });
    expect(keys.keys).not.toContain('labels');
    expect(keys.keys).not.toContain('isReadonly');
    expect(keys.has).toBe(true);
  });

  test('labels / readonly / disabled / page-wide locale re-run the callbacks in place — document, selection, undo kept', async ({ page }) => {
    await pm(page).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' More');
    await tagSurface(page);

    await set(page, `el.labels = { 'buttons.ok': 'Dobře' }`);
    let out = await outputs(page);
    expect(out.status).toBe('status:Dobře|false|false');
    expect(out.item).toBe('item:Dobře|false|false');
    expect(out.command).toBe('Dobře|false|false');
    expect(out.format).toBe('format:Dobře|false|false:Some plain text here. More');
    expect(out.styles).toBe('Dobře|false|false');

    await set(page, `el.isReadonly = true`);
    out = await outputs(page);
    expect(out.status).toBe('status:Dobře|true|false');
    expect(out.item).toBe('item:Dobře|true|false');
    expect(out.format).toBe('format:Dobře|true|false:Some plain text here. More');
    expect(out.styles).toBe('Dobře|true|false');

    await set(page, `el.isReadonly = false; el.viewMode = 'preview'`);
    expect((await outputs(page)).status).toBe('status:Dobře|true|false');
    await set(page, `el.viewMode = 'edit'`);

    await set(page, `el.isDisabled = true`);
    out = await outputs(page);
    expect(out.status).toBe('status:Dobře|false|true');
    expect(out.format).toBe('format:Dobře|false|true:Some plain text here. More');
    expect(out.styles).toBe('Dobře|false|true');

    // A disabled <fieldset> is the effective disabled state too.
    await set(page, `el.isDisabled = false; document.getElementById('fs').disabled = true`);
    await expect.poll(async () => (await outputs(page)).status).toBe('status:Dobře|false|true');
    await set(page, `document.getElementById('fs').disabled = false`);
    await expect.poll(async () => (await outputs(page)).status).toBe('status:Dobře|false|false');

    // The page-wide locale: ctx.labels reads the page dictionary (instance labels cleared first).
    await set(page, `el.labels = null`);
    await page.evaluate(async () => {
      (window as any).components.locale = { labels: { 'km-editor.buttons.ok': 'Bien' } };
      await (document.getElementById('subject') as any).whenSettled();
    });
    await expect.poll(async () => (await outputs(page)).status).toBe('status:Bien|false|false');
    out = await outputs(page);
    expect(out.item).toBe('item:Bien|false|false');
    expect(out.format).toBe('format:Bien|false|false:Some plain text here. More');
    expect(out.styles).toBe('Bien|false|false');

    // In place: the same surface, the document, and its undo history.
    expect(await isSameSurface(page)).toBe(true);
    await pm(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(pm(page)).toHaveText('Some plain text here.');
  });

  test('an unrelated input change runs no element-level callback', async ({ page }) => {
    const before = await page.evaluate(() => ({ ...(window as any).rc.calls }));
    await set(page, `el.anchor = '#nowhere'`);
    const after = await page.evaluate(() => ({ ...(window as any).rc.calls }));
    expect(after.format).toBe(before.format);
    expect(after.styles).toBe(before.styles);
  });
});
