import { test, expect, load, editor, pm, call, selectText, caretAfter, type Page } from './fixtures';

// Selection toolbar: appears on a non-empty text selection near it, hides on a
// collapsed caret, inside a code block, and in read-only; its items run commands.
// Fixture: test/selection-toolbar.html (value "# Title\n\nplain words here").

const bar = (page: Page) => page.locator('km-editor#subject .we-selection-toolbar');

test.describe('selection toolbar', () => {
    test.beforeEach(async ({ page }) => load(page, 'selection-toolbar.html', { flag: 'fixtureReady' }));

    test('hidden with a collapsed caret; shown for a text selection', async ({ page }) => {
        await caretAfter(page, 'plain');
        await expect(bar(page)).toBeHidden();
        await selectText(page, 'words');
        await expect(bar(page)).toBeVisible();
        await caretAfter(page, 'plain');
        await expect(bar(page)).toBeHidden();
    });

    test('a mouse selection (double-click a word) shows it near the selection', async ({ page }) => {
        await pm(page).locator('p').dblclick();
        await expect(bar(page)).toBeVisible();
        const [b, p] = await Promise.all([bar(page).boundingBox(), pm(page).locator('p').boundingBox()]);
        // Floats just above or below the paragraph line.
        expect(Math.min(Math.abs(b!.y + b!.height - p!.y), Math.abs(b!.y - (p!.y + p!.height)))).toBeLessThan(40);
    });

    test('items run their command and the bar stays for further formatting', async ({ page }) => {
        await selectText(page, 'words');
        await bar(page).locator('[data-action="bold"]').click();
        await expect(pm(page).locator('p strong')).toHaveText('words');
        await expect(bar(page).locator('[data-action="bold"]')).toHaveAttribute('aria-pressed', 'true');
    });

    test('hidden inside a code block', async ({ page }) => {
        await call(page, 'setValue', ['```js\nconst x = 1;\n```']);
        await selectText(page, 'const');
        await expect(bar(page)).toBeHidden();
    });

    test('hidden in read-only and in preview', async ({ page }) => {
        await selectText(page, 'words');
        await expect(bar(page)).toBeVisible();
        await editor(page).evaluate((el) => el.setAttribute('readonly', ''));
        await expect(bar(page)).toBeHidden();
        await editor(page).evaluate((el) => el.removeAttribute('readonly'));
        await editor(page).evaluate((el: any) => (el.viewMode = 'preview'));
        await selectText(page, 'plain');
        await expect(bar(page)).toBeHidden();
    });

    test('a DOM move re-shows the bar for the kept selection', async ({ page }) => {
        await selectText(page, 'words');
        await expect(bar(page)).toBeVisible();
        const isOpen = () =>
            page.evaluate(() => {
                const el = (window as any).held ?? document.getElementById('subject');
                const p = el.shadowRoot.querySelector('.we-selection-toolbar') as HTMLElement | null;
                return !!p && p.isConnected && p.checkVisibility();
            });
        expect(await isOpen()).toBe(true);
        await page.evaluate(() => {
            const el = document.getElementById('subject')!;
            (window as any).held = el;
            el.remove();
        });
        expect(await isOpen()).toBe(false);
        await page.evaluate(() => document.body.appendChild((window as any).held));
        // connect() → chrome.refresh(): the selection survived the move, so the bar is back.
        await expect.poll(isOpen).toBe(true);
    });
});
