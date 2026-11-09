import { test, expect, load, editor, pm, toolbarButton, selectText, type Page } from './fixtures';

// Theming: `theme="dark"` swaps the token set; `--we-accent` drives the active
// button colour; the theme attribute is reflected / settable.
// Fixture: test/theming.html (#light, #dark theme="dark", #accent with --we-accent).

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
        expect(await hostStyle(page, 'light', '--we-accent')).toBe('#0066cc');
        expect(await hostStyle(page, 'light', 'color')).toBe('rgb(51, 51, 51)');
    });

    test('theme="dark" swaps the tokens and the text colour', async ({ page }) => {
        expect(await hostStyle(page, 'dark', '--we-accent')).toBe('#4ea1ff');
        expect(await hostStyle(page, 'dark', '--we-bg')).toBe('#1e1e1e');
        expect(await hostStyle(page, 'dark', 'color')).toBe('rgb(212, 212, 212)');
        await expect(pm(page, 'dark')).toHaveCSS('color', 'rgb(212, 212, 212)');
    });

    test('an active toolbar button uses --we-accent (default, dark, overridden)', async ({ page }) => {
        expect(await pressedBg(page, 'light')).toBe('rgb(0, 102, 204)');
        expect(await pressedBg(page, 'dark')).toBe('rgb(78, 161, 255)');
        expect(await pressedBg(page, 'accent')).toBe('rgb(255, 0, 0)');
    });

    test('theme property reflects to the attribute and restyles live', async ({ page }) => {
        await editor(page, 'light').evaluate((el: any) => (el.theme = 'dark'));
        await expect(editor(page, 'light')).toHaveAttribute('theme', 'dark');
        expect(await hostStyle(page, 'light', '--we-accent')).toBe('#4ea1ff');
        await editor(page, 'light').evaluate((el: any) => (el.theme = null));
        await expect(editor(page, 'light')).not.toHaveAttribute('theme');
        expect(await hostStyle(page, 'light', '--we-accent')).toBe('#0066cc');
    });
});

test.describe('theme input (closed set)', () => {
    test.beforeEach(async ({ page }) => load(page, 'theming.html', { flag: 'fixtureReady' }));

    test('an unknown theme is refused (input-rejected), the previous one kept', async ({ page }) => {
        const out = await editor(page, 'dark').evaluate((el: any) => {
            const seen: any[] = [];
            el.addEventListener('input-rejected', (e: any) => seen.push([e.detail.configKey, e.detail.value]));
            el.setAttribute('theme', 'corporate');
            el.theme = 'neon';
            return { seen, theme: el.theme };
        });
        expect(out).toEqual({ seen: [['theme', 'corporate'], ['theme', 'neon']], theme: 'dark' });
        await expect(editor(page, 'dark')).toHaveAttribute('theme', 'dark');
    });
});

// Custom CSS (core createCustomStyles, rulebook C-CA-15): the page-wide layer
// `window.components['km-editor'].customStyles` styles every editor; the instance
// layer (`custom-styles` / `getCustomStylesCallback`, the callback wins) comes after it.
test.describe('custom styles', () => {
    test.beforeEach(async ({ page }) => load(page, 'theming.html', { flag: 'fixtureReady' }));

    const spacing = (page: Page, id: string) => pm(page, id).evaluate((p) => getComputedStyle(p).letterSpacing);

    test('the page-wide layer styles every editor; an instance overrides it', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).components['km-editor'].customStyles = '.ProseMirror { letter-spacing: 3px; }';
        });
        await expect.poll(() => spacing(page, 'light')).toBe('3px');
        await expect.poll(() => spacing(page, 'dark')).toBe('3px');
        await editor(page, 'light').evaluate((el: any) => el.setAttribute('custom-styles', '.ProseMirror { letter-spacing: 5px; }'));
        await expect.poll(() => spacing(page, 'light')).toBe('5px');
        expect(await spacing(page, 'dark')).toBe('3px');
        const classes = await editor(page, 'light').evaluate((el) =>
            [...el.shadowRoot!.querySelectorAll('style')].map((s) => s.className).filter((c) => c.startsWith('we-custom-styles'))
        );
        expect(classes).toEqual(['we-custom-styles--page', 'we-custom-styles']);
    });

    test('getCustomStylesCallback wins over customStyles and gets the context; clearing removes the CSS', async ({ page }) => {
        const hasController = await editor(page, 'light').evaluate((el: any) => {
            let seen = false;
            el.customStyles = '.ProseMirror { letter-spacing: 5px; }';
            el.getCustomStylesCallback = (ctx: any) => {
                seen = !!ctx.controller && ctx.element === el;
                return '.ProseMirror { letter-spacing: 7px; }';
            };
            return el.whenSettled().then(() => seen);
        });
        expect(hasController).toBe(true);
        await expect.poll(() => spacing(page, 'light')).toBe('7px');
        await editor(page, 'light').evaluate((el: any) => (el.getCustomStylesCallback = null));
        await expect.poll(() => spacing(page, 'light')).toBe('5px');
        await editor(page, 'light').evaluate((el: any) => (el.customStyles = undefined));
        await expect.poll(() => spacing(page, 'light')).toBe('normal');
    });
});
