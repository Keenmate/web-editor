import { test, expect, load, pm, call, markdown, caretAfter, toolbarButton, type Page } from './fixtures';

// Code blocks: insert via the language prompt, Prism token decorations, fenced
// markdown round-trip, change-code-language. Fixture: test/code-block.html
// (value "Intro para").

const run = (page: Page, name: string) =>
    page.evaluate((n) => (document.getElementById('subject') as any).controller.runCommand(n), name);

test.describe('code block', () => {
    test.beforeEach(async ({ page }) => load(page, 'code-block.html', { flag: 'fixtureReady' }));

    test('toolbar prompts for a language and inserts a code block', async ({ page, dialogs }) => {
        await caretAfter(page, 'Intro para');
        dialogs.answer('Python');
        await toolbarButton(page, 'insert-code-block').click();
        expect(dialogs.seen[0].type).toBe('prompt');
        expect(dialogs.seen[0].defaultValue).toBe('javascript');
        const code = pm(page).locator('pre code');
        await expect(code).toHaveCount(1);
        await expect(code).toHaveClass(/language-python/);
        // Typing lands in the block (language lower-cased).
        await page.keyboard.type('x = 1');
        expect(await markdown(page)).toBe('Intro para\n\n```python\nx = 1\n```');
    });

    test('cancelling the language prompt inserts nothing', async ({ page, dialogs }) => {
        await caretAfter(page, 'Intro para');
        dialogs.answer(null);
        await toolbarButton(page, 'insert-code-block').click();
        expect(dialogs.seen).toHaveLength(1);
        await expect(pm(page).locator('pre')).toHaveCount(0);
    });

    test('Prism decorates tokens inside the block', async ({ page }) => {
        await call(page, 'setValue', ['```javascript\nconst answer = 42;\n```']);
        const code = pm(page).locator('pre code');
        await expect(code.locator('.token.keyword')).toHaveText('const');
        await expect(code.locator('.token.number')).toHaveText('42');
        // Decorations are view-only — the document text is untouched.
        expect(await markdown(page)).toBe('```javascript\nconst answer = 42;\n```');
    });

    test('fenced markdown round-trips; a bare fence defaults to javascript', async ({ page }) => {
        await call(page, 'setValue', ['```sql\nselect 1;\n```']);
        await expect(pm(page).locator('pre code')).toHaveClass(/language-sql/);
        expect(await markdown(page)).toBe('```sql\nselect 1;\n```');
        await call(page, 'setValue', ['```\nplain\n```']);
        await expect(pm(page).locator('pre code')).toHaveClass(/language-javascript/);
    });

    test('html / json keep the language', async ({ page }) => {
        await call(page, 'setValue', ['```css\na { color: red }\n```']);
        const html = await call<string>(page, 'getHTML');
        expect(html).toContain('class="language-css"');
        const json = await call<any>(page, 'getJSON');
        expect(json.content[0]).toMatchObject({ type: 'code_block', attrs: { language: 'css' } });
        await call(page, 'setValue', [html, 'html']);
        expect(await call(page, 'getJSON')).toEqual(json);
    });

    test('change-code-language re-prompts inside a block; disabled outside', async ({ page, dialogs }) => {
        await call(page, 'setValue', ['```css\na {}\n```\n\nafter']);
        await caretAfter(page, 'after');
        expect(await page.evaluate(() => (document.getElementById('subject') as any).controller.isCommandEnabled('change-code-language'))).toBe(false);
        await caretAfter(page, 'a {');
        dialogs.answer('JSON');
        expect(await run(page, 'change-code-language')).toBe(true);
        await expect(pm(page).locator('pre code')).toHaveClass(/language-json/);
        expect(await markdown(page)).toContain('```json\n');
    });
});
