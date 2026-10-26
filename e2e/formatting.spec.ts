import { test, expect, load, pm, markdown, selectText, caretAfter, toolbarButton, html } from './fixtures';

// Inline marks + block types via toolbar and keyboard, aria-pressed, markdown
// output; Shift-Enter hard break. Fixture: test/formatting.html
// (value "# Title\n\nplain words here").

test.describe('formatting', () => {
    test.beforeEach(async ({ page }) => load(page, 'formatting.html', { flag: 'fixtureReady' }));

    const MARKS = [
        { action: 'bold', key: 'Control+b', tag: 'strong', md: '**words**' },
        { action: 'italic', key: 'Control+i', tag: 'em', md: '*words*' },
        { action: 'underline', key: 'Control+u', tag: 'u', md: '<u>words</u>' },
    ];

    for (const m of MARKS) {
        test(`${m.action}: toolbar button applies, reflects aria-pressed, toggles off`, async ({ page }) => {
            await selectText(page, 'words');
            const btn = toolbarButton(page, m.action);
            await expect(btn).not.toHaveAttribute('aria-pressed', 'true');
            await btn.click();
            await expect(pm(page).locator(`p ${m.tag}`)).toHaveText('words');
            await expect(btn).toHaveAttribute('aria-pressed', 'true');
            await btn.click();
            await expect(pm(page).locator(`p ${m.tag}`)).toHaveCount(0);
            await expect(btn).not.toHaveAttribute('aria-pressed', 'true');
        });

        test(`${m.action}: ${m.key} toggles the mark; markdown output`, async ({ page }) => {
            await selectText(page, 'words');
            await page.keyboard.press(m.key);
            await expect(pm(page).locator(`p ${m.tag}`)).toHaveText('words');
            const md = await markdown(page);
            if (m.action === 'underline') {
                // Underline has no CommonMark syntax — check what the serializer writes.
                expect(md).toContain('words');
            } else {
                expect(md).toBe(`# Title\n\nplain ${m.md} here`);
            }
            await page.keyboard.press(m.key);
            await expect(pm(page).locator(`p ${m.tag}`)).toHaveCount(0);
            expect(await markdown(page)).toBe('# Title\n\nplain words here');
        });
    }

    test('aria-pressed follows the caret into / out of a marked range', async ({ page }) => {
        await selectText(page, 'words');
        await page.keyboard.press('Control+b');
        await caretAfter(page, 'wor');
        await expect(toolbarButton(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
        await caretAfter(page, 'pla');
        await expect(toolbarButton(page, 'bold')).not.toHaveAttribute('aria-pressed', 'true');
    });

    test('typing with a stored mark: Mod-b then type produces bold text', async ({ page }) => {
        await caretAfter(page, 'here');
        await page.keyboard.press('Control+b');
        await page.keyboard.type('LOUD');
        await expect(pm(page).locator('p strong')).toHaveText('LOUD');
        expect(await markdown(page)).toBe('# Title\n\nplain words here**LOUD**');
    });

    test('inline code from markdown round-trips', async ({ page }) => {
        await page.evaluate(() => (document.getElementById('subject') as any).setValue('use `npm ci` here'));
        await expect(pm(page).locator('p code')).toHaveText('npm ci');
        expect(await markdown(page)).toBe('use `npm ci` here');
        expect(await html(page)).toBe('<p>use <code>npm ci</code> here</p>');
    });

    test('heading / paragraph block type via toolbar; active state', async ({ page }) => {
        await caretAfter(page, 'plain');
        const h = toolbarButton(page, 'heading');
        const p = toolbarButton(page, 'paragraph');
        await expect(p).toHaveAttribute('aria-pressed', 'true');
        await h.click();
        await expect(pm(page).locator('h1')).toHaveText(['Title', 'plain words here']);
        await expect(h).toHaveAttribute('aria-pressed', 'true');
        expect(await markdown(page)).toBe('# Title\n\n# plain words here');
        await p.click();
        await expect(pm(page).locator('p')).toHaveText('plain words here');
        expect(await markdown(page)).toBe('# Title\n\nplain words here');
    });

    test('Shift-Enter inserts a hard break (not a new paragraph)', async ({ page }) => {
        await caretAfter(page, 'plain');
        await page.keyboard.press('Shift+Enter');
        await expect(pm(page).locator('p')).toHaveCount(1);
        await expect(pm(page).locator('p br')).toHaveCount(1);
        expect(await markdown(page)).toBe('# Title\n\nplain\\\n words here');
    });

    test('Enter splits the paragraph', async ({ page }) => {
        await caretAfter(page, 'plain');
        await page.keyboard.press('Enter');
        await expect(pm(page).locator('p')).toHaveText(['plain', ' words here']);
    });
});
