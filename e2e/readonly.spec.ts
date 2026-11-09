import { test, expect, load, pm, editor, markdown, type Page } from './fixtures';

// readonly: typing ignored, editing toolbar hidden (only the view-mode group stays), native context menu (no custom menu);
// removing the attribute re-enables. Fixture: test/readonly.html
// (`<km-editor readonly value="# Locked\n\nbody text">`).

const menu = (page: Page) => page.locator('km-editor#subject .we-context-menu');
const toolbar = (page: Page) => page.locator('km-editor#subject .we-toolbar-zone');
// Editing off keeps only the view-mode group (the way out of `preview`).
const expectOnlyViewGroup = async (page: Page) => {
    await expect(toolbar(page).locator('.we-group:visible')).toHaveCount(1);
    await expect(toolbar(page).locator('.we-group:visible')).toHaveAttribute('data-group', 'view');
};

test.describe('readonly', () => {
    test.beforeEach(async ({ page }) => load(page, 'readonly.html', { flag: 'fixtureReady' }));

    test('renders the content but is not editable; typing is ignored', async ({ page }) => {
        await expect(pm(page).locator('h1')).toHaveText('Locked');
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await pm(page).locator('p').click();
        await page.keyboard.type('nope');
        await page.keyboard.press('Control+b');
        expect(await markdown(page)).toBe('# Locked\n\nbody text');
    });

    test('editing toolbar groups are hidden; the view-mode group stays', async ({ page }) => {
        await expectOnlyViewGroup(page);
    });

    test('right-click does not open the custom context menu (native menu not prevented)', async ({ page }) => {
        const prevented = await pm(page)
            .locator('p')
            .evaluate((p) => {
                const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: 10, clientY: 10 });
                p.dispatchEvent(e);
                return e.defaultPrevented;
            });
        expect(prevented).toBe(false);
        await expect(menu(page)).toBeHidden();
    });

    test('removing the attribute re-enables editing, toolbar and context menu', async ({ page }) => {
        await editor(page).evaluate((el) => el.removeAttribute('readonly'));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await expect(toolbar(page)).toBeVisible();
        await pm(page).locator('p').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page)).toBe('# Locked\n\nbody text!');
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
    });

    test('isReadonly property toggles the same way', async ({ page }) => {
        await editor(page).evaluate((el: any) => (el.isReadonly = false));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await editor(page).evaluate((el: any) => (el.isReadonly = true));
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await expectOnlyViewGroup(page);
    });

    test('readonly reflects: attribute → property false → editable, attribute removed', async ({ page }) => {
        expect(await editor(page).evaluate((el: any) => el.isReadonly)).toBe(true);
        await editor(page).evaluate((el: any) => (el.isReadonly = false));
        await expect(editor(page)).not.toHaveAttribute('readonly');
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await editor(page).evaluate((el: any) => (el.isReadonly = true));
        await expect(editor(page)).toHaveAttribute('readonly', '');
    });

    // Core SPEC §6.4: readonly stays focusable / navigable / copyable (native semantics).
    test('the read-only surface is reachable by Tab; select-all + copy work from the keyboard', async ({ page }) => {
        const isSurfaceFocused = () =>
            page.evaluate(() => {
                const el = document.getElementById('subject')!;
                return document.activeElement === el && el.shadowRoot!.activeElement === el.shadowRoot!.querySelector('.ProseMirror');
            });
        let isReached = false;
        for (let i = 0; i < 10 && !isReached; i++) {
            await page.keyboard.press('Tab');
            isReached = await isSurfaceFocused();
        }
        expect(isReached).toBe(true);
        // Select-all selects the document (the shadow-aware DOM selection) …
        await page.keyboard.press('ControlOrMeta+a');
        const selected = await page.evaluate(() => {
            const root = document.getElementById('subject')!.shadowRoot as ShadowRoot & { getSelection?: () => Selection | null };
            return String((root.getSelection ? root.getSelection() : null) ?? document.getSelection()).replace(/\s+/g, ' ');
        });
        expect(selected).toBe('Locked body text');
        // … and copy goes through: ProseMirror fills the clipboard, or the browser copies the selection natively.
        await page.evaluate(() => {
            (window as any).copied = null;
            document.addEventListener('copy', (e) => {
                (window as any).copied = e.defaultPrevented ? (e.clipboardData?.getData('text/plain') ?? '') : 'native';
            });
        });
        await page.keyboard.press('ControlOrMeta+c');
        await expect.poll(() => page.evaluate(() => (window as any).copied)).toMatch(/^(native|Locked\s+body text)$/);
        expect(await markdown(page)).toBe('# Locked\n\nbody text');
    });

    test('content API still works while read-only (setValue)', async ({ page }) => {
        await editor(page).evaluate((el: any) => el.setValue('# Replaced'));
        await expect(pm(page).locator('h1')).toHaveText('Replaced');
    });
});

