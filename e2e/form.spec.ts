import { test, expect, load, pm, editor, markdown, caretAfter } from './fixtures';

// Form convention (like web-multiselect): `name` → a light-DOM hidden input that
// carries the live value in `contentFormat`; form reset → defaultValue; a disabled
// <fieldset> keeps it out of the submission. Plus the empty-document placeholder.
// Fixture: test/form.html.

const body = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).formBody() as string[]);

test.describe('form', () => {
    test.beforeEach(async ({ page }) => load(page, 'form.html', { flag: 'fixtureReady' }));

    test('submits the live value under `name` (one entry), in contentFormat', async ({ page }) => {
        expect(await body(page)).toEqual(['# Initial']);
        await caretAfter(page, 'Initial');
        await page.keyboard.type(' edited');
        expect(await body(page)).toEqual(['# Initial edited']);
        await editor(page).evaluate((el: any) => (el.contentFormat = 'html'));
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

    test('getValueFormatCallback formats the submitted value only (el.value stays the document)', async ({ page }) => {
        await editor(page).evaluate((el: any) => {
            el.getValueFormatCallback = ({ value }: { value: string }) => value.toUpperCase();
        });
        await expect.poll(() => body(page)).toEqual(['# INITIAL']);
        await caretAfter(page, 'Initial');
        await page.keyboard.type(' edited');
        expect(await body(page)).toEqual(['# INITIAL EDITED']);
        expect(await editor(page).evaluate((el: any) => el.value)).toBe('# Initial edited');
    });

    test('a throwing getValueFormatCallback blocks the submit (invalid, value-format-error); a working one recovers', async ({ page }) => {
        const probe = () => page.evaluate(() => ({ submits: (window as any).submits, invalids: (window as any).invalids }));
        const requestSubmit = () => page.evaluate(() => (document.getElementById('form') as HTMLFormElement).requestSubmit());
        await editor(page).evaluate((el: any) => {
            const seen: string[] = [];
            (window as any).fmtErrors = seen;
            el.addEventListener('value-format-error', (e: CustomEvent) => seen.push(`${(e.detail.error as Error).message}|${e.detail.value}`));
            el.getValueFormatCallback = () => {
                throw new Error('boom');
            };
        });
        await expect.poll(() => body(page)).toEqual(['']);
        expect(await page.evaluate(() => (window as any).fmtErrors)).toEqual(['boom|# Initial']);
        const state = await editor(page).evaluate((el: any) => ({
            isValid: el.checkValidity(),
            customError: el.validity.customError,
            message: el.validationMessage,
            matches: el.matches(':invalid'),
        }));
        expect(state).toEqual({ isValid: false, customError: true, message: 'The value could not be formatted.', matches: true });
        await requestSubmit();
        // checkValidity() above fired one `invalid`, the blocked submit another; no submit.
        expect(await probe()).toEqual({ submits: 0, invalids: 2 });

        await editor(page).evaluate((el: any) => (el.getValueFormatCallback = ({ value }: { value: string }) => value.toUpperCase()));
        await expect.poll(() => body(page)).toEqual(['# INITIAL']);
        expect(await editor(page).evaluate((el: any) => el.checkValidity() && el.validationMessage === '')).toBe(true);
        await requestSubmit();
        expect(await probe()).toEqual({ submits: 1, invalids: 2 });
    });

    test('<form novalidate> submits an empty value while getValueFormatCallback throws', async ({ page }) => {
        await page.evaluate(() => document.getElementById('form')!.setAttribute('novalidate', ''));
        await editor(page).evaluate((el: any) => {
            el.getValueFormatCallback = () => {
                throw new Error('boom');
            };
        });
        await expect.poll(() => body(page)).toEqual(['']);
        await page.evaluate(() => (document.getElementById('form') as HTMLFormElement).requestSubmit());
        expect(await page.evaluate(() => (window as any).submits)).toBe(1);
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
