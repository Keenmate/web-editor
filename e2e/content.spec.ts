import { test, expect, load, pm, call, markdown, logLines, clearLog } from './fixtures';

// Content I/O: the three input formats, the getters, setValue + change, value
// reassignment, focus(). Fixture: test/content.html.

test.describe('content I/O', () => {
    test.beforeEach(async ({ page }) => load(page, 'content.html', { flag: 'contentReady' }));

    test('markdown, html and json `value` render the same document', async ({ page }) => {
        const inner = (id: string) => pm(page, id).evaluate((el) => el.innerHTML);
        await expect(pm(page, 'json').locator('h1')).toHaveText('Title');
        const md = await inner('md');
        expect(md).toContain('<strong>bold</strong>');
        expect(md).toContain('<em>italic</em>');
        expect(await inner('html')).toBe(md);
        expect(await inner('json')).toBe(md);
        // …and the same JSON model behind each.
        const json = await call(page, 'getJSON', [], 'md');
        expect(await call(page, 'getJSON', [], 'html')).toEqual(json);
        expect(await call(page, 'getJSON', [], 'json')).toEqual(json);
    });

    test('getHTML / getMarkdown / getJSON / getValue serialise the live document', async ({ page }) => {
        expect(await call(page, 'getHTML', [], 'md')).toBe(
            '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li><p>one</p></li><li><p>two</p></li></ul>'
        );
        expect(await markdown(page, 'html')).toBe('# Title\n\nSome **bold** and *italic* text.\n\n- one\n\n- two');
        const json = (await call<any>(page, 'getJSON', [], 'md'));
        expect(json.type).toBe('doc');
        expect(json.content.map((n: any) => n.type)).toEqual(['heading', 'paragraph', 'bullet_list']);
        // getValue() uses the element's `format`; an explicit format overrides it.
        expect(await call(page, 'getValue', [], 'html')).toContain('<h1>Title</h1>');
        expect(await call(page, 'getValue', [], 'md')).toContain('# Title');
        expect(JSON.parse(await call<string>(page, 'getValue', [], 'json'))).toEqual(json);
        expect(await call(page, 'getValue', ['markdown'], 'html')).toContain('# Title');
        expect(await call(page, 'getContent', ['html'], 'md')).toContain('<h1>Title</h1>');
    });

    test('setValue(v) parses in the active format and fires change { value, format }', async ({ page }) => {
        await clearLog(page, 'content');
        await call(page, 'setValue', ['## Replaced\n\nwith *text*']);
        await expect(pm(page).locator('h2')).toHaveText('Replaced');
        await expect(pm(page).locator('em')).toHaveText('text');
        expect(await logLines(page, 'content')).toEqual([
            `change:markdown:${JSON.stringify('## Replaced\n\nwith *text*')}`,
        ]);
    });

    test('setValue(v, fmt) parses in an explicit format (html / json)', async ({ page }) => {
        await call(page, 'setValue', ['<h2>From HTML</h2><p><u>under</u></p>', 'html']);
        await expect(pm(page).locator('h2')).toHaveText('From HTML');
        await expect(pm(page).locator('u')).toHaveText('under');
        const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From JSON' }] }] };
        await call(page, 'setValue', [JSON.stringify(doc), 'json']);
        await expect(pm(page).locator('p')).toHaveText('From JSON');
        expect(await call(page, 'getJSON')).toEqual(doc);
        // The change detail still reports the element's active format.
        const last = (await logLines(page, 'content')).at(-1)!;
        expect(last).toBe(`change:markdown:${JSON.stringify('From JSON')}`);
    });

    test('`value` reassignment replaces the document without re-firing ready', async ({ page }) => {
        await clearLog(page, 'content');
        await page.evaluate(() => ((document.getElementById('subject') as any).value = '# Second\n\nbody'));
        await expect(pm(page).locator('h1')).toHaveText('Second');
        expect(await markdown(page)).toBe('# Second\n\nbody');
        await page.evaluate(() => document.getElementById('subject')!.setAttribute('value', '# Third'));
        await expect(pm(page).locator('h1')).toHaveText('Third');
        expect((await logLines(page, 'content')).filter((l) => l.endsWith(':ready'))).toEqual([]);
        // The editor is still live after the rebuild.
        await pm(page).locator('h1').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        expect(await markdown(page)).toBe('# Third!');
    });

    test('`ready` fired once per editor; isReady + is-ready attribute', async ({ page }) => {
        const lines = (await logLines(page, 'content')).filter((l) => l.endsWith(':ready'));
        // `ready` may fire before the log listener attaches for parser-upgraded editors;
        // what matters is it never fires twice.
        for (const id of ['md', 'html', 'json', 'subject']) {
            expect(lines.filter((l) => l === `${id}:ready`).length).toBeLessThanOrEqual(1);
            expect(await page.evaluate((i) => (document.getElementById(i) as any).isReady, id)).toBe(true);
        }
    });

    test('focus() focuses the ProseMirror surface', async ({ page }) => {
        await call(page, 'focus');
        const focused = await page.evaluate(() => {
            const el = document.getElementById('subject')!;
            return {
                host: document.activeElement === el,
                inner: (el.shadowRoot!.activeElement as HTMLElement | null)?.classList.contains('ProseMirror'),
            };
        });
        expect(focused).toEqual({ host: true, inner: true });
        await page.keyboard.type('X');
        expect(await markdown(page)).toContain('X');
    });
});
