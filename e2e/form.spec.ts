import { test, expect, load, pm, editor, markdown, caretAfter } from './fixtures';

// Form convention (like web-multiselect): `name` → a light-DOM hidden input that
// carries the live value in `valueFormat`; form reset → defaultValue; a disabled
// <fieldset> keeps it out of the submission. Plus the empty-document placeholder.
// Fixture: test/form.html.

const body = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).formBody() as string[]);

test.describe('form', () => {
    test.beforeEach(async ({ page }) => load(page, 'form.html', { flag: 'fixtureReady' }));

    test('submits the live value under `name` (one entry), in valueFormat', async ({ page }) => {
        expect(await body(page)).toEqual(['# Initial']);
        await caretAfter(page, 'Initial');
        await page.keyboard.type(' edited');
        expect(await body(page)).toEqual(['# Initial edited']);
        await editor(page).evaluate((el: any) => (el.valueFormat = 'html'));
        await expect.poll(() => body(page)).toEqual(['<h1>Initial edited</h1>']);
    });

    test('form.reset() restores defaultValue', async ({ page }) => {
        await caretAfter(page, 'Initial');
        await page.keyboard.type(' edited');
        await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).reset());
        expect(await markdown(page)).toBe('# Initial');
        expect(await body(page)).toEqual(['# Initial']);
    });

    test('<fieldset disabled> keeps it out of the submission; re-enabling restores', async ({ page }) => {
        await page.evaluate(() => document.getElementById('fs')!.setAttribute('disabled', ''));
        await expect.poll(() => body(page)).toEqual([]);
        await page.evaluate(() => document.getElementById('fs')!.removeAttribute('disabled'));
        await expect.poll(() => body(page)).toEqual(['# Initial']);
    });

    test('no value → empty document; labels.placeholder shows while empty', async ({ page }) => {
        const ph = pm(page, 'empty').locator('.we-placeholder');
        await expect(ph).toHaveAttribute('data-placeholder', 'Start writing…');
        await pm(page, 'empty').click();
        await page.keyboard.type('x');
        await expect(ph).toHaveCount(0);
        await page.keyboard.press('Backspace');
        await expect(ph).toHaveCount(1);
    });
});
