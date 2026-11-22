import { test, expect, load, pm, editor } from './fixtures';

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
