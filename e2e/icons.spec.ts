import { test, expect, load, editor } from './fixtures';

// Item icons through core renderIcon (SPEC §12.33): the element's own `renderIconCallback` beats the page-wide
// `window.components.renderIconCallback`; `null` falls through to it; an ASCII class list is an icon-font
// `<i class="we__icon …">`; a reserved built-in name is never sent to a hook. Fixture: test/icons.html.

const button = (page: any, id: string) => page.locator(`km-editor#subject .we-toolbar-zone [data-id="${id}"]`);

test.describe('icons', () => {
    test.beforeEach(async ({ page }) => load(page, 'icons.html', { flag: 'fixtureReady' }));

    test('the element hook beats the page hook, with the component context', async ({ page }) => {
        const own = button(page, 'own').locator('b.own-icon');
        await expect(own).toHaveText('mine');
        await expect(own).toHaveAttribute('data-component', 'km-editor');
        await expect(own).toHaveAttribute('data-item', 'own');
        await expect(button(page, 'own').locator('b.page-icon')).toHaveCount(0);
    });

    test('the element hook returning null falls through to the page hook', async ({ page }) => {
        await expect(button(page, 'shared').locator('b.page-icon')).toHaveText('shared');
    });

    test('a class list renders an icon-font <i class="we__icon …">', async ({ page }) => {
        const i = button(page, 'font').locator('i.we__icon');
        await expect(i).toHaveClass('we__icon fa-solid fa-star');
        await expect(i).toHaveAttribute('aria-hidden', 'true');
        expect(await i.evaluate((n) => getComputedStyle(n).flexShrink)).toBe('0');
    });

    test('a built-in name is masked and never reaches a hook', async ({ page }) => {
        await expect(button(page, 'builtin').locator('.km-icon')).toHaveCount(1);
        const calls = await page.evaluate(() => (window as any).iconCalls);
        expect(calls.element).not.toContain('check');
        expect(calls.page).not.toContain('check');
        expect(calls.element).toContain('mine');
    });

    test('assigning renderIconCallback re-renders the icons live', async ({ page }) => {
        await editor(page).evaluate(async (el: any) => {
            el.renderIconCallback = (name: string) => (name === 'shared' ? '<b class="swapped">S</b>' : null);
            await el.whenSettled();
        });
        await expect(button(page, 'shared').locator('b.swapped')).toHaveText('S');
        await expect(button(page, 'own').locator('b.page-icon')).toHaveText('mine');
    });
});
