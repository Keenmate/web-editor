import { test, expect, load, editor, pm, selectText, type Locator, type Page } from './fixtures';

// Dark mode (rulebook color-scheme.md → "Testing strategy"): the editor follows the
// page signal core mirrors as `data-context-theme`, a per-instance `data-theme` wins
// both ways, non-switches change nothing, and the floating layers (selection toolbar,
// context menu — both in the shadow root) follow the host. Contrast is WCAG 2.1:
// ≥ 4.5:1 for text, ≥ 3:1 for non-text UI.
// Fixture: test/dark-mode.html (#subject, #sectioned with theme-source="closest" in #section).

const LIGHT_BG = 'rgb(255, 255, 255)'; // --base-main-bg fallback, light branch
const DARK_BG = 'rgb(30, 41, 59)'; // --base-main-bg fallback, dark branch

type RGBA = { r: number; g: number; b: number; a: number };

/**
 * The rendered colours of an element: its text colour and its background, both
 * composited over the backgrounds behind it (walking up across the shadow
 * boundary). Each colour is painted onto a 1×1 canvas, so every serialization
 * the browser returns (rgb, color(srgb …), oklch, light-dark results) is handled.
 */
const rendered = (loc: Locator): Promise<{ fg: RGBA; bg: RGBA }> =>
    loc.evaluate((el) => {
        const layers: string[] = [];
        for (let n: Node | null = el; n; n = n instanceof ShadowRoot ? n.host : n.parentNode) {
            if (!(n instanceof Element)) continue;
            const bg = getComputedStyle(n).backgroundColor;
            layers.push(bg);
            const probe = document.createElement('canvas').getContext('2d')!;
            probe.fillStyle = bg;
            probe.fillRect(0, 0, 1, 1);
            if (probe.getImageData(0, 0, 1, 1).data[3] === 255) break;
        }
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
        const scheme = getComputedStyle(document.documentElement).colorScheme;
        ctx.fillStyle = scheme.includes('dark') ? '#121212' : '#ffffff'; // the page canvas
        ctx.fillRect(0, 0, 1, 1);
        for (const bg of layers.reverse()) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, 1, 1);
        }
        const read = () => {
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return { r, g, b, a: 1 };
        };
        const bg = read();
        ctx.fillStyle = getComputedStyle(el).color;
        ctx.fillRect(0, 0, 1, 1);
        return { fg: read(), bg };
    });

const luminance = ({ r, g, b }: RGBA) => {
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = ({ fg, bg }: { fg: RGBA; bg: RGBA }) => {
    const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
};

const surface = (page: Page, id = 'subject') => editor(page, id).locator('.we-surface');
const expectScheme = (page: Page, scheme: 'light' | 'dark', id = 'subject') =>
    expect(surface(page, id)).toHaveCSS('background-color', scheme === 'dark' ? DARK_BG : LIGHT_BG);

const setOn = (page: Page, selector: string, name: string, value: string) =>
    page.evaluate(([s, n, v]) => document.querySelector(s!)!.setAttribute(n!, v!), [selector, name, value]);

test.describe('dark mode — signals', () => {
    test.beforeEach(async ({ page }) => load(page, 'dark-mode.html', { flag: 'fixtureReady' }));

    test('no signal, page color-scheme unset → light', async ({ page }) => {
        await expectScheme(page, 'light');
        await expect(editor(page)).not.toHaveAttribute('data-context-theme');
    });

    test('<html style="color-scheme: dark"> with no signal → dark (inherited)', async ({ page }) => {
        await page.evaluate(() => (document.documentElement.style.colorScheme = 'dark'));
        await expectScheme(page, 'dark');
    });

    test('OS dark + page color-scheme "light dark" → dark', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.evaluate(() => (document.documentElement.style.colorScheme = 'light dark'));
        await expectScheme(page, 'dark');
    });

    for (const [where, name, value] of [
        ['html', 'data-theme', 'dark'],
        ['html', 'data-bs-theme', 'dark'],
        ['html', 'class', 'dark'],
        ['body', 'data-theme', 'dark'],
    ] as const) {
        test(`${name}="${value}" on <${where}> → dark (data-context-theme on the host)`, async ({ page }) => {
            await setOn(page, where, name, value);
            await expect(editor(page)).toHaveAttribute('data-context-theme', 'dark');
            await expectScheme(page, 'dark');
        });
    }

    test('a dark section + theme-source="closest" → dark; the rest of the page stays light', async ({ page }) => {
        await setOn(page, '#section', 'data-theme', 'dark');
        await expect(editor(page, 'sectioned')).toHaveAttribute('data-context-theme', 'dark');
        await expectScheme(page, 'dark', 'sectioned');
        await expectScheme(page, 'light');
    });

    test('setThemeMode("dark") → dark; "auto" → back to the page', async ({ page }) => {
        await page.evaluate(() => (window as any).setThemeMode('dark'));
        await expectScheme(page, 'dark');
        await page.evaluate(() => (window as any).setThemeMode('auto'));
        await expectScheme(page, 'light');
    });

    test('per-instance data-theme="dark" on a light page → dark', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('data-theme', 'dark'));
        await expectScheme(page, 'dark');
    });

    test('per-instance data-theme="light" on a dark page → light', async ({ page }) => {
        await setOn(page, 'html', 'data-theme', 'dark');
        await expect(editor(page)).toHaveAttribute('data-context-theme', 'dark');
        await editor(page).evaluate((el) => el.setAttribute('data-theme', 'light'));
        await expectScheme(page, 'light');
    });

    test('data-bs-theme="dark" on the host itself → no change (not a switch)', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('data-bs-theme', 'dark'));
        await expectScheme(page, 'light');
    });

    test('a leftover theme="dark" attribute → no change (retired)', async ({ page }) => {
        await editor(page).evaluate((el) => el.setAttribute('theme', 'dark'));
        await expectScheme(page, 'light');
    });
});

