import { test, expect, load, pm, call, markdown, selectText, toolbarButton, type Page } from './fixtures';

// Plugins: a custom mark plugin (toolbar button, keymap, md / html serialization,
// status item); `plugins = []` drops link / image / table; removeToolbarGroups;
// the serializer contract throws at assembly. Fixture: test/plugins.html.

const groups = (page: Page, id: string) =>
    page
        .locator(`km-editor#${id} .we-toolbar-zone .we-group`)
        .evaluateAll((gs) => gs.map((g) => (g as HTMLElement).dataset.group));

test.describe('plugins', () => {
    test.beforeEach(async ({ page }) => load(page, 'plugins.html', { flag: 'fixtureReady' }));

    test('custom plugin: toolbar button applies the mark; md / html / json serialize it', async ({ page }) => {
        await selectText(page, 'plain', 'custom');
        const btn = toolbarButton(page, 'highlight', 'custom');
        await expect(btn).toHaveText(/HL/);
        await btn.click();
        await expect(pm(page, 'custom').locator('mark')).toHaveText('plain');
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        expect(await markdown(page, 'custom')).toBe('some ==plain== text');
        expect(await call(page, 'getHTML', [], 'custom')).toBe('<p>some <mark>plain</mark> text</p>');
        const json = await call<any>(page, 'getJSON', [], 'custom');
        expect(json.content[0].content[1]).toEqual({ type: 'text', marks: [{ type: 'highlight' }], text: 'plain' });
        // HTML round-trips through parseDOM.
        await call(page, 'setValue', ['<p><mark>x</mark></p>', 'html'], 'custom');
        await expect(pm(page, 'custom').locator('mark')).toHaveText('x');
    });

    test('custom plugin: its keybinding fires the command', async ({ page }) => {
        await selectText(page, 'text', 'custom');
        await page.keyboard.press('Control+Shift+h');
        await expect(pm(page, 'custom').locator('mark')).toHaveText('text');
    });

    test('custom plugin: its status item renders live', async ({ page }) => {
        const hl = page.locator('km-editor#custom .we-status-item[data-status="hl"]');
        await expect(hl).toHaveText('HL: 15');
        await call(page, 'setValue', ['abc'], 'custom');
        await expect(hl).toHaveText('HL: 3');
    });

    test('custom group slots after the core leading groups, before history', async ({ page }) => {
        const g = await groups(page, 'custom');
        expect(g.indexOf('highlight')).toBeGreaterThan(g.indexOf('table'));
        expect(g.at(-1)).toBe('history');
    });

    test('plugins = [] drops link / image / table (toolbar, commands, menu)', async ({ page }) => {
        expect(await groups(page, 'bare')).toEqual(['format', 'block', 'list', 'insert', 'history']);
        const enabled = await page.evaluate(() => {
            const c = (document.getElementById('bare') as any).controller;
            return ['insert-link', 'insert-image', 'insert-table', 'bold'].map((n) => c.runCommand(n));
        });
        expect(enabled).toEqual([false, false, false, true]);
        await pm(page, 'bare').locator('p').click({ button: 'right' });
        const menu = page.locator('km-editor#bare .we-context-menu');
        await expect(menu).toBeVisible();
        await expect(menu.locator('[data-action="insert-table"]')).toHaveCount(0);
        await expect(menu.locator('[data-action="insert-link"]')).toHaveCount(0);
        // Content with a table degrades on import (no table node in the schema).
        await call(page, 'setValue', ['<table><tr><td><p>cell</p></td></tr></table>', 'html'], 'bare');
        await expect(pm(page, 'bare').locator('table')).toHaveCount(0);
        await expect(pm(page, 'bare')).toContainText('cell');
    });

    test('the plugins getter returns the active set', async ({ page }) => {
        const names = await page.evaluate(() => ({
            custom: (document.getElementById('custom') as any).plugins.map((p: any) => p.name),
            bare: (document.getElementById('bare') as any).plugins.length,
        }));
        expect(names.custom).toEqual(['link', 'image', 'tables', 'code-highlight', 'highlight']);
        expect(names.bare).toBe(0);
    });

    test('removeToolbarGroups drops a core group', async ({ page }) => {
        const g = await groups(page, 'removed');
        expect(g).not.toContain('list');
        expect(g).toContain('format');
    });

    test('a plugin node without a markdown serializer throws at assembly', async ({ page }) => {
        const msg = await page.evaluate(() => {
            const w = window as any;
            const bad = w.definePlugin({
                name: 'bad',
                nodes: { widget: { group: 'block', atom: true, toDOM: () => ['div', { class: 'w' }], parseDOM: [{ tag: 'div.w' }] } },
            });
            try {
                (document.getElementById('bare') as any).plugins = [bad];
                return 'no throw';
            } catch (e) {
                return String((e as Error).message);
            }
        });
        expect(msg).toMatch(/widget/);
    });

    test('a plugin set that fails to assemble leaves the editor (and its content) intact', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            const bad = w.definePlugin({ name: 'bad', nodes: { widget: { group: 'block', atom: true, toDOM: () => ['div'] } } });
            try {
                (document.getElementById('bare') as any).plugins = [bad];
            } catch {
                /* expected */
            }
        });
        expect(await markdown(page, 'bare')).toBe('core only');
        await expect(pm(page, 'bare')).toHaveText('core only');
        // Still the previous engine: one surface, the running (empty) plugin set.
        await expect(page.locator('km-editor#bare .ProseMirror')).toHaveCount(1);
        expect(await page.evaluate(() => (document.getElementById('bare') as any).plugins.length)).toBe(0);
    });

    test('a failed plugin swap keeps the live engine (undo history) and a throwing setup() leaves no surface behind', async ({ page }) => {
        await pm(page, 'bare').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page, 'bare')).toBe('core only!');
        const msg = await page.evaluate(() => {
            const w = window as any;
            const bad = w.definePlugin({ name: 'bad-setup', setup: () => { throw new Error('setup boom'); } });
            try {
                (document.getElementById('bare') as any).plugins = [bad];
                return 'no throw';
            } catch (e) {
                return String((e as Error).message);
            }
        });
        expect(msg).toBe('setup boom');
        await expect(page.locator('km-editor#bare .ProseMirror')).toHaveCount(1);
        await pm(page, 'bare').click();
        await page.keyboard.press('ControlOrMeta+z');
        expect(await markdown(page, 'bare')).toBe('core only');
    });
});
