import { test, expect, load, editor } from './fixtures';

// Logging: silent by default; enabling via the global API (window.components)
// makes the EDITOR:* categories log. Fixture: test/logging.html.

test.describe('logging', () => {
    test('silent by default — no console output from the editor while it builds', async ({ page }) => {
        const lines: string[] = [];
        page.on('console', (m) => lines.push(`${m.type()}: ${m.text()}`));
        await load(page, 'logging.html', { flag: 'fixtureReady' });
        await editor(page).evaluate((el: any) => (el.value = '# again')); // a rebuild
        await page.waitForTimeout(50);
        expect(lines.filter((l) => /EDITOR|km-editor/.test(l))).toEqual([]);
    });

    test('global logging controls enable the categories', async ({ page }) => {
        const lines: string[] = [];
        page.on('console', (m) => lines.push(m.text()));
        await load(page, 'logging.html', { flag: 'fixtureReady' });
        const cats = await page.evaluate(() => {
            const g = (window as any).components['km-editor'].logging;
            g.enableLogging();
            return Object.keys(g);
        });
        expect(cats).toEqual(expect.arrayContaining(['enableLogging', 'disableLogging']));
        // The INIT category logs every engine build — trigger one.
        await editor(page).evaluate((el: any) => (el.value = '# rebuilt'));
        await expect.poll(() => lines.filter((l) => l.includes('engine built'))).toHaveLength(1);
        expect(lines.find((l) => l.includes('engine built'))).toMatch(/EDITOR:INIT/);
        // …and disabling silences it again.
        await page.evaluate(() => (window as any).components['km-editor'].logging.disableLogging());
        await editor(page).evaluate((el: any) => (el.value = '# quiet'));
        await page.waitForTimeout(50);
        expect(lines.filter((l) => l.includes('engine built'))).toHaveLength(1);
    });
});
