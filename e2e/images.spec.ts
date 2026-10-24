import { test, expect, load, pm, call, markdown, caretAfter, toolbarButton } from './fixtures';

// Images: insert via the URL + alt prompts, markdown / html / json round-trip
// (ED-6: unescaped src). Fixture: test/images.html (value "Intro para").

const PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

// ProseMirror adds an `img.ProseMirror-separator` after a trailing inline node.
const IMG = 'img:not(.ProseMirror-separator)';

test.describe('images', () => {
    test.beforeEach(async ({ page }) => load(page, 'images.html', { flag: 'fixtureReady' }));

    test('toolbar prompts for URL then alt text and inserts the image', async ({ page, dialogs }) => {
        await caretAfter(page, 'Intro para');
        dialogs.answer(PX, 'A pixel');
        await toolbarButton(page, 'insert-image').click();
        expect(dialogs.seen.map((d) => d.message)).toEqual(['Enter image URL:', 'Enter alt text (optional):']);
        const img = pm(page).locator(IMG);
        await expect(img).toHaveAttribute('src', PX);
        await expect(img).toHaveAttribute('alt', 'A pixel');
        expect(await markdown(page)).toBe(`Intro para![A pixel](${PX})`);
    });

    test('cancelling the URL prompt inserts nothing; cancelling alt still inserts', async ({ page, dialogs }) => {
        await caretAfter(page, 'Intro para');
        dialogs.answer(null);
        await toolbarButton(page, 'insert-image').click();
        await expect(pm(page).locator(IMG)).toHaveCount(0);
        dialogs.answer(PX, null);
        await toolbarButton(page, 'insert-image').click();
        await expect(pm(page).locator(IMG)).toHaveCount(1);
        expect(await markdown(page)).toBe(`Intro para![](${PX})`);
    });

    test('markdown image with title round-trips', async ({ page }) => {
        await call(page, 'setValue', ['![alt text](https://img.test/a.png "Title")']);
        const img = pm(page).locator(IMG);
        await expect(img).toHaveAttribute('src', 'https://img.test/a.png');
        await expect(img).toHaveAttribute('alt', 'alt text');
        await expect(img).toHaveAttribute('title', 'Title');
        expect(await markdown(page)).toBe('![alt text](https://img.test/a.png "Title")');
    });

    test('html and json round-trip an image', async ({ page }) => {
        await call(page, 'setValue', ['<p>x<img src="https://img.test/b.png" alt="b" title="t"></p>', 'html']);
        const html = await call<string>(page, 'getHTML');
        expect(html).toContain('src="https://img.test/b.png"');
        const json = await call(page, 'getJSON');
        await call(page, 'setValue', [JSON.stringify(json), 'json']);
        expect(await call(page, 'getHTML')).toBe(html);
    });

    test('a src with spaces / parentheses survives the markdown round-trip', async ({ page }) => {
        test.fail(true, 'NOTES.md ED-6');
        const src = 'https://img.test/my image (1).png';
        await call(page, 'setValue', [`<p><img src="${src}" alt="x"></p>`, 'html']);
        const md = await markdown(page);
        await call(page, 'setValue', [md]);
        await expect(pm(page).locator(IMG)).toHaveAttribute('src', encodeURI(src));
    });
});