test.describe('dark mode — contrast', () => {
    test.beforeEach(async ({ page }) => load(page, 'dark-mode.html', { flag: 'fixtureReady' }));

    for (const scheme of ['light', 'dark'] as const) {
        test(`${scheme}: document, chrome and content meet WCAG contrast`, async ({ page }) => {
            if (scheme === 'dark') await setOn(page, 'html', 'data-theme', 'dark');
            await expectScheme(page, scheme);
            const host = editor(page);
            const text: [string, Locator][] = [
                ['body text', pm(page).locator('p').first()],
                ['heading', pm(page).locator('h2')],
                ['link', pm(page).locator('a')],
                ['inline code', pm(page).locator('p code')],
                ['table header', pm(page).locator('th p').first()],
                ['table cell', pm(page).locator('td p').first()],
                ['code block', pm(page).locator('pre code')],
                ['status bar', host.locator('.we-status-item').first()],
                ['toolbar command', host.locator('.we-toolbar-zone [data-action="bold"]')],
            ];
            for (const [what, loc] of text) {
                expect(contrast(await rendered(loc)), `${scheme} ${what}`).toBeGreaterThanOrEqual(4.5);
            }
            // The active view-mode item: text on the accent fill (non-text UI bar: 3:1).
            const toggled = host.locator('.we-toolbar-zone .toggled').first();
            expect(contrast(await rendered(toggled)), `${scheme} toggled command`).toBeGreaterThanOrEqual(3);
        });
    }
});

test.describe('dark mode — floating layers in a dark editor on a light page', () => {
    test.beforeEach(async ({ page }) => {
        await load(page, 'dark-mode.html', { flag: 'fixtureReady' });
        await editor(page).evaluate((el) => el.setAttribute('data-theme', 'dark'));
        await expectScheme(page, 'dark');
    });

    test('the selection toolbar is a dark pill with readable commands', async ({ page }) => {
        await selectText(page, 'plain');
        const bar = editor(page).locator('.we-selection-toolbar .we-command-bar');
        await expect(bar).toBeVisible();
        const colors = await rendered(bar.locator('[data-action="bold"]'));
        expect(luminance(colors.bg)).toBeLessThan(0.3);
        expect(contrast(colors)).toBeGreaterThanOrEqual(4.5);
    });

    test('the context menu is dark with readable items', async ({ page }) => {
        await pm(page).locator('p').first().click({ button: 'right' });
        const menu = editor(page).locator('.we-context-menu');
        await expect(menu).toBeVisible();
        const { bg } = await rendered(menu);
        expect(luminance(bg)).toBeLessThan(0.3);
        const item = menu.locator('[role="menuitem"]').first();
        expect(contrast(await rendered(item))).toBeGreaterThanOrEqual(4.5);
    });
});

test.describe('dark mode — the selection toolbar on a light page', () => {
    test('stays a dark pill (tooltip tokens) with readable commands', async ({ page }) => {
        await load(page, 'dark-mode.html', { flag: 'fixtureReady' });
        await selectText(page, 'plain');
        const bar = editor(page).locator('.we-selection-toolbar .we-command-bar');
        await expect(bar).toBeVisible();
        const colors = await rendered(bar.locator('[data-action="bold"]'));
        expect(luminance(colors.bg)).toBeLessThan(0.3);
        expect(contrast(colors)).toBeGreaterThanOrEqual(4.5);
    });
});
