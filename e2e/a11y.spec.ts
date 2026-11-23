import { test, expect, load, pm, editor, selectText, caretAfter, markdown, type Page } from './fixtures';

// Accessibility (docs/accessibility.md): the editing surface is a named WAI-ARIA textbox with its
// read-only / disabled state. Fixture: test/a11y.html.

test.describe('a11y — editing surface', () => {
    test.beforeEach(async ({ page }) => load(page, 'a11y.html', { flag: 'fixtureReady' }));

    test('role="textbox" + aria-multiline, named by ariaLabels.editor by default', async ({ page }) => {
        const surface = pm(page);
        await expect(surface).toHaveAttribute('role', 'textbox');
        await expect(surface).toHaveAttribute('aria-multiline', 'true');
        await expect(surface).toHaveAttribute('aria-label', 'Rich text editor');
        await expect(surface).not.toHaveAttribute('aria-readonly', /.*/);
        await expect(surface).not.toHaveAttribute('aria-disabled', /.*/);
        await expect(editor(page).getByRole('textbox', { name: 'Rich text editor' })).toHaveCount(1);
    });

    test('the name follows labels (ariaLabels.editor)', async ({ page }) => {
        await page.evaluate(() => ((document.getElementById('subject') as any).labels = { 'ariaLabels.editor': 'Editor' }));
        await expect(pm(page)).toHaveAttribute('aria-label', 'Editor');
    });

    test('a <label for> names the surface (aria-labelledby by element reflection where supported)', async ({ page }) => {
        const surface = pm(page, 'labelled');
        await expect(surface).toHaveAttribute('aria-label', 'Release notes');
        const isReflected = await surface.evaluate((dom: any) => {
            if (!('ariaLabelledByElements' in dom)) return null;
            const els = dom.ariaLabelledByElements as Element[] | null;
            return !!els && els.length === 1 && els[0] === document.querySelector('label[for="labelled"]');
        });
        expect(isReflected === null || isReflected === true).toBe(true);
        await expect(editor(page, 'labelled').getByRole('textbox', { name: 'Release notes' })).toHaveCount(1);
    });

    test('clicking the <label for> focuses the editing surface; a disabled editor stays unfocused', async ({ page }) => {
        await page.click('label[for="labelled"]');
        await expect(pm(page, 'labelled')).toBeFocused();
        await page.evaluate(() => {
            const label = document.createElement('label');
            label.htmlFor = 'dis';
            label.textContent = 'Disabled one';
            document.body.append(label);
        });
        await page.click('label[for="dis"]');
        await expect(pm(page, 'dis')).not.toBeFocused();
    });

    test('a <label for> added / changed / removed after connect names the surface once it takes focus', async ({ page }) => {
        const surface = pm(page);
        await page.evaluate(() => {
            const label = document.createElement('label');
            label.htmlFor = 'subject';
            label.id = 'late';
            label.textContent = 'Late label';
            document.body.prepend(label);
        });
        await surface.focus();
        await expect(surface).toHaveAttribute('aria-label', 'Late label');
        await expect(editor(page).getByRole('textbox', { name: 'Late label' })).toHaveCount(1);
        await page.evaluate(() => (document.getElementById('late')!.textContent = 'Renamed label'));
        await surface.blur();
        await surface.focus();
        await expect(surface).toHaveAttribute('aria-label', 'Renamed label');
        await page.evaluate(() => document.getElementById('late')!.remove());
        await surface.blur();
        await surface.focus();
        await expect(surface).toHaveAttribute('aria-label', 'Rich text editor');
    });

    test('the host aria-label / aria-labelledby name the surface', async ({ page }) => {
        await expect(pm(page, 'named')).toHaveAttribute('aria-label', 'Comment body');
        await expect(pm(page, 'byref')).toHaveAttribute('aria-label', 'External heading');
    });

    test('read-only → aria-readonly; disabled → aria-disabled; both follow the flips', async ({ page }) => {
        await expect(pm(page, 'ro')).toHaveAttribute('aria-readonly', 'true');
        await expect(pm(page, 'ro')).not.toHaveAttribute('aria-disabled', /.*/);
        await expect(pm(page, 'dis')).toHaveAttribute('aria-disabled', 'true');
        await expect(pm(page, 'dis')).not.toHaveAttribute('aria-readonly', /.*/);

        await page.evaluate(() => {
            (document.getElementById('ro') as any).isReadonly = false;
            (document.getElementById('dis') as any).isDisabled = false;
        });
        await expect(pm(page, 'ro')).not.toHaveAttribute('aria-readonly', /.*/);
        await expect(pm(page, 'dis')).not.toHaveAttribute('aria-disabled', /.*/);

        await page.evaluate(() => ((document.getElementById('subject') as any).viewMode = 'preview'));
        await expect(pm(page)).toHaveAttribute('aria-readonly', 'true');
    });
});

