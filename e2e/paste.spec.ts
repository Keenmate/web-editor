import { test, expect, load, pm, markdown, caretAfter, type Page } from './fixtures';

// Paste: HTML keeps known marks / blocks, drops unknown nodes (keeps their text);
// plain text inserts as text. Fixture: test/paste.html (value "start").

/** Dispatch a synthetic paste with the given clipboard payloads on the PM surface. */
const paste = (page: Page, data: Record<string, string>) =>
    pm(page).evaluate((el, d) => {
        const dt = new DataTransfer();
        for (const [type, value] of Object.entries(d)) dt.setData(type, value);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, data);

test.describe('paste', () => {
    // Firefox hands a page-built DataTransfer to a synthetic ClipboardEvent EMPTY
    // (`getData()` → '' — probed 2026-11-09), so no payload ever reaches the editor.
    test.skip(({ browserName }) => browserName === 'firefox', 'Firefox: a script-built DataTransfer arrives empty in a synthetic paste event');
    test.beforeEach(async ({ page }) => {
        await load(page, 'paste.html', { flag: 'fixtureReady' });
        await caretAfter(page, 'start');
    });

    test('HTML paste keeps bold / italic / link marks', async ({ page }) => {
        await paste(page, {
            'text/html': ' <b>bold</b> and <i>it</i> and <a href="https://x.test/">link</a>',
            'text/plain': ' bold and it and link',
        });
        await expect(pm(page).locator('strong')).toHaveText('bold');
        await expect(pm(page).locator('em')).toHaveText('it');
        await expect(pm(page).locator('a')).toHaveAttribute('href', 'https://x.test/');
        // (Leading HTML whitespace collapses away — the fragment starts at <b>.)
        expect(await markdown(page)).toContain('**bold** and *it* and [link](https://x.test/)');
    });

    test('HTML paste keeps block structure (heading, list)', async ({ page }) => {
        // Into an empty document: an open-start slice would merge the first block into
        // the caret's paragraph (standard ProseMirror fitting).
        await pm(page).evaluate(() => (document.getElementById('subject') as any).setValue(''));
        await pm(page).focus();
        await paste(page, { 'text/html': '<h1>Head</h1><ul><li>one</li><li>two</li></ul>' });
        await expect(pm(page).locator('h1')).toHaveText('Head');
        await expect(pm(page).locator('ul > li')).toHaveText(['one', 'two']);
    });

    test('unknown elements are dropped but their text is kept', async ({ page }) => {
        await paste(page, {
            'text/html': '<p><span style="color:red">red</span> <blink>blink</blink> <marquee>scroll</marquee></p><script>window.pwned=1</script>',
        });
        const inner = await pm(page).innerHTML();
        expect(inner).not.toMatch(/<span style|<blink|<marquee|<script/);
        await expect(pm(page)).toContainText('red');
        await expect(pm(page)).toContainText('blink');
        expect(await page.evaluate(() => (window as any).pwned)).toBeUndefined();
    });

    test('plain-text paste inserts text only', async ({ page }) => {
        await paste(page, { 'text/plain': ' **not bold**' });
        await expect(pm(page).locator('strong')).toHaveCount(0);
        await expect(pm(page)).toContainText('start **not bold**');
    });
});
