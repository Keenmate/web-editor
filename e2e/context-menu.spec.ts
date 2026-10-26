import { test, expect, load, editor, pm, selectText, type Page } from './fixtures';

// Context menu: opens at the pointer on right-click, dismisses on Escape /
// outside pointerdown / after activating an item, runs commands; read-only gets
// the native menu. Fixture: test/context-menu.html (value "# Title\n\nplain words here").

const menu = (page: Page) => page.locator('km-editor#subject .km-context-menu');

test.describe('context menu', () => {
    test.beforeEach(async ({ page }) => load(page, 'context-menu.html', { flag: 'fixtureReady' }));

    test('right-click opens the menu near the pointer', async ({ page }) => {
        const p = (await pm(page).locator('p').boundingBox())!;
        await page.mouse.click(p.x + 20, p.y + 5, { button: 'right' });
        await expect(menu(page)).toBeVisible();
        const m = (await menu(page).boundingBox())!;
        expect(Math.abs(m.x - (p.x + 20))).toBeLessThan(30);
        expect(Math.abs(m.y - (p.y + 5))).toBeLessThan(30);
    });

    test('Escape closes it', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
    });

    test('a pointerdown outside closes it; inside does not', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await menu(page).dispatchEvent('pointerdown');
        await expect(menu(page)).toBeVisible();
        await page.mouse.click(5, 600);
        await expect(menu(page)).toBeHidden();
    });

    test('activating an item runs the command and closes the menu', async ({ page }) => {
        await selectText(page, 'words');
        await pm(page).locator('p').click({ button: 'right' });
        // Right-click may collapse the selection in some engines — re-select, then use the menu.
        await selectText(page, 'words');
        await menu(page).locator('[data-action="bold"]').click();
        await expect(pm(page).locator('p strong')).toHaveText('words');
        await expect(menu(page)).toBeHidden();
    });

    test('toggle commands are menuitemcheckbox + aria-checked; others menuitem', async ({ page }) => {
        await selectText(page, 'words');
        await page.keyboard.press('Control+b');
        await pm(page).locator('p strong').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        const bold = menu(page).locator('[data-action="bold"]');
        await expect(bold).toHaveAttribute('role', 'menuitemcheckbox');
        await expect(bold).toHaveAttribute('aria-checked', 'true');
        await expect(bold).toHaveClass(/(^| )toggled( |$)/);
        await expect(bold).not.toHaveAttribute('aria-pressed', /.*/);
        await expect(menu(page).locator('[data-action="italic"]')).toHaveAttribute('aria-checked', 'false');
        const undo = menu(page).locator('[data-action="undo"]');
        await expect(undo).toHaveAttribute('role', 'menuitem');
        await expect(undo).not.toHaveAttribute('aria-checked', /.*/);
    });

    test('read-only: no custom menu', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('readonly', ''));
        await pm(page).locator('p').click({ button: 'right' });
        await page.waitForTimeout(100);
        await expect(menu(page)).toBeHidden();
    });

    test('becoming read-only while open closes it', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await editor(page).evaluate((el) => el.setAttribute('readonly', ''));
        await expect(menu(page)).toBeHidden();
    });
});