const selectionBar = (page: Page) => page.locator('km-editor#subject .we-selection-toolbar');
const zone = (page: Page, id = 'subject') => page.locator(`km-editor#${id} .we-toolbar-zone`);
const menu = (page: Page) => page.locator('km-editor#subject .we-context-menu');

test.describe('a11y — keyboard openers', () => {
    test.beforeEach(async ({ page }) => load(page, 'a11y.html', { flag: 'fixtureReady' }));

    test('Alt+F10 focuses the selection toolbar; arrows rove; Escape returns with the selection kept', async ({ page }) => {
        await selectText(page, 'words');
        await expect(selectionBar(page)).toBeVisible();
        await expect(selectionBar(page).locator('[role="toolbar"]')).toHaveCount(1);
        await page.keyboard.press('Alt+F10');
        const buttons = selectionBar(page).locator('button:not(:disabled)');
        await expect(buttons.first()).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(buttons.nth(1)).toBeFocused();
        // A focus-shown tooltip takes the first Escape; wait for it, then two Escapes leave.
        await page.waitForTimeout(600);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(pm(page)).toBeFocused();
        // The selection survived the round trip: typing replaces it.
        await page.keyboard.type('X');
        expect(await markdown(page)).toContain('plain X here');
    });

    test('Alt+F10 activates a selection-toolbar button by keyboard', async ({ page }) => {
        await selectText(page, 'words');
        await page.keyboard.press('Alt+F10');
        await expect(selectionBar(page).locator('[data-action="bold"]')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(pm(page).locator('p strong')).toHaveText('words');
    });

    test('Alt+F10 with no selection focuses the static toolbar; Escape returns to the text', async ({ page }) => {
        await caretAfter(page, 'plain');
        await expect(selectionBar(page)).toBeHidden();
        await page.keyboard.press('Alt+F10');
        await expect(zone(page).locator('button:not(:disabled)').first()).toBeFocused();
        await page.keyboard.press('Escape');
        // A tooltip that showed on focus (400 ms delay) takes that Escape — the next one leaves.
        if (!(await pm(page).evaluate((dom) => (dom.getRootNode() as ShadowRoot).activeElement === dom))) {
            await page.keyboard.press('Escape');
        }
        await expect(pm(page)).toBeFocused();
        await page.keyboard.type('Y');
        expect(await markdown(page)).toContain('plainY words');
    });

    test('Shift+F10 opens the context menu at the caret, first item focused; Escape closes', async ({ page }) => {
        await caretAfter(page, 'plain');
        await page.keyboard.press('Shift+F10');
        await expect(menu(page)).toBeVisible();
        await expect(menu(page).locator('[role^="menuitem"]').first()).toBeFocused();
        const caret = await pm(page).evaluate(() => {
            const r = (document.getElementById('subject')!.shadowRoot as any).getSelection?.()?.getRangeAt(0)?.getBoundingClientRect();
            return r ? { x: r.left, y: r.bottom } : null;
        });
        const m = (await menu(page).boundingBox())!;
        if (caret) {
            expect(Math.abs(m.x - caret.x)).toBeLessThan(40);
            expect(Math.abs(m.y - caret.y)).toBeLessThan(40);
        }
        // The browser's own keyboard `contextmenu` right after is swallowed by core openMenu (no native menu, ours stays).
        const isPrevented = await pm(page).evaluate((dom) => !dom.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true })));
        expect(isPrevented).toBe(true);
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(pm(page)).toBeFocused();
    });

    test('the native keyboard contextmenu is swallowed by core openMenu; a right-click still opens the menu (G21)', async ({ page }) => {
        // Record every native contextmenu at the window (capture: before core's document listener decides).
        await page.evaluate(() => {
            const w = window as any;
            w.nativeMenus = [];
            window.addEventListener('contextmenu', (e) => w.nativeMenus.push(e), true);
        });
        const native = () =>
            page.evaluate(() => (window as any).nativeMenus.map((e: MouseEvent) => ({ button: e.button, isPrevented: e.defaultPrevented })));
        // The ContextMenu key: Chromium raises its trusted `contextmenu` (button -1) on KEYUP, after our keydown opened the menu.
        await caretAfter(page, 'plain');
        await page.keyboard.press('ContextMenu');
        await expect(menu(page)).toBeVisible();
        await expect(menu(page).locator('[role^="menuitem"]').first()).toBeFocused();
        await expect.poll(native).toEqual([{ button: -1, isPrevented: true }]);
        await expect(menu(page)).toBeVisible(); // not re-opened at the pointer, focus kept on the first item
        await expect(menu(page).locator('[role^="menuitem"]').first()).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();

        // Shift+F10: our keydown handler opens the menu (and prevents the key, so Chromium raises none); any that
        // comes is prevented.
        await page.evaluate(() => ((window as any).nativeMenus.length = 0));
        await caretAfter(page, 'plain');
        await page.keyboard.press('Shift+F10');
        await expect(menu(page)).toBeVisible();
        expect((await native()).every((e: { isPrevented: boolean }) => e.isPrevented)).toBe(true);

        // A right-click while it is open: a pointer menu — the editor opens its menu there (the native one prevented).
        await page.evaluate(() => ((window as any).nativeMenus.length = 0));
        const box = (await pm(page).locator('p').first().boundingBox())!;
        const before = (await menu(page).boundingBox())!;
        const px = box.x + box.width - 4;
        await page.mouse.click(px, box.y + box.height / 2, { button: 'right' });
        await expect.poll(native).toEqual([{ button: 2, isPrevented: true }]);
        await expect(menu(page)).toBeVisible();
        const m = (await menu(page).boundingBox())!;
        // Re-opened at the pointer (far right of the line, away from the caret): one of its edges is at the click.
        expect(Math.min(Math.abs(m.x - px), Math.abs(m.x + m.width - px))).toBeLessThan(40);
        expect(Math.abs(m.x - before.x)).toBeGreaterThan(100);
    });

    test('the ContextMenu key opens it too; read-only does not', async ({ page }) => {
        await caretAfter(page, 'plain');
        await page.keyboard.press('ContextMenu');
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();

        await pm(page, 'ro').focus();
        await page.keyboard.press('Shift+F10');
        await expect(page.locator('km-editor#ro .we-context-menu')).toHaveCount(0);
    });
});

