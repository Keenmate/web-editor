import { test, expect, load, pm, markdown, caretAfter, toolbarButton } from './fixtures';

// Lists: bullet / ordered wrap, Enter splits, Tab / Shift-Tab nest, markdown.
// Fixture: test/lists.html (value "alpha").

test.describe('lists', () => {
    test.beforeEach(async ({ page }) => load(page, 'lists.html', { flag: 'fixtureReady' }));

    test('bullet-list wraps the paragraph; markdown "- "; button active', async ({ page }) => {
        await caretAfter(page, 'alpha');
        await toolbarButton(page, 'bullet-list').click();
        await expect(pm(page).locator('ul > li')).toHaveText(['alpha']);
        await expect(toolbarButton(page, 'bullet-list')).toHaveAttribute('aria-pressed', 'true');
        expect(await markdown(page)).toBe('- alpha');
    });

    test('ordered-list wraps the paragraph; markdown "1. "', async ({ page }) => {
        await caretAfter(page, 'alpha');
        await toolbarButton(page, 'ordered-list').click();
        await expect(pm(page).locator('ol > li')).toHaveText(['alpha']);
        await expect(toolbarButton(page, 'ordered-list')).toHaveAttribute('aria-pressed', 'true');
        expect(await markdown(page)).toBe('1. alpha');
    });

    test('Enter splits the item; Enter on an empty item leaves the list', async ({ page }) => {
        await caretAfter(page, 'alpha');
        await toolbarButton(page, 'bullet-list').click();
        await caretAfter(page, 'alpha');
        await page.keyboard.press('Enter');
        await page.keyboard.type('beta');
        await expect(pm(page).locator('ul > li')).toHaveText(['alpha', 'beta']);
        expect(await markdown(page)).toBe('- alpha\n\n- beta');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.keyboard.type('after');
        await expect(pm(page).locator('ul > li')).toHaveCount(2);
        await expect(pm(page).locator(':scope > p')).toHaveText('after');
    });

    test('Tab nests the item, Shift-Tab lifts it back', async ({ page }) => {
        await page.evaluate(() => (document.getElementById('subject') as any).setValue('- one\n- two'));
        await caretAfter(page, 'two');
        await page.keyboard.press('Tab');
        await expect(pm(page).locator('ul > li > ul > li')).toHaveText(['two']);
        expect(await markdown(page)).toBe('- one\n\n  - two');
        await page.keyboard.press('Shift+Tab');
        await expect(pm(page).locator('ul ul')).toHaveCount(0);
        await expect(pm(page).locator('ul > li')).toHaveText(['one', 'two']);
    });

    test('Tab on the first item cannot nest', async ({ page }) => {
        await page.evaluate(() => (document.getElementById('subject') as any).setValue('- one\n- two'));
        await caretAfter(page, 'one');
        await page.keyboard.press('Tab');
        await expect(pm(page).locator('ul ul')).toHaveCount(0);
        await expect(pm(page).locator('ul > li')).toHaveText(['one', 'two']);
    });

    test('ordered list markdown round-trips', async ({ page }) => {
        await page.evaluate(() => (document.getElementById('subject') as any).setValue('1. a\n2. b\n3. c'));
        await expect(pm(page).locator('ol > li')).toHaveText(['a', 'b', 'c']);
        expect(await markdown(page)).toBe('1. a\n\n2. b\n\n3. c');
    });
});
