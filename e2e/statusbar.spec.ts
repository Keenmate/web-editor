import { test, expect, load, editor, caretAfter, type Page } from './fixtures';

// Status bar: Words / Chars live, edges top / bottom / both (split by item.bar),
// `none` hides, shown in read-only too. Fixture: test/statusbar.html
// (statusbar="bottom", value "# Title\n\nplain words here").

const item = (page: Page, id: string) =>
    page.locator(`km-editor#subject .km-status-item[data-status="${id}"]`).filter({ visible: true });
const strip = (page: Page, part: string) => page.locator(`km-editor#subject [part="${part}"] .km-statusbar`);
const setBar = (page: Page, v: string) => editor(page).evaluate((el: any, s) => (el.statusbar = s), v);

test.describe('statusbar', () => {
    test.beforeEach(async ({ page }) => load(page, 'statusbar.html', { flag: 'fixtureReady' }));

    test('bottom strip shows Words and Chars below the editor', async ({ page }) => {
        await expect(item(page, 'words')).toHaveText('Words: 4');
        await expect(item(page, 'chars')).toHaveText('Chars: 21');
        const [s, e] = await Promise.all([
            strip(page, 'status-bottom').boundingBox(),
            page.locator('km-editor#subject .km-editor').boundingBox(),
        ]);
        expect(s!.y).toBeGreaterThanOrEqual(e!.y + e!.height - 1);
    });

    test('counts update live while typing', async ({ page }) => {
        await caretAfter(page, 'here');
        await page.keyboard.type(' and more');
        await expect(item(page, 'words')).toHaveText('Words: 6');
        await expect(item(page, 'chars')).toHaveText('Chars: 30');
    });

    test('top edge places the strip above the editor', async ({ page }) => {
        await setBar(page, 'top');
        await expect(strip(page, 'status-top')).toBeVisible();
        await expect(page.locator('km-editor#subject [part="status-bottom"]')).toHaveCount(0);
        const [s, e] = await Promise.all([
            strip(page, 'status-top').boundingBox(),
            page.locator('km-editor#subject .km-editor').boundingBox(),
        ]);
        expect(s!.y + s!.height).toBeLessThanOrEqual(e!.y + 1);
        await expect(item(page, 'words')).toHaveText('Words: 4');
    });

    test('both: items split by their bar (chars top, words bottom)', async ({ page }) => {
        await setBar(page, 'both');
        await expect(strip(page, 'status-top').locator('.km-status-item[data-status="chars"]')).toBeVisible();
        await expect(strip(page, 'status-top').locator('.km-status-item[data-status="words"]')).toBeHidden();
        await expect(strip(page, 'status-bottom').locator('.km-status-item[data-status="words"]')).toBeVisible();
        await expect(strip(page, 'status-bottom').locator('.km-status-item[data-status="chars"]')).toBeHidden();
    });

    test('none hides the status bar', async ({ page }) => {
        await setBar(page, 'none');
        await expect(page.locator('km-editor#subject .km-statusbar').filter({ visible: true })).toHaveCount(0);
    });

    test('shown in read-only', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('readonly', ''));
        await expect(item(page, 'words')).toHaveText('Words: 4');
    });
});