test.describe('a11y — split view tabs', () => {
    test.beforeEach(async ({ page }) => load(page, 'a11y.html', { flag: 'fixtureReady' }));

    const tabs = (page: Page) => page.locator('km-editor#split .we-output-tabs');
    const tab = (page: Page, fmt: string) => tabs(page).locator(`[data-format="${fmt}"]`);
    const panel = (page: Page) => page.locator('km-editor#split .we-output-pre');

    test('tablist / tab / tabpanel with aria-selected, aria-controls, aria-labelledby; one tab stop', async ({ page }) => {
        await expect(tabs(page)).toHaveAttribute('role', 'tablist');
        await expect(tabs(page)).toHaveAttribute('aria-label', 'Output format');
        await expect(tabs(page).locator('[role="tab"]')).toHaveCount(3);
        // contentFormat defaults to markdown → the markdown tab is selected.
        await expect(tab(page, 'markdown')).toHaveAttribute('aria-selected', 'true');
        await expect(tab(page, 'html')).toHaveAttribute('aria-selected', 'false');
        await expect(tab(page, 'markdown')).toHaveAttribute('tabindex', '0');
        await expect(tab(page, 'html')).toHaveAttribute('tabindex', '-1');
        await expect(panel(page)).toHaveAttribute('role', 'tabpanel');
        await expect(panel(page)).toHaveAttribute('aria-labelledby', 'we-output-tab-markdown');
        await expect(tab(page, 'markdown')).toHaveAttribute('aria-controls', 'we-output-panel');
        await expect(editor(page, 'split').getByRole('tabpanel', { name: 'Markdown' })).toHaveCount(1);
    });

    test('arrows move and select (wrapping), Home / End; the panel follows', async ({ page }) => {
        await tab(page, 'markdown').focus();
        await page.keyboard.press('ArrowRight');
        await expect(tab(page, 'html')).toBeFocused();
        await expect(tab(page, 'html')).toHaveAttribute('aria-selected', 'true');
        await expect(panel(page)).toContainText('<strong>text</strong>');
        await expect(panel(page)).toHaveAttribute('aria-labelledby', 'we-output-tab-html');
        await page.keyboard.press('End');
        await expect(tab(page, 'json')).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('ArrowRight'); // wraps
        await expect(tab(page, 'markdown')).toBeFocused();
        await expect(tab(page, 'markdown')).toHaveAttribute('aria-selected', 'true');
        await expect(panel(page)).toContainText('split **text**');
        // Tab moves on to the panel (focusable), not the other tabs.
        await page.keyboard.press('Tab');
        await expect(panel(page)).toBeFocused();
    });

    test('a click selects too', async ({ page }) => {
        await tab(page, 'json').click();
        await expect(tab(page, 'json')).toHaveAttribute('aria-selected', 'true');
        await expect(tab(page, 'json')).toHaveAttribute('tabindex', '0');
        await expect(tab(page, 'markdown')).toHaveAttribute('aria-selected', 'false');
    });
});

