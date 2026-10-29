import { test, expect, load, editor, pm, caretAfter, toolbarButton, type Page } from './fixtures';

// Static toolbar: `toolbar` edges by bounding box, `none` hides it, reflected
// attribute; the default group / item set; active state follows the caret.
// Fixture: test/toolbar.html (value "# Title\n\nplain words here").

const zone = (page: Page) => page.locator('km-editor#subject .we-toolbar-zone');
const body = (page: Page) => page.locator('km-editor#subject .we-body');
const setToolbar = (page: Page, side: string) =>
    editor(page).evaluate((el: any, s) => (el.toolbar = s), side);

test.describe('toolbar', () => {
    test.beforeEach(async ({ page }) => load(page, 'toolbar.html', { flag: 'fixtureReady' }));

    test('default: top edge, groups in order, items carry title + shortcut', async ({ page }) => {
        await expect(zone(page)).toBeVisible();
        const [z, b] = await Promise.all([zone(page).boundingBox(), body(page).boundingBox()]);
        expect(z!.y + z!.height).toBeLessThanOrEqual(b!.y + 1);
        const groups = await page.locator('km-editor#subject .we-toolbar-zone .we-group').evaluateAll((gs) => gs.map((g) => (g as HTMLElement).dataset.group));
        expect(groups).toEqual(['format', 'block', 'list', 'insert', 'link', 'image', 'table', 'history', 'view']);
        await expect(toolbarButton(page, 'bold')).toHaveAttribute('title', 'Bold (Ctrl+B)');
        await expect(toolbarButton(page, 'redo')).toHaveAttribute('title', /Redo/);
    });

    const EDGES: Array<[string, (z: any, b: any) => boolean]> = [
        ['bottom', (z, b) => z.y >= b.y + b.height - 1],
        ['start', (z, b) => z.x + z.width <= b.x + 1],
        ['end', (z, b) => z.x >= b.x + b.width - 1],
        ['top', (z, b) => z.y + z.height <= b.y + 1],
    ];
    for (const [side, check] of EDGES) {
        test(`toolbar="${side}" docks the toolbar on that edge`, async ({ page }) => {
            await setToolbar(page, side);
            await expect(editor(page)).toHaveAttribute('toolbar', side);
            await expect(page.locator('km-editor#subject .we-surface')).toHaveClass(new RegExp('we-tb-' + side));
            const [z, b] = await Promise.all([zone(page).boundingBox(), body(page).boundingBox()]);
            expect(check(z, b), JSON.stringify({ z, b })).toBe(true);
        });
    }

    test('toolbar="none" hides it; switching back shows it', async ({ page }) => {
        await setToolbar(page, 'none');
        await expect(zone(page)).toBeHidden();
        await setToolbar(page, 'top');
        await expect(zone(page)).toBeVisible();
    });

    test('active state tracks the caret (heading vs paragraph)', async ({ page }) => {
        await caretAfter(page, 'Tit');
        await expect(toolbarButton(page, 'heading')).toHaveAttribute('aria-pressed', 'true');
        await expect(toolbarButton(page, 'paragraph')).not.toHaveAttribute('aria-pressed', 'true');
        await caretAfter(page, 'plain');
        await expect(toolbarButton(page, 'paragraph')).toHaveAttribute('aria-pressed', 'true');
        await expect(toolbarButton(page, 'heading')).not.toHaveAttribute('aria-pressed', 'true');
    });

    test('clicking a toolbar button keeps focus in the editor', async ({ page }) => {
        await caretAfter(page, 'plain');
        await toolbarButton(page, 'heading').click();
        await page.keyboard.type('X');
        await expect(pm(page).locator('h1').nth(1)).toHaveText('plainX words here');
    });
});
