import { test, expect, load, pm, call, markdown, html, logLines, clearLog, selectText, type Page } from './fixtures';

// Lifecycle (decision D1): core's build-once + activate/deactivate model — a DOM
// move keeps content (incl. tables), undo history and selection; `plugins`
// reassignment keeps content; setValue before connect is honoured; a `format`
// change while detached is applied correctly; `ready` fires once; destroy().
// Fixture: test/lifecycle.html.

const TABLE_HTML =
    '<p>Before</p><table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table><p>After</p>';

const move = (page: Page, to = 'b') => page.evaluate((t) => (window as any).move(t), to);

/** The PM selection of #subject as `[from, to]`. */
const selection = (page: Page) =>
    page.evaluate(() => {
        let out: [number, number] = [-1, -1];
        (document.getElementById('subject') as any).controller.runCommand((state: any) => {
            out = [state.selection.from, state.selection.to];
            return true;
        });
        return out;
    });

test.describe('lifecycle', () => {
    test.beforeEach(async ({ page }) => load(page, 'lifecycle.html', { flag: 'lifecycleReady' }));

    test('DOM move keeps the content, including tables (ED-1)', async ({ page }) => {
        await call(page, 'setValue', [TABLE_HTML, 'html']);
        await expect(pm(page).locator('table')).toHaveCount(1);
        const before = await html(page);
        await move(page);
        await expect(page.locator('#b > km-editor#subject')).toHaveCount(1);
        await expect(pm(page).locator('table td')).toHaveText(['a', 'b']);
        expect(await html(page)).toBe(before);
        // Move back and forth again — still intact.
        await move(page, 'a');
        await move(page, 'b');
        expect(await html(page)).toBe(before);
    });

    test('content is readable while detached (getValue on a removed editor)', async ({ page }) => {
        await call(page, 'setValue', [TABLE_HTML, 'html']);
        const out = await page.evaluate(() => {
            const el = document.getElementById('subject') as any;
            el.remove();
            return { html: el.getHTML(), md: el.getValue() };
        });
        expect(out.html).toContain('<table>');
        expect(out.md).toContain('Before');
    });

    test('DOM move keeps undo history and selection (ED-2)', async ({ page }) => {
        await pm(page).locator('p').click();
        await page.keyboard.press('End');
        await page.keyboard.type(' typed');
        expect(await markdown(page)).toBe('# Hello\n\nFirst paragraph. typed');
        await selectText(page, 'First');
        const sel = await selection(page);
        expect(sel[1] - sel[0]).toBe('First'.length);

        await move(page);
        expect(await selection(page)).toEqual(sel);
        await expect(page.locator('km-editor#subject .we-toolbar-zone [data-action="undo"]')).toBeEnabled();
        await page.evaluate(() => (document.getElementById('subject') as any).controller.runCommand('undo'));
        expect(await markdown(page)).toBe('# Hello\n\nFirst paragraph.');
        // The surface still edits after the move.
        await pm(page).locator('h1').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page)).toBe('# Hello!\n\nFirst paragraph.');
    });

    test('`plugins` reassignment preserves content, including tables (ED-1)', async ({ page }) => {
        await call(page, 'setValue', [TABLE_HTML, 'html']);
        const before = await html(page);
        await page.evaluate(() => {
            const el = document.getElementById('subject') as any;
            el.plugins = [...(window as any).defaultPlugins()];
        });
        await expect(pm(page).locator('table td')).toHaveText(['a', 'b']);
        expect(await html(page)).toBe(before);
    });

    test('setValue() before the first connect is honoured (ED-3)', async ({ page }) => {
        const out = await page.evaluate(async () => {
            const plain = document.createElement('km-editor') as any;
            plain.id = 'pre1';
            plain.setValue('# Pre-set\n\nbody');
            document.body.appendChild(plain);

            // setValue wins over a `value` attribute set before it…
            const withAttr = document.createElement('km-editor') as any;
            withAttr.id = 'pre2';
            withAttr.setAttribute('value', '# From attribute');
            withAttr.setValue('<h2>From setValue</h2>', 'html');
            document.body.appendChild(withAttr);

            // …and a `value` assigned after setValue wins over it.
            const later = document.createElement('km-editor') as any;
            later.id = 'pre3';
            later.setValue('# Early');
            later.value = '# Late';
            document.body.appendChild(later);

            await Promise.all([plain, withAttr, later].map((e) => e.whenSettled()));
            return [plain.getMarkdown(), withAttr.getMarkdown(), later.getMarkdown()];
        });
        expect(out).toEqual(['# Pre-set\n\nbody', '## From setValue', '# Late']);
        await expect(pm(page, 'pre1').locator('h1')).toHaveText('Pre-set');
    });

    test('`format` changed while detached is applied on reconnect (ED-4)', async ({ page }) => {
        await call(page, 'setValue', ['# Title\n\ntext **b**']);
        await page.evaluate(() => {
            const el = document.getElementById('subject') as any;
            el.remove();
            el.format = 'html';
            document.getElementById('b')!.appendChild(el);
        });
        await expect(pm(page).locator('h1')).toHaveText('Title');
        await expect(pm(page).locator('strong')).toHaveText('b');
        expect(await call(page, 'getValue')).toBe('<h1>Title</h1><p>text <strong>b</strong></p>');
    });

    test('`ready` fires once across moves, value and plugins reassignment', async ({ page }) => {
        const count = await page.evaluate(async () => {
            const el = document.createElement('km-editor') as any;
            el.id = 'fresh';
            let ready = 0;
            el.addEventListener('ready', () => ready++);
            el.value = '# One';
            document.getElementById('a')!.appendChild(el);
            await el.whenSettled();
            document.getElementById('b')!.appendChild(el);
            el.value = '# Two';
            await el.whenSettled();
            el.plugins = [...(window as any).defaultPlugins()];
            document.getElementById('a')!.appendChild(el);
            await el.whenSettled();
            return { ready, isReady: el.isReady, md: el.getMarkdown() };
        });
        expect(count).toEqual({ ready: 1, isReady: true, md: '# Two' });
    });

    test('a move does not fire change', async ({ page }) => {
        await clearLog(page, 'lifecycle');
        await move(page);
        await move(page, 'a');
        await page.waitForTimeout(50);
        expect(await logLines(page, 'lifecycle')).toEqual([]);
    });

    test('a detached editor releases its document listeners; reconnect restores them', async ({ page }) => {
        const cdp = await page.context().newCDPSession(page);
        const count = async () => {
            const { result } = await cdp.send('Runtime.evaluate', { expression: 'document' });
            const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId! });
            return listeners.filter((l) => l.type === 'selectionchange').length;
        };
        const attached = await count();
        expect(attached).toBeGreaterThan(0);
        await page.evaluate(() => {
            const el = document.getElementById('subject') as any;
            (window as any).held = el;
            el.remove();
        });
        expect(await count()).toBe(attached - 1);
        // A content change while detached must not re-attach it.
        await page.evaluate(() => (window as any).held.setValue('# Changed while detached'));
        expect(await count()).toBe(attached - 1);
        await page.evaluate(() => document.getElementById('b')!.appendChild((window as any).held));
        expect(await count()).toBe(attached);
        await expect(pm(page).locator('h1')).toHaveText('Changed while detached');
        await pm(page).locator('h1').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page)).toBe('# Changed while detached!');
        await cdp.detach();
    });

    test('destroy() removes the editor surface', async ({ page }) => {
        await call(page, 'destroy');
        await expect(page.locator('km-editor#subject .ProseMirror')).toHaveCount(0);
        expect(await call(page, 'getValue')).toBe('');
    });
});
