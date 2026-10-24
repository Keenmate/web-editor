import { test, expect, load, pm, markdown, selectText, caretAfter, toolbarButton, call } from './fixtures';

// Links: Mod-k / toolbar prompt → a[href]; markdown `[t](u "title")`; toggle off;
// cancel; disabled on an empty selection (ED-5, ED-7).
// Fixture: test/links.html (value "some link text").

test.describe('links', () => {
    test.beforeEach(async ({ page }) => load(page, 'links.html', { flag: 'fixtureReady' }));

    test('toolbar button prompts for the URL and links the selection', async ({ page, dialogs }) => {
        await selectText(page, 'link');
        dialogs.answer('https://example.com/');
        await toolbarButton(page, 'insert-link').click();
        await expect(pm(page).locator('a')).toHaveText('link');
        await expect(pm(page).locator('a')).toHaveAttribute('href', 'https://example.com/');
        expect(dialogs.seen).toEqual([{ type: 'prompt', message: 'Enter link URL:', defaultValue: 'https://' }]);
        expect(await markdown(page)).toBe('some [link](https://example.com/) text');
        await expect(toolbarButton(page, 'insert-link')).toHaveAttribute('aria-pressed', 'true');
    });

    test('Mod-k prompts; Mod-k on a linked selection removes the link', async ({ page, dialogs }) => {
        await selectText(page, 'link');
        dialogs.answer('https://a.test/');
        await page.keyboard.press('Control+k');
        await expect(pm(page).locator('a')).toHaveAttribute('href', 'https://a.test/');
        await selectText(page, 'link');
        await page.keyboard.press('Control+k');
        await expect(pm(page).locator('a')).toHaveCount(0);
        expect(dialogs.seen).toHaveLength(1); // removal does not prompt
        expect(await markdown(page)).toBe('some link text');
    });

    test('cancelling the prompt inserts nothing', async ({ page, dialogs }) => {
        await selectText(page, 'link');
        dialogs.answer(null);
        await toolbarButton(page, 'insert-link').click();
        expect(dialogs.seen).toHaveLength(1);
        await expect(pm(page).locator('a')).toHaveCount(0);
    });

    test('markdown with a title round-trips', async ({ page }) => {
        await call(page, 'setValue', ['see [docs](https://d.test/x "The docs") now']);
        await expect(pm(page).locator('a')).toHaveAttribute('title', 'The docs');
        expect(await markdown(page)).toBe('see [docs](https://d.test/x "The docs") now');
        expect(await call(page, 'getHTML')).toContain('<a href="https://d.test/x" title="The docs">docs</a>');
    });

    test('toolbar button is disabled on an empty selection', async ({ page }) => {
        await caretAfter(page, 'link');
        await expect(toolbarButton(page, 'insert-link')).toBeDisabled();
        await selectText(page, 'link');
        await expect(toolbarButton(page, 'insert-link')).toBeEnabled();
    });

    test('Mod-k on an empty selection does nothing (no blocking alert)', async ({ page, dialogs }) => {
        test.fail(true, 'NOTES.md ED-5');
        await caretAfter(page, 'link');
        await page.keyboard.press('Control+k');
        await page.waitForTimeout(100);
        expect(dialogs.seen).toEqual([]);
    });

    test('a created link and a parsed link have the same JSON (title null)', async ({ page, dialogs }) => {
        test.fail(true, 'NOTES.md ED-7');
        await selectText(page, 'link');
        dialogs.answer('https://e.test/');
        await page.keyboard.press('Control+k');
        await expect(pm(page).locator('a')).toHaveCount(1);
        const created = await call<any>(page, 'getJSON');
        await call(page, 'setValue', [await markdown(page)]);
        const parsed = await call<any>(page, 'getJSON');
        expect(created).toEqual(parsed);
    });
});