test.describe('a11y — focus ring', () => {
    test.beforeEach(async ({ page }) => load(page, 'a11y.html', { flag: 'fixtureReady' }));

    const outline = (loc: import('@playwright/test').Locator) =>
        loc.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineColor}`; });

    test('keyboard focus draws --we-focus-outline (base focused outline) on buttons, tabs, the output panel', async ({ page }) => {
        await page.evaluate(() => document.getElementById('subject')!.style.setProperty('--we-focus-outline', '2px solid rgb(255, 0, 0)'));
        await pm(page).click();
        await page.keyboard.press('Alt+F10');
        const button = page.locator('km-editor#subject .we-toolbar-zone button:focus');
        await expect(button).toHaveCount(1);
        expect(await outline(button)).toBe('solid rgb(255, 0, 0)');

        const tabs = page.locator('km-editor#split .we-output-tabs');
        await tabs.locator('[aria-selected="true"]').focus();
        await page.keyboard.press('ArrowRight');
        expect(await outline(tabs.locator('[aria-selected="true"]'))).toMatch(/^solid /);
        await page.keyboard.press('Tab');
        await expect(page.locator('km-editor#split .we-output-pre')).toBeFocused();
        expect(await outline(page.locator('km-editor#split .we-output-pre'))).toMatch(/^solid /);
    });

    test('a mouse click on a tab draws no ring (:focus-visible only)', async ({ page }) => {
        const json = page.locator('km-editor#split .we-output-tabs [data-format="json"]');
        await json.click();
        await expect(json).toBeFocused();
        expect(await outline(json)).toMatch(/^none /);
    });
});

test.describe('a11y — announcements', () => {
    test.beforeEach(async ({ page }) => load(page, 'a11y.html', { flag: 'fixtureReady' }));

    const region = (page: Page) => page.locator('[data-km-announcer="polite"]');

    test('a view-mode switch is announced (core announce()); a plain viewMode assignment is not', async ({ page }) => {
        await page.locator('km-editor#subject .we-toolbar-zone [data-action="view-split"]').click();
        await expect(region(page)).toHaveText('Split view');
        await page.evaluate(() => (document.getElementById('subject') as any).setViewMode('preview'));
        await expect(region(page)).toHaveText('Preview');
        await page.evaluate(() => ((document.getElementById('subject') as any).viewMode = 'edit'));
        await page.waitForTimeout(200);
        await expect(region(page)).toHaveText('Preview');
    });

    test("labels can reword or silence it ('')", async ({ page }) => {
        await page.evaluate(() => ((document.getElementById('subject') as any).labels = { 'ariaLabels.viewModeSplit': '' , 'ariaLabels.viewModeEdit': 'Editing' }));
        await page.evaluate(() => (document.getElementById('subject') as any).setViewMode('split'));
        await page.waitForTimeout(200);
        await expect(region(page)).toHaveCount(0);
        await page.evaluate(() => (document.getElementById('subject') as any).setViewMode('edit'));
        await expect(region(page)).toHaveText('Editing');
    });

    test('the status bar is not a live region — typing announces nothing', async ({ page }) => {
        const bar = page.locator('km-editor#subject .we-statusbar').first();
        await expect(bar).toBeVisible();
        await expect(bar).not.toHaveAttribute('aria-live', /.*/);
        await expect(bar).not.toHaveAttribute('role', /.*/);
        await caretAfter(page, 'plain');
        await page.keyboard.type(' more');
        await page.waitForTimeout(200);
        await expect(page.locator('[data-km-announcer]')).toHaveCount(0);
    });
});
