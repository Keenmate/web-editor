import { test, expect, load, pm, logLines, type Page } from './fixtures';

// Image pipeline (`image:browser:pick`): the host picker via interactionHost,
// lock-change around the run, `imageBase64Plugin` splicing a to-base64 stage that
// turns an http src into a `data:` URI, a cancelled pick inserting nothing.
// Fixture: test/image-pipeline.html (#b64 with imageBase64Plugin, #plain without).

// 1×1 transparent PNG served for /__px.png.
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

const pickButton = (page: Page, id: string) =>
    page.locator(`km-editor#${id} .we-toolbar-zone [data-action="image:browser:pick"]`);

// ProseMirror adds an `img.ProseMirror-separator` after a trailing inline node.
const IMG = 'img:not(.ProseMirror-separator)';

test.describe('image pipeline', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/__px.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
        await load(page, 'image-pipeline.html', { flag: 'fixtureReady' });
    });

    test('without imageBase64Plugin the picked URL is inserted as-is', async ({ page }) => {
        await pm(page, 'plain').locator('p').click();
        await pickButton(page, 'plain').click();
        const img = pm(page, 'plain').locator(IMG);
        await expect(img).toHaveAttribute('src', /\/__px\.png$/);
        await expect(img).toHaveAttribute('alt', 'pixel');
        await expect.poll(() => logLines(page, 'image-pipeline')).toEqual([
            'plain:lock:true',
            'request:cloud-picker',
            'plain:lock:false',
        ]);
    });

    test('imageBase64Plugin routes the http src to a data: URI before insert', async ({ page }) => {
        await pm(page, 'b64').locator('p').click();
        await pickButton(page, 'b64').click();
        const img = pm(page, 'b64').locator(IMG);
        await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
        expect(await img.getAttribute('src')).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    });

    test('a cancelled pick inserts nothing and releases the lock', async ({ page }) => {
        await page.evaluate(() => ((window as any).pick = { isCancelled: true }));
        await pm(page, 'b64').locator('p').click();
        await pickButton(page, 'b64').click();
        await expect.poll(async () => (await logLines(page, 'image-pipeline')).filter((l) => l.startsWith('request'))).toHaveLength(1);
        await page.waitForTimeout(200);
        await expect(pm(page, 'b64').locator(IMG)).toHaveCount(0);
        const locks = (await logLines(page, 'image-pipeline')).filter((l) => l.startsWith('b64:lock'));
        expect(locks.at(-1) ?? 'b64:lock:false').toBe('b64:lock:false');
        await expect(pm(page, 'b64')).toHaveAttribute('contenteditable', 'true');
    });
});
