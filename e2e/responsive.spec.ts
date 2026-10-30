import { test, expect, load } from './fixtures';

// Responsive rules (core SPEC §6.7): a page rule (window.components.responsive) applies
// to an editor without the input set; an instance attribute beats it; overrides never
// reflect. Fixture: test/responsive.html (page map desktop/tablet → toolbar 'bottom';
// per-tag callback: width breakpoint 'mobile' → toolbar 'none').

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
});