test.describe('disabled', () => {
    test.beforeEach(async ({ page }) => load(page, 'readonly.html', { flag: 'fixtureReady' }));
    const dis = (page: Page) => page.locator('km-editor#dis');
    const disPm = (page: Page) => page.locator('km-editor#dis .ProseMirror');
    const disRoot = (page: Page) => page.locator('km-editor#dis [part="container"]');

    test('disabled attribute: not editable, the surface is inert, toolbar hidden', async ({ page }) => {
        await expect(disPm(page).locator('h1')).toHaveText('Off');
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'false');
        await expect(disRoot(page)).toHaveAttribute('inert', '');
        await expect(page.locator('km-editor#dis .we-toolbar-zone')).toBeHidden();
        // Not focusable (unlike read-only, whose surface is in the tab order).
        const isFocused = await dis(page).evaluate((el) => {
            const surface = el.shadowRoot!.querySelector('.ProseMirror') as HTMLElement;
            surface.focus();
            return el.shadowRoot!.activeElement === surface;
        });
        expect(isFocused).toBe(false);
    });

    // Core SPEC §6.4: disabled blocks the user, not code — calls from code still work.
    test('calls from code still work while disabled (setValue, controller.runCommand)', async ({ page }) => {
        const html = await dis(page).evaluate((el: any) => {
            el.setValue('word');
            el.controller.runCommand('bullet-list');
            return el.getHTML();
        });
        expect(html).toContain('<ul');
        expect(html).toContain('word');
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'false');
    });

    test('attribute → property false → enabled (isDisabled reflects; not stuck by formDisabledCallback)', async ({ page }) => {
        expect(await dis(page).evaluate((el: any) => el.isDisabled)).toBe(true);
        await dis(page).evaluate((el: any) => (el.isDisabled = false));
        await expect(dis(page)).not.toHaveAttribute('disabled');
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'true');
        await expect(disRoot(page)).not.toHaveAttribute('inert');
        await disPm(page).locator('p').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page, 'dis')).toBe('# Off\n\ndisabled body!');
        await dis(page).evaluate((el: any) => (el.isDisabled = true));
        await expect(dis(page)).toHaveAttribute('disabled', '');
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'false');
    });

    test('<fieldset disabled> disables it without touching isDisabled; re-enabling restores', async ({ page }) => {
        await dis(page).evaluate((el: any) => (el.isDisabled = false));
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'true');
        await page.evaluate(() => document.getElementById('fs')!.setAttribute('disabled', ''));
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'false');
        await expect(disRoot(page)).toHaveAttribute('inert', '');
        expect(await dis(page).evaluate((el: any) => [el.isDisabled, el.hasAttribute('disabled'), el.form?.id])).toEqual([false, false, 'form']);
        await page.evaluate(() => document.getElementById('fs')!.removeAttribute('disabled'));
        await expect(disPm(page)).toHaveAttribute('contenteditable', 'true');
        await expect(disRoot(page)).not.toHaveAttribute('inert');
    });
});
