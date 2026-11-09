import { test, expect, load } from './fixtures';

// Global registration: the element is defined once, `window.components['km-editor']`
// publishes version / config / getInstances; importing twice is harmless; only the
// entry (core registerComponent()) defines the tag.
// Fixture: test/registration.html.

test.describe('registration', () => {
    test.beforeEach(async ({ page }) => load(page, 'registration.html', { flag: 'fixtureReady' }));

    test('km-editor is defined as KmEditorElement', async ({ page }) => {
        const out = await page.evaluate(async () => {
            const mod = await import('/src/index.ts' as string);
            return {
                same: customElements.get('km-editor') === mod.KmEditorElement,
                isInstance: document.getElementById('subject') instanceof mod.KmEditorElement,
            };
        });
        expect(out).toEqual({ same: true, isInstance: true });
    });

    test('window.components["km-editor"] publishes version, config and getInstances()', async ({ page }) => {
        const out = await page.evaluate(() => {
            const c = (window as any).components['km-editor'];
            return {
                version: c.version(),
                name: c.config.name,
                instances: c.getInstances().map((e: HTMLElement) => e.id),
                hasLogging: typeof c.logging?.enableLogging === 'function',
            };
        });
        expect(out.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(out.name).toBe('@keenmate/web-editor');
        expect(out.instances).toEqual(['subject']);
        expect(out.hasLogging).toBe(true);
    });

    test('getInstances() tracks added and removed editors', async ({ page }) => {
        const out = await page.evaluate(async () => {
            const c = (window as any).components['km-editor'];
            const el = document.createElement('km-editor');
            el.id = 'second';
            document.body.appendChild(el);
            await (el as any).whenSettled();
            const withSecond = c.getInstances().map((e: HTMLElement) => e.id).sort();
            el.remove();
            const after = c.getInstances().map((e: HTMLElement) => e.id);
            return { withSecond, after };
        });
        expect(out.withSecond).toEqual(['second', 'subject']);
        expect(out.after).toEqual(['subject']);
    });

    test('importing the package entry again does not redefine (no error)', async ({ page }) => {
        await page.evaluate(async () => {
            await import('/src/index.ts' as string);
        });
        expect(await page.evaluate(() => !!customElements.get('km-editor'))).toBe(true);
    });

    test('the element module alone does not define the tag (core registerComponent() in the entry does)', async ({ page }) => {
        const src = await page.evaluate(async () => (await fetch('/src/web-component.ts')).text());
        expect(src).not.toMatch(/customElements\.define\(/);
    });
});
