import { test, expect, load, editor, pm, toolbarButton, selectText, type Page } from './fixtures';

// Theming: `theme="dark"` swaps the token set; `--km-accent` drives the active
// button colour; the theme attribute is reflected / settable.
// Fixture: test/theming.html (#light, #dark theme="dark", #accent with --km-accent).

const hostStyle = (page: Page, id: string, prop: string) =>
    editor(page, id).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);

const pressedBg = async (page: Page, id: string) => {
    await selectText(page, id, id);
    await page.keyboard.press('Control+b'); // (a click would hit the selection toolbar on line 1 — NOTES ED-10)
    const btn = toolbarButton(page, 'bold', id);
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    return btn.evaluate((b) => getComputedStyle(b).backgroundColor);
};

test.describe('theming', () => {
    test.beforeEach(async ({ page }) => load(page, 'theming.html', { flag: 'fixtureReady' }));

    test('light (default) tokens', async ({ page }) => {
        expect(await hostStyle(page, 'light', '--km-accent')).toBe('#0066cc');
        expect(await hostStyle(page, 'light', 'color')).toBe('rgb(51, 51, 51)');
    });

    test('theme="dark" swaps the tokens and the text colour', async ({ page }) => {
        expect(await hostStyle(page, 'dark', '--km-accent')).toBe('#4ea1ff');
        expect(await hostStyle(page, 'dark', '--km-bg')).toBe('#1e1e1e');
        expect(await hostStyle(page, 'dark', 'color')).toBe('rgb(212, 212, 212)');
        await expect(pm(page, 'dark')).toHaveCSS('color', 'rgb(212, 212, 212)');
    });

    test('an active toolbar button uses --km-accent (default, dark, overridden)', async ({ page }) => {
        expect(await pressedBg(page, 'light')).toBe('rgb(0, 102, 204)');
        expect(await pressedBg(page, 'dark')).toBe('rgb(78, 161, 255)');
        expect(await pressedBg(page, 'accent')).toBe('rgb(255, 0, 0)');
    });

    test('theme property reflects to the attribute and restyles live', async ({ page }) => {
        await editor(page, 'light').evaluate((el: any) => (el.theme = 'dark'));
        await expect(editor(page, 'light')).toHaveAttribute('theme', 'dark');
        expect(await hostStyle(page, 'light', '--km-accent')).toBe('#4ea1ff');
        await editor(page, 'light').evaluate((el: any) => (el.theme = null));
        await expect(editor(page, 'light')).not.toHaveAttribute('theme');
        expect(await hostStyle(page, 'light', '--km-accent')).toBe('#0066cc');
    });
});
