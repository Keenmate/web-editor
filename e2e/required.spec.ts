import { test, expect, load, pm, editor, type Page } from './fixtures';

/**
 * `required` through core validity (SPEC §6.6, rulebook C-CA-41). Fixture: test/required.html.
 * Empty = no content: no non-whitespace text and no non-text node (image, table, …). Required + empty →
 * `valueMissing` (`errors.required`), submit blocked; read-only / disabled → valid; `:state(required)` +
 * `aria-required` follow `required`; the bubble anchors on the editing surface.
 */

type Validity = { valueMissing: boolean; valid: boolean; message: string };

async function validity(page: Page, id = 'subject'): Promise<Validity> {
    return editor(page, id).evaluate(async (el: any) => {
        await el.whenSettled();
        return { valueMissing: el.validity.valueMissing, valid: el.validity.valid, message: el.validationMessage };
    });
}

const submits = (page: Page) => page.evaluate(() => (window as any).submits as number);

test.describe('required', () => {
    test.beforeEach(async ({ page }) => load(page, 'required.html', { flag: 'fixtureReady' }));

    test('empty → valueMissing with errors.required, checkValidity() false, submit blocked', async ({ page }) => {
        expect(await validity(page)).toEqual({ valueMissing: true, valid: false, message: 'This field is required.' });
        expect(await editor(page).evaluate((el: any) => el.checkValidity())).toBe(false);
        await page.locator('#submit').click();
        expect(await submits(page)).toBe(0);
        // Seeded content → valid from the first build.
        expect((await validity(page, 'seeded')).valid).toBe(true);
    });

    test('typing clears it; whitespace only stays empty; deleting brings it back; form reset brings it back', async ({ page }) => {
        await pm(page).click();
        await page.keyboard.type('   ');
        expect((await validity(page)).valueMissing).toBe(true);
        await page.keyboard.type('Hello');
        expect((await validity(page)).valid).toBe(true);
        await page.locator('#submit').click();
        expect(await submits(page)).toBe(1);
        await pm(page).click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        expect((await validity(page)).valueMissing).toBe(true);
        await editor(page).evaluate((el: any) => (el.value = 'Assigned'));
        expect((await validity(page)).valid).toBe(true);
        await page.locator('#reset').click();
        await expect.poll(async () => (await validity(page)).valueMissing).toBe(true);
    });

    test('non-text content counts: an image or a table alone is not empty', async ({ page }) => {
        await editor(page).evaluate((el: any) => { el.contentFormat = 'html'; el.value = '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""></p>'; });
        expect((await validity(page)).valid).toBe(true);
        await editor(page).evaluate((el: any) => (el.value = '<table><tr><td></td></tr></table>'));
        expect((await validity(page)).valid).toBe(true);
        await editor(page).evaluate((el: any) => (el.value = '<h1> </h1><ul><li></li></ul>'));
        expect((await validity(page)).valueMissing).toBe(true);
    });

    test(':state(required), aria-required and the reflected attribute follow isRequired', async ({ page }) => {
        const el = editor(page);
        expect(await el.evaluate((e: any) => e.matches(':state(required)'))).toBe(true);
        expect(await el.evaluate((e: any) => e.internals?.ariaRequired)).toBe('true');
        // The focused textbox carries it too (the host's internals ARIA isn't on the element that takes focus).
        await expect(pm(page)).toHaveAttribute('aria-required', 'true');
        await el.evaluate(async (e: any) => { e.isRequired = false; await e.whenSettled(); });
        expect(await el.evaluate((e: any) => e.matches(':state(required)'))).toBe(false);
        await expect(pm(page)).not.toHaveAttribute('aria-required', /.*/);
        expect(await el.evaluate((e: any) => e.hasAttribute('required'))).toBe(false);
        expect((await validity(page)).valid).toBe(true);
        await el.evaluate(async (e: any) => { e.setAttribute('required', ''); await e.whenSettled(); });
        expect(await el.evaluate((e: any) => e.isRequired)).toBe(true);
        expect((await validity(page)).valueMissing).toBe(true);
        await expect(pm(page)).toHaveAttribute('aria-required', 'true');
    });

    test('read-only → valid; disabled → valid; a disabled <fieldset> → valid', async ({ page }) => {
        const el = editor(page);
        await el.evaluate(async (e: any) => { e.isReadonly = true; await e.whenSettled(); });
        expect(await el.evaluate((e: any) => e.checkValidity())).toBe(true);
        await el.evaluate(async (e: any) => { e.isReadonly = false; e.isDisabled = true; await e.whenSettled(); });
        expect(await el.evaluate((e: any) => e.checkValidity())).toBe(true);
        await el.evaluate(async (e: any) => { e.isDisabled = false; await e.whenSettled(); });
        expect((await validity(page)).valueMissing).toBe(true);
        await page.evaluate(() => {
            const form = document.getElementById('form')!;
            const fs = document.createElement('fieldset');
            form.insertBefore(fs, form.firstChild);
            fs.appendChild(document.getElementById('subject')!);
            fs.disabled = true;
        });
        await expect.poll(() => el.evaluate((e: any) => e.checkValidity())).toBe(true);
    });

    test('labels / translate errors.required; the bubble anchors on the surface (no "anchor rejected"), also after a plugins swap', async ({ page }) => {
        const warnings: string[] = [];
        page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
        await editor(page).evaluate(async (el: any) => { el.labels = { 'errors.required': 'Napište text.' }; await el.whenSettled(); });
        expect((await validity(page)).message).toBe('Napište text.');
        expect(await editor(page).evaluate((el: any) => el.reportValidity())).toBe(false);
        await editor(page).evaluate(async (el: any) => { el.plugins = []; await el.whenSettled(); });
        expect(await editor(page).evaluate((el: any) => el.reportValidity())).toBe(false);
        expect(warnings.filter((w) => w.includes('anchor rejected'))).toEqual([]);
    });
});
