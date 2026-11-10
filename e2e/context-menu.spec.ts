import { test, expect, load, editor, pm, selectText, type Page } from './fixtures';

// Context menu: opens at the pointer on right-click, dismisses on Escape /
// outside pointerdown / after activating an item, runs commands; read-only gets
// the native menu. Fixture: test/context-menu.html (value "# Title\n\nplain words here").

const menu = (page: Page) => page.locator('km-editor#subject .we-context-menu');

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
        await expect(bold).toHaveClass(/km-menu__item--toggled/);
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

    // ── core openMenu() (web-components-core /menu) ──────────────────────────

    test('rendered by core openMenu: .km-menu role=menu, part=context-menu, themed via --we-context-menu-*', async ({ page }) => {
        await editor(page).evaluate((el) => (el as HTMLElement).style.setProperty('--we-context-menu-bg', 'rgb(1, 2, 3)'));
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await expect(menu(page)).toHaveClass(/(^| )km-menu( |$)/);
        await expect(menu(page)).toHaveAttribute('role', 'menu');
        await expect(menu(page)).toHaveAttribute('part', 'context-menu');
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(1, 2, 3)');
        await expect(menu(page).locator('[role="separator"]').first()).toBeAttached();
        // Only the one menu, no leftover editor-rendered menu markup.
        await expect(editor(page).locator('.km-menu')).toHaveCount(1);
    });

    // Variable chain (core SPEC §12.13): --we-context-menu-* (this editor) → --km-menu-*
    // (every menu on the page) → --base-* (theme) → core default.
    const openMenu = async (page: Page) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
    };
    const setRoot = (page: Page, name: string, value: string) =>
        page.evaluate(([n, v]) => document.documentElement.style.setProperty(n!, v!), [name, value]);

    test('variable chain: a page-level --km-menu-bg on :root themes the menu when --we-context-menu-bg is unset', async ({ page }) => {
        await setRoot(page, '--km-menu-bg', 'rgb(10, 20, 30)');
        await openMenu(page);
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(10, 20, 30)');
    });

    test('variable chain: --we-context-menu-bg on the editor wins over the page-level --km-menu-bg', async ({ page }) => {
        await setRoot(page, '--km-menu-bg', 'rgb(10, 20, 30)');
        await editor(page).evaluate((el) => (el as HTMLElement).style.setProperty('--we-context-menu-bg', 'rgb(1, 2, 3)'));
        await openMenu(page);
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(1, 2, 3)');
    });

    test('variable chain: neither set → --base-dropdown-bg, then the core default', async ({ page }) => {
        await openMenu(page);
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await page.keyboard.press('Escape');
        await setRoot(page, '--base-dropdown-bg', 'rgb(4, 5, 6)');
        await openMenu(page);
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(4, 5, 6)');
    });

    test('data-theme="dark" gets a dark menu (color-scheme: dark → core light-dark() defaults)', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('data-theme', 'dark'));
        await openMenu(page);
        await expect(menu(page)).toHaveCSS('background-color', 'rgb(43, 43, 43)');
    });

    test('--we-context-menu-hover-color colours the hovered item text (unset → unchanged)', async ({ page }) => {
        await openMenu(page);
        const item = menu(page).locator('[data-action="italic"]');
        const before = await item.evaluate((el) => getComputedStyle(el).color);
        await item.hover();
        await expect(item).toHaveCSS('color', before);
        await page.keyboard.press('Escape');
        await editor(page).evaluate((el) => (el as HTMLElement).style.setProperty('--we-context-menu-hover-color', 'rgb(200, 0, 100)'));
        await openMenu(page);
        await item.hover();
        await expect(item).toHaveCSS('color', 'rgb(200, 0, 100)');
    });

    test('keyboard: arrows move focus (skipping disabled), Enter runs the item, focus returns to the editor', async ({ page }) => {
        await selectText(page, 'words');
        const p = (await pm(page).locator('p').boundingBox())!;
        await page.mouse.click(p.x + 5, p.y + 5, { button: 'right' });
        await selectText(page, 'words');
        await expect(menu(page)).toBeVisible();
        const focusedAction = () =>
            editor(page).evaluate((el) => (el.shadowRoot!.activeElement as HTMLElement | null)?.dataset.action ?? null);
        await page.keyboard.press('ArrowDown');
        expect(await focusedAction()).toBe('bold');
        await page.keyboard.press('ArrowDown');
        expect(await focusedAction()).toBe('italic');
        await page.keyboard.press('End');
        // redo is disabled (nothing to redo) → End lands on the last ENABLED item.
        expect(await focusedAction()).not.toBe('redo');
        await page.keyboard.press('Home');
        expect(await focusedAction()).toBe('bold');
        await page.keyboard.press('Enter');
        await expect(menu(page)).toBeHidden();
        await expect(pm(page).locator('p strong')).toHaveText('words');
        expect(await editor(page).evaluate((el) => el.shadowRoot!.activeElement?.classList.contains('ProseMirror'))).toBe(true);
        await expect(page.getByTestId('context-menu-log')).toContainText('action:bold');
    });

    test('keyboard: Space toggles the focused item; the toggle reflects on reopen', async ({ page }) => {
        await selectText(page, 'words');
        await pm(page).locator('p').click({ button: 'right' });
        await selectText(page, 'words');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press(' ');
        await expect(menu(page)).toBeHidden();
        await expect(pm(page).locator('p em')).toHaveText('words');
        await pm(page).locator('p em').click({ button: 'right' });
        await expect(menu(page).locator('[data-action="italic"]')).toHaveAttribute('aria-checked', 'true');
        await expect(menu(page).locator('[data-action="bold"]')).toHaveAttribute('aria-checked', 'false');
    });

    test('disabled items are aria-disabled and do nothing when clicked', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        const redo = menu(page).locator('[data-action="redo"]');
        await expect(redo).toHaveAttribute('aria-disabled', 'true');
        await redo.click({ force: true });
        await expect(menu(page)).toBeVisible();
        await expect(page.getByTestId('context-menu-log')).not.toContainText('action:redo');
    });

    test('Escape with focus in the menu closes it and returns focus to the editor', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        expect(await editor(page).evaluate((el) => el.shadowRoot!.activeElement?.classList.contains('ProseMirror'))).toBe(true);
    });

    test('Tab closes it', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Tab');
        await expect(menu(page)).toBeHidden();
    });

    test('a second right-click replaces the menu (one open at a time)', async ({ page }) => {
        const p = (await pm(page).locator('p').boundingBox())!;
        await page.mouse.click(p.x + 5, p.y + 5, { button: 'right' });
        await expect(menu(page)).toBeVisible();
        // Above the open menu (it drops down from the point), so the press lands on the editor.
        const h = (await pm(page).locator('h1').boundingBox())!;
        await page.mouse.click(h.x + 40, h.y + 5, { button: 'right' });
        await expect(editor(page).locator('.km-menu')).toHaveCount(1);
        const m = (await menu(page).boundingBox())!;
        expect(Math.abs(m.x - (h.x + 40))).toBeLessThan(30);
        expect(Math.abs(m.y - (h.y + 5))).toBeLessThan(30);
    });

    // Core rc20 menu scroll rule (shared with createPopover): only a scroll that moves what the
    // menu belongs to (the page, or a scroller around the editor) closes it; a wheel that
    // scrolls nothing does not.
    test('a page scroll that moves the editor closes the menu', async ({ page }) => {
        await page.evaluate(() => {
            const spacer = document.createElement('div');
            spacer.style.height = '3000px';
            document.body.appendChild(spacer);
        });
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await page.mouse.move(5, 600);
        await page.mouse.wheel(0, 100);
        await expect(menu(page)).toBeHidden();
    });

    test('a wheel that scrolls nothing leaves the menu open', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await page.mouse.move(5, 600);
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(300);
        await expect(menu(page)).toBeVisible();
    });

    test('moving the element closes the open menu', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await editor(page).evaluate((el) => document.body.appendChild(el));
        await expect(menu(page)).toBeHidden();
    });
});

