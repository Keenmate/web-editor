import { test, expect, load, pm, call, caretAfter, toolbarButton, type Page } from './fixtures';

// Tables: insert (toolbar + context menu), Tab cell navigation, row/column ops via
// runCommand, merge / header toggles, html + json round-trip, markdown fallback.
// Fixture: test/tables.html (value "Intro").

const run = (page: Page, name: string) =>
    page.evaluate((n) => (document.getElementById('subject') as any).controller.runCommand(n), name);

const GRID = '<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';

/** Cell texts as rows of strings. */
const cells = (page: Page) =>
    pm(page).locator('table tr').evaluateAll((rows) =>
        rows.map((r) => [...r.querySelectorAll('th, td')].map((c) => `${c.tagName.toLowerCase()}:${c.textContent}`))
    );

test.describe('tables', () => {
    test.beforeEach(async ({ page }) => load(page, 'tables.html', { flag: 'fixtureReady' }));

    test('toolbar inserts a 3x3 table with a header row', async ({ page }) => {
        await caretAfter(page, 'Intro');
        await toolbarButton(page, 'insert-table').click();
        await expect(pm(page).locator('table tr')).toHaveCount(3);
        await expect(pm(page).locator('table tr').first().locator('th')).toHaveCount(3);
        await expect(pm(page).locator('table td')).toHaveCount(6);
    });

    test('context menu inserts a table', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await page.locator('km-editor#subject .we-context-menu [data-action="insert-table"]').click();
        await expect(pm(page).locator('table')).toHaveCount(1);
    });

    test('Tab / Shift-Tab move between cells; typing lands in the cell', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        await caretAfter(page, 'H1');
        await page.keyboard.press('Tab');
        await page.keyboard.type('x');
        await page.keyboard.press('Tab');
        await page.keyboard.type('y');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.type('z');
        // Tab / Shift-Tab select the target cell's content, so typing replaces it.
        expect(await cells(page)).toEqual([['th:H1', 'th:z'], ['td:y', 'td:b']]);
    });

    test('row and column commands', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        await caretAfter(page, 'a');
        expect(await run(page, 'add-row-after')).toBe(true);
        expect(await cells(page)).toEqual([['th:H1', 'th:H2'], ['td:a', 'td:b'], ['td:', 'td:']]);
        await caretAfter(page, 'a');
        await run(page, 'add-column-before');
        expect((await cells(page))[1]).toEqual(['td:', 'td:a', 'td:b']);
        await caretAfter(page, 'a');
        await run(page, 'delete-column');
        expect((await cells(page))[1]).toEqual(['td:', 'td:b']);
        await caretAfter(page, 'b');
        await run(page, 'delete-row');
        expect(await cells(page)).toEqual([['th:', 'th:H2'], ['td:', 'td:']]);
        await caretAfter(page, 'H2');
        await run(page, 'add-row-before');
        await expect(pm(page).locator('table tr')).toHaveCount(3);
        await caretAfter(page, 'H2');
        await run(page, 'delete-table');
        await expect(pm(page).locator('table')).toHaveCount(0);
    });

    test('toggle-header-row / toggle-header-column', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        await caretAfter(page, 'H1');
        await run(page, 'toggle-header-row');
        expect(await cells(page)).toEqual([['td:H1', 'td:H2'], ['td:a', 'td:b']]);
        await caretAfter(page, 'a');
        await run(page, 'toggle-header-column');
        expect(await cells(page)).toEqual([['th:H1', 'td:H2'], ['th:a', 'td:b']]);
    });

    test('merge-cells over a cell selection, split-cell undoes it', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        // Drag-select from cell "a" to cell "b" → CellSelection.
        const a = pm(page).locator('td', { hasText: 'a' });
        const b = pm(page).locator('td', { hasText: 'b' });
        await a.hover();
        await page.mouse.down();
        await b.hover();
        await page.mouse.up();
        expect(await run(page, 'merge-cells')).toBe(true);
        await expect(pm(page).locator('td[colspan="2"]')).toHaveCount(1);
        expect(await call(page, 'getHTML')).toContain('colspan="2"');
        await caretAfter(page, 'a');
        expect(await run(page, 'split-cell')).toBe(true);
        await expect(pm(page).locator('td[colspan]')).toHaveCount(0);
        await expect(pm(page).locator('tr').nth(1).locator('td')).toHaveCount(2);
    });

    test('html and json round-trip a table losslessly', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        const html = await call<string>(page, 'getHTML');
        const json = await call(page, 'getJSON');
        await call(page, 'setValue', ['x']);
        await call(page, 'setValue', [JSON.stringify(json), 'json']);
        expect(await call(page, 'getHTML')).toBe(html);
        await call(page, 'setValue', [html, 'html']);
        expect(await call(page, 'getJSON')).toEqual(json);
    });

    test('markdown export writes the table as raw HTML', async ({ page }) => {
        await call(page, 'setValue', [GRID, 'html']);
        const md = await call<string>(page, 'getMarkdown');
        expect(md).toContain('<table>');
        expect(md).toContain('H1');
    });
});
