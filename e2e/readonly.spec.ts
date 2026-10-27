import { test, expect, load, pm, editor, markdown, type Page } from './fixtures';

// readonly: typing ignored, toolbar hidden, native context menu (no custom menu);
// removing the attribute re-enables. Fixture: test/readonly.html
// (`<km-editor readonly value="# Locked\n\nbody text">`).

const menu = (page: Page) => page.locator('km-editor#subject .we-context-menu');
const toolbar = (page: Page) => page.locator('km-editor#subject .we-toolbar-zone');

test.describe('readonly', () => {
    test.beforeEach(async ({ page }) => load(page, 'readonly.html', { flag: 'fixtureReady' }));

    test('renders the content but is not editable; typing is ignored', async ({ page }) => {
        await expect(pm(page).locator('h1')).toHaveText('Locked');
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await pm(page).locator('p').click();
        await page.keyboard.type('nope');
        await page.keyboard.press('Control+b');
        expect(await markdown(page)).toBe('# Locked\n\nbody text');
    });

    test('toolbar is hidden', async ({ page }) => {
        await expect(toolbar(page)).toBeHidden();
    });

    test('right-click does not open the custom context menu (native menu not prevented)', async ({ page }) => {
        const prevented = await pm(page)
            .locator('p')
            .evaluate((p) => {
                const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: 10, clientY: 10 });
                p.dispatchEvent(e);
                return e.defaultPrevented;
            });
        expect(prevented).toBe(false);
        await expect(menu(page)).toBeHidden();
    });

    test('removing the attribute re-enables editing, toolbar and context menu', async ({ page }) => {
        await editor(page).evaluate((el) => el.removeAttribute('readonly'));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await expect(toolbar(page)).toBeVisible();
        await pm(page).locator('p').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page)).toBe('# Locked\n\nbody text!');
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
    });

    test('isReadonly property toggles the same way', async ({ page }) => {
        await editor(page).evaluate((el: any) => (el.isReadonly = false));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await editor(page).evaluate((el: any) => (el.isReadonly = true));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await expect(toolbar(page)).toBeHidden();
    });

    test('content API still works while read-only (setValue)', async ({ page }) => {
        await editor(page).evaluate((el: any) => el.setValue('# Replaced'));
        await expect(pm(page).locator('h1')).toHaveText('Replaced');
    });
});
