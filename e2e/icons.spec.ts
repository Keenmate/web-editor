import { test, expect, load, editor, pm, selectText, markdown, toolbarButton } from './fixtures';

const menu = (page: any) => page.locator('km-editor#subject .we-context-menu');

// Item icons through core renderIcon (SPEC §12.33): the element's own `renderIconCallback` beats the page-wide
// `window.components.renderIconCallback`; `null` falls through to it; an ASCII class list is an icon-font
// `<i class="we__icon …">`; a reserved built-in name is never sent to a hook. Fixture: test/icons.html.

const button = (page: any, id: string) => page.locator(`km-editor#subject .we-toolbar-zone [data-id="${id}"]`);

test.describe('icons', () => {
    test.beforeEach(async ({ page }) => load(page, 'icons.html', { flag: 'fixtureReady' }));

    test('the element hook beats the page hook, with the component context', async ({ page }) => {
        const own = button(page, 'own').locator('b.own-icon');
        await expect(own).toHaveText('mine');
        await expect(own).toHaveAttribute('data-component', 'km-editor');
        await expect(own).toHaveAttribute('data-item', 'own');
        await expect(button(page, 'own').locator('b.page-icon')).toHaveCount(0);
    });

    test('the element hook returning null falls through to the page hook', async ({ page }) => {
        await expect(button(page, 'shared').locator('b.page-icon')).toHaveText('shared');
    });

    test('a class list renders an icon-font <i class="we__icon …">', async ({ page }) => {
        const i = button(page, 'font').locator('i.we__icon');
        await expect(i).toHaveClass('we__icon fa-solid fa-star');
        await expect(i).toHaveAttribute('aria-hidden', 'true');
        expect(await i.evaluate((n) => getComputedStyle(n).flexShrink)).toBe('0');
    });

    test('a built-in name is masked and never reaches a hook', async ({ page }) => {
        await expect(button(page, 'builtin').locator('.km-icon')).toHaveCount(1);
        const calls = await page.evaluate(() => (window as any).iconCalls);
        expect(calls.element).not.toContain('check');
        expect(calls.page).not.toContain('check');
        expect(calls.element).toContain('mine');
    });

    test('a context-menu item icon is answered by the element hook (ctx.item present)', async ({ page }) => {
        await pm(page).locator('p').click({ button: 'right' });
        const icon = page.locator('km-editor#subject .we-context-menu b.own-menu-icon');
        await expect(icon).toHaveText('M');
        await expect(icon).toHaveAttribute('data-component', 'km-editor');
        await expect(icon).toHaveAttribute('data-item', 'menu-own');
    });

    test('assigning renderIconCallback re-renders the icons live', async ({ page }) => {
        await editor(page).evaluate(async (el: any) => {
            el.renderIconCallback = (name: string) => (name === 'shared' ? '<b class="swapped">S</b>' : null);
            await el.whenSettled();
        });
        await expect(button(page, 'shared').locator('b.swapped')).toHaveText('S');
        await expect(button(page, 'own').locator('b.page-icon')).toHaveText('mine');
    });
    test('assigning the page-wide hook later repaints the icons in place (C-CA-40), keeping state', async ({ page }) => {
        // Undo history + a text selection (shows the selection toolbar) + focus in the document.
        await pm(page).click();
        await page.keyboard.press('End');
        await page.keyboard.type(' more');
        await selectText(page, 'words');
        await expect(page.locator('km-editor#subject .we-selection-toolbar')).toBeVisible();
        await expect(button(page, 'shared').locator('b.page-icon')).toHaveText('shared');

        await page.evaluate(() => {
            (window as any).components.renderIconCallback = (name: string) =>
                name === 'shared' ? '<b data-test-icon>x</b>' : null;
        });
        await expect(button(page, 'shared').locator('b[data-test-icon]')).toHaveText('x');
        await expect(button(page, 'shared').locator('b.page-icon')).toHaveCount(0);
        await expect(button(page, 'own').locator('b.own-icon')).toHaveText('mine'); // the element hook still wins

        // Kept: the document, the selection (+ its toolbar), focus, undo history.
        expect(await markdown(page)).toContain('plain words here more');
        const state = await editor(page).evaluate((el: any) => {
            let selected = '';
            el.controller.runCommand((s: any) => {
                selected = s.doc.textBetween(s.selection.from, s.selection.to);
                return true;
            });
            return { selected, isFocused: el.shadowRoot.activeElement?.classList.contains('ProseMirror') };
        });
        expect(state).toEqual({ selected: 'words', isFocused: true });
        await expect(page.locator('km-editor#subject .we-selection-toolbar')).toBeVisible();
        await expect(toolbarButton(page, 'undo')).toBeEnabled();

        await page.evaluate(() => { (window as any).components.renderIconCallback = null; });
    });

    // Icons by name (rulebook C-CA-42): the built-in commands carry NAMES (`bold`, `insertLink`, …), answered last by the
    // editor's own SVGs (core renderIcon `defaults` / openMenu `iconDefaults`); `el.icons` and the page-wide
    // `window.components.icons` replace one by name — toolbar and context menu alike.
    test('the built-in command icons are the editor SVGs by name (no core built-in glyph)', async ({ page }) => {
        for (const action of ['bold', 'undo', 'insert-link', 'insert-table']) {
            await expect(toolbarButton(page, action).locator('svg')).toHaveCount(1);
            await expect(toolbarButton(page, action).locator('.km-icon')).toHaveCount(0);
        }
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page).locator('[data-action="bold"] svg')).toHaveCount(1);
        await expect(menu(page).locator('[data-action="insert-link"] svg')).toHaveCount(1);
    });

    test('el.icons replaces an editor icon by name, live, in the toolbar and the context menu', async ({ page }) => {
        await editor(page).evaluate(async (el: any) => {
            el.icons = { bold: '<b class="mapped">B</b>', italic: 'fa-solid fa-italic' };
            await el.whenSettled();
        });
        await expect(toolbarButton(page, 'bold').locator('b.mapped')).toHaveText('B');
        await expect(toolbarButton(page, 'bold').locator('svg')).toHaveCount(0);
        await expect(toolbarButton(page, 'italic').locator('i.we__icon')).toHaveClass('we__icon fa-solid fa-italic');
        await expect(toolbarButton(page, 'underline').locator('svg')).toHaveCount(1); // unmapped → the default
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page).locator('[data-action="bold"] b.mapped')).toHaveText('B');
        await page.keyboard.press('Escape');

        // Removing the map (the JSON attribute path too) restores the defaults.
        await editor(page).evaluate(async (el: any) => {
            el.setAttribute('icons', '{"redo":"<b class=\\"attr\\">R</b>"}');
            await el.whenSettled();
        });
        await expect(toolbarButton(page, 'redo').locator('b.attr')).toHaveText('R');
        await expect(toolbarButton(page, 'bold').locator('svg')).toHaveCount(1);
    });

    test('window.components.icons ("km-editor.<name>" before "<name>") replaces an icon; el.icons wins over it', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).components.icons = {
                'km-editor.undo': '<b class="page-tag">U</b>',
                undo: '<b class="page-flat">u</b>',
                redo: '<b class="page-flat">r</b>',
                bold: '<b class="page-flat">b</b>',
            };
        });
        await expect(toolbarButton(page, 'undo').locator('b.page-tag')).toHaveText('U');
        await expect(toolbarButton(page, 'redo').locator('b.page-flat')).toHaveText('r');
        await editor(page).evaluate(async (el: any) => {
            el.icons = { bold: '<b class="own">B</b>' };
            await el.whenSettled();
        });
        await expect(toolbarButton(page, 'bold').locator('b.own')).toHaveText('B');
        await pm(page).locator('p').click({ button: 'right' });
        await expect(menu(page).locator('[data-action="undo"] b.page-tag')).toHaveText('U');
        await expect(menu(page).locator('[data-action="bold"] b.own')).toHaveText('B');
        await page.keyboard.press('Escape');
        await page.evaluate(() => { (window as any).components.icons = undefined; });
        await expect(toolbarButton(page, 'undo').locator('svg')).toHaveCount(1);
    });
});
