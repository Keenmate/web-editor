import { test, expect, load, pm, editor, markdown, selectText, caretAfter, logLines, clearLog, type Page } from './fixtures';

// View modes: edit / split / preview / inline (assigning is silent — no `view-mode-change`; setViewMode() /
// the view-mode toolbar items fire it); split output is
// live; preview is read-only; switching keeps the document + selection.
// Fixture: test/modes.html (value "# Title\n\nplain words here", #target paragraph).

const setMode = (page: Page, mode: string) =>
    page.evaluate((m) => ((document.getElementById('subject') as any).viewMode = m), mode);
const root = (page: Page) => page.locator('km-editor#subject .we-root');
const output = (page: Page) => page.locator('km-editor#subject .we-output-pre');

test.describe('modes', () => {
    test.beforeEach(async ({ page }) => load(page, 'modes.html', { flag: 'fixtureReady' }));

    test('default mode is edit, no output panel', async ({ page }) => {
        // Core reflects explicit values only — an untouched default leaves no attribute.
        expect(await editor(page).evaluate((el: any) => el.viewMode)).toBe('edit');
        await expect(editor(page)).not.toHaveAttribute('view-mode');
        await expect(root(page)).toHaveClass(/we-edit/);
        await expect(page.locator('km-editor#subject .we-output')).toHaveCount(0);
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
    });

    test('each switch reflects the attribute; assignment is silent (no view-mode-change)', async ({ page }) => {
        await clearLog(page, 'modes');
        for (const m of ['split', 'preview', 'inline', 'edit']) {
            await setMode(page, m);
            await expect(editor(page)).toHaveAttribute('view-mode', m);
            await expect(root(page)).toHaveClass(new RegExp('we-' + m));
        }
        await page.evaluate(() => document.getElementById('subject')!.setAttribute('view-mode', 'split'));
        await expect(root(page)).toHaveClass(/we-split/);
        expect((await logLines(page, 'modes')).filter((l) => l.startsWith('view-mode-change'))).toEqual([]);
    });

    test('setViewMode() fires view-mode-change { viewMode, oldViewMode, source: api }; isSilent does not', async ({ page }) => {
        await clearLog(page, 'modes');
        await editor(page).evaluate((el: any) => el.setViewMode('split'));
        await expect(root(page)).toHaveClass(/we-split/);
        await expect(editor(page)).toHaveAttribute('view-mode', 'split');
        await editor(page).evaluate((el: any) => el.controller.setViewMode('preview'));
        await editor(page).evaluate((el: any) => el.setViewMode('preview')); // already active
        await editor(page).evaluate((el: any) => el.setViewMode('edit', { isSilent: true }));
        await expect(root(page)).toHaveClass(/we-edit/);
        expect((await logLines(page, 'modes')).filter((l) => l.startsWith('view-mode-change'))).toEqual([
            'view-mode-change:split:edit:api',
            'view-mode-change:preview:split:api',
        ]);
    });

    test('view-mode toolbar items: last group, radio toggled state, click switches with source user', async ({ page }) => {
        const zone = page.locator('km-editor#subject .we-toolbar-zone');
        const btn = (a: string) => zone.locator(`[data-action="${a}"]`);
        await expect(zone.locator('.we-group').last()).toHaveAttribute('data-group', 'view');
        await expect(btn('view-edit')).toHaveText('Edit');
        await expect(btn('view-edit')).toHaveAttribute('aria-pressed', 'true');
        await clearLog(page, 'modes');
        await btn('view-split').click();
        await expect(root(page)).toHaveClass(/we-split/);
        await expect(btn('view-split')).toHaveAttribute('aria-pressed', 'true');
        await expect(btn('view-edit')).not.toHaveAttribute('aria-pressed');
        // Preview: editing groups go, the view group stays — the way back.
        await btn('view-preview').click();
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await expect(zone).toBeVisible();
        await expect(zone.locator('[data-group="format"]')).toBeHidden();
        await btn('view-edit').click();
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        expect((await logLines(page, 'modes')).filter((l) => l.startsWith('view-mode-change'))).toEqual([
            'view-mode-change:split:edit:user',
            'view-mode-change:preview:split:user',
            'view-mode-change:edit:preview:user',
        ]);
        // A silent assignment still moves the toggled state.
        await setMode(page, 'split');
        await expect(btn('view-split')).toHaveAttribute('aria-pressed', 'true');
        // Inline: the view group is not shown.
        await setMode(page, 'inline');
        await expect(btn('view-edit')).toHaveCount(0);
    });

    test('split: output panel shows the active format and updates live; tabs switch format', async ({ page }) => {
        await setMode(page, 'split');
        await expect(output(page)).toHaveText('# Title\n\nplain words here');
        await caretAfter(page, 'here');
        await page.keyboard.type(' more');
        await expect(output(page)).toHaveText('# Title\n\nplain words here more');
        const htmlTab = page.locator('km-editor#subject .we-output-tabs [data-format="html"]');
        await htmlTab.click();
        await expect(output(page)).toHaveText('<h1>Title</h1><p>plain words here more</p>');
        await expect(htmlTab).toHaveClass(/active/);
        await page.locator('km-editor#subject .we-output-tabs [data-format="json"]').click();
        expect(JSON.parse((await output(page).textContent())!).type).toBe('doc');
    });

    test('preview: not editable, only the view-mode toolbar group, typing ignored', async ({ page }) => {
        await setMode(page, 'preview');
        await expect(pm(page)).toHaveAttribute('contenteditable', 'false');
        await expect(page.locator('km-editor#subject .we-toolbar-zone .we-group:visible')).toHaveCount(1);
        await expect(page.locator('km-editor#subject .we-toolbar-zone .we-group:visible')).toHaveAttribute('data-group', 'view');
        await pm(page).locator('p').click();
        await page.keyboard.type('nope');
        expect(await markdown(page)).toBe('# Title\n\nplain words here');
        // Back to edit re-enables.
        await setMode(page, 'edit');
        await expect(pm(page)).toHaveAttribute('contenteditable', 'true');
        await expect(page.locator('km-editor#subject .we-toolbar-zone')).toBeVisible();
    });

    test('inline with anchor: the host floats below the anchor target', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.getElementById('subject') as any;
            el.anchor = '#target';
            el.viewMode = 'inline';
        });
        await expect(root(page)).toHaveClass(/we-inline/);
        await expect.poll(() => editor(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
        await expect
            .poll(async () => {
                const [t, e] = await Promise.all([page.locator('#target').boundingBox(), editor(page).boundingBox()]);
                return [Math.round(e!.y - (t!.y + t!.height)), Math.round(e!.x - t!.x)];
            })
            .toEqual([6, 0]);
        // Leaving inline clears the positioning styles.
        await setMode(page, 'edit');
        await expect.poll(() => editor(page).evaluate((el) => el.style.position)).toBe('');
    });

    test('switching modes keeps the document, the selection and the undo history', async ({ page }) => {
        await caretAfter(page, 'here');
        await page.keyboard.type(' typed');
        await selectText(page, 'words');
        for (const m of ['split', 'preview', 'inline', 'edit']) await setMode(page, m);
        expect(await markdown(page)).toBe('# Title\n\nplain words here typed');
        const selected = await page.evaluate(() => {
            let t = '';
            (document.getElementById('subject') as any).controller.runCommand((s: any) => {
                t = s.doc.textBetween(s.selection.from, s.selection.to);
                return true;
            });
            return t;
        });
        expect(selected).toBe('words');
        await page.evaluate(() => (document.getElementById('subject') as any).controller.runCommand('undo'));
        expect(await markdown(page)).toBe('# Title\n\nplain words here');
    });
});
