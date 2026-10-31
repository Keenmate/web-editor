import { test, expect, load } from './fixtures';

// Responsive rules (core SPEC §6.7): a page rule (window.components.responsive) applies
// to an editor without the input set; an instance attribute beats it; overrides never
// reflect. Fixture: test/responsive.html (page map, device axis: desktop/tablet → toolbar
// 'bottom', mobile → statusbar 'bottom'; per-tag callback: width breakpoint 'mobile' →
// toolbar 'none'; #narrow instance map, breakpoint axis: mobile → statusbar 'top').

test.describe('responsive rules', () => {
    test.beforeEach(async ({ page }) => load(page, 'responsive.html', { flag: 'fixtureReady' }));

    test('page rule applies; instance attribute beats it; no reflection', async ({ page }) => {
        const plain = page.locator('km-editor#plain');
        const explicit = page.locator('km-editor#explicit');
        await expect(plain.locator('.we-surface')).toHaveClass(/we-tb-bottom/);
        expect(await plain.evaluate((el: any) => el.toolbar)).toBe('bottom');
        await expect(plain).not.toHaveAttribute('toolbar', /.*/);
        await expect(explicit.locator('.we-surface')).toHaveClass(/we-tb-top/);
        expect(await explicit.evaluate((el: any) => el.toolbar)).toBe('top');
    });

    test('per-tag callback re-runs on a breakpoint flip; attribute still wins', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        const plain = page.locator('km-editor#plain');
        await expect(plain.locator('.we-toolbar-zone')).toBeHidden();
        await expect(page.locator('km-editor#explicit .we-surface')).toHaveClass(/we-tb-top/);
        await page.setViewportSize({ width: 1440, height: 1024 });
        await expect(plain.locator('.we-surface')).toHaveClass(/we-tb-bottom/);
    });

    test('breakpoint axis follows the window width on a desktop; device axis does not', async ({ page }) => {
        const statusbar = (id: string) => page.locator(`km-editor#${id}`).evaluate((el: any) => el.statusbar);
        expect(await statusbar('narrow')).toBe('none');
        await page.setViewportSize({ width: 700, height: 800 });
        await expect.poll(() => statusbar('narrow')).toBe('top');
        // A narrowed mouse desktop stays deviceClass 'desktop' — device.mobile does not apply.
        expect(await statusbar('plain')).toBe('none');
        await page.setViewportSize({ width: 1440, height: 1024 });
        await expect.poll(() => statusbar('narrow')).toBe('none');
    });
});

test.describe('responsive rules — touch phone (device axis)', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test.beforeEach(async ({ page }) => load(page, 'responsive.html', { flag: 'fixtureReady' }));

    test('device.mobile applies on a touch phone; the instance map still wins', async ({ page }) => {
        const plain = page.locator('km-editor#plain');
        expect(await plain.evaluate((el: any) => el.statusbar)).toBe('bottom');
        await expect(plain).not.toHaveAttribute('statusbar', /.*/);
        // #narrow's instance map (breakpoint axis) beats the page map's device.mobile.
        expect(await page.locator('km-editor#narrow').evaluate((el: any) => el.statusbar)).toBe('top');
    });
});
