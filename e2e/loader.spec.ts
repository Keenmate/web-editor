import { test, expect, load, type Page } from './fixtures';

// Pending loader = core renderLoader() (SPEC §12.14): default `.we__loader`, the page-wide
// window.components.renderLoadingCallback, the instance renderLoadingCallback (wins).
// Fixture: test/loader.html.

const slot = (page: Page) => page.locator('#subject .we-pending');

test.describe('pending loader', () => {
    test.beforeEach(async ({ page }) => {
        await load(page, 'loader.html', { flag: 'loaderReady' });
    });

    test('default loader: role=status + aria-label, drawn from --we-loader-* tokens; removed when settled', async ({ page }) => {
        await expect(slot(page)).toBeHidden();
        await page.evaluate(() => (window as any).runSlow());
        await expect(slot(page)).toBeVisible();
        await expect(slot(page)).toHaveAttribute('role', 'status');
        await expect(slot(page)).toHaveAttribute('aria-label', 'Loading…');
        const loader = slot(page).locator('.we__loader');
        await expect(loader).toBeVisible();
        const css = await loader.evaluate((n) => {
            const s = getComputedStyle(n);
            return { mask: s.maskImage || (s as any).webkitMaskImage, anim: s.animationName };
        });
        expect(css.mask).toContain('data:image/svg+xml');
        expect(css.anim).toBe('we-loader-spin');
        await page.evaluate(() => (window as any).releaseSlow());
        await expect(slot(page)).toBeHidden();
        await expect(slot(page)).not.toHaveAttribute('role', 'status');
        await expect(loader).toHaveCount(0);
    });

    test('the page hook replaces the default; the instance hook beats the page hook', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).components.renderLoadingCallback = ({ containerElement, context }: any) => {
                containerElement.insertAdjacentHTML('beforeend', `<i class="page-hook">${context}</i>`);
            };
        });
        await page.evaluate(() => (window as any).runSlow());
        await expect(slot(page).locator('.page-hook')).toHaveText('pipeline');
        await expect(slot(page).locator('.we__loader')).toHaveCount(0);
        await page.evaluate(() => (window as any).releaseSlow());
        await expect(slot(page).locator('.page-hook')).toHaveCount(0);

        await page.evaluate(() => {
            (document.getElementById('subject') as any).renderLoadingCallback = ({ containerElement }: any) => {
                containerElement.insertAdjacentHTML('beforeend', '<i class="instance-hook"></i>');
            };
        });
        await page.evaluate(() => (window as any).runSlow());
        await expect(slot(page).locator('.instance-hook')).toHaveCount(1);
        await expect(slot(page).locator('.page-hook')).toHaveCount(0);
        await page.evaluate(() => (window as any).releaseSlow());
        await expect(slot(page).locator('.instance-hook')).toHaveCount(0);
        await page.evaluate(() => ((window as any).components.renderLoadingCallback = undefined));
    });

    test('no loader while an interactive stage waits for the user; it shows once work runs again', async ({ page }) => {
        await page.evaluate(() => (window as any).runAsk());
        await page.waitForTimeout(300); // threshold is 0 — a working run would show the loader by now
        await expect(slot(page)).toBeHidden();
        await page.evaluate(() => (window as any).answerDialog());
        await expect(slot(page)).toBeVisible(); // the upload stage is working
        await expect(slot(page).locator('.we__loader')).toBeVisible();
        await page.evaluate(() => (window as any).releaseSlow());
        await expect(slot(page)).toBeHidden();
    });
});
