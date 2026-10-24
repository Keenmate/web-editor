import { test, expect, load, editor, pm, markdown, type Page } from './fixtures';

// Inline mode + `anchor`: the host floats under the anchor target and tracks it
// (scroll); detaching releases the positioning, reconnecting re-anchors without a
// rebuild; an unresolvable anchor leaves the card in normal flow.
// Fixture: test/inline-anchor.html (#target inside a scrollable #scroller).

const offset = async (page: Page) => {
    const [t, e] = await Promise.all([page.locator('#target').boundingBox(), editor(page).boundingBox()]);
    return [Math.round(e!.y - (t!.y + t!.height)), Math.round(e!.x - t!.x)];
};

test.describe('inline anchor', () => {
    test.beforeEach(async ({ page }) => load(page, 'inline-anchor.html', { flag: 'fixtureReady' }));

    test('floats fixed, 6px below the target, left-aligned', async ({ page }) => {
        await expect.poll(() => editor(page).evaluate((el) => el.style.position)).toBe('fixed');
        await expect.poll(() => offset(page)).toEqual([6, 0]);
    });

    test('tracks the target when its container scrolls', async ({ page }) => {
        await expect.poll(() => offset(page)).toEqual([6, 0]);
        await page.locator('#scroller').evaluate((s) => (s.scrollTop = 80));
        await expect.poll(() => offset(page)).toEqual([6, 0]);
        const y = (await page.locator('#target').boundingBox())!.y;
        expect(y).toBeLessThan(120);
    });

    test('detach releases the positioning; reattach re-anchors and keeps the content', async ({ page }) => {
        await pm(page).locator('p').click();
        await page.keyboard.press('End');
        await page.keyboard.type('!');
        await page.evaluate(() => {
            const el = document.getElementById('subject')!;
            (window as any).held = el;
            el.remove();
        });
        expect(await page.evaluate(() => (window as any).held.style.position)).toBe('');
        await page.evaluate(() => document.body.appendChild((window as any).held));
        await expect.poll(() => editor(page).evaluate((el) => el.style.position)).toBe('fixed');
        await expect.poll(() => offset(page)).toEqual([6, 0]);
        expect(await markdown(page)).toBe('# Title\n\nplain words here!');
    });

    test('an anchor selector that matches nothing renders in normal flow', async ({ page }) => {
        await editor(page).evaluate((el: any) => (el.anchor = '#missing'));
        await expect.poll(() => editor(page).evaluate((el) => el.style.position)).toBe('');
        await expect(page.locator('km-editor#subject .km-root')).toHaveClass(/km-inline/);
    });

    test('changing the anchor re-targets', async ({ page }) => {
        await page.evaluate(() => {
            const p = document.createElement('p');
            p.id = 'other';
            p.textContent = 'Other target';
            p.style.marginLeft = '200px';
            document.body.prepend(p);
            (document.getElementById('subject') as any).anchor = '#other';
        });
        await expect
            .poll(async () => {
                const [t, e] = await Promise.all([page.locator('#other').boundingBox(), editor(page).boundingBox()]);
                return [Math.round(e!.y - (t!.y + t!.height)), Math.round(e!.x - t!.x)];
            })
            .toEqual([6, 0]);
    });
});
