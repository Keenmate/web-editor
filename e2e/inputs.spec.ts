import { test, expect, load, editor, pm } from './fixtures';

// Input validation: invalid enum attributes warn and keep the previous value (in
// markup that is the default); invalid property assignments are rejected with a
// console warning. Fixture: test/inputs.html
// (view-mode="bogus" toolbar="sideways" format="xml" statusbar="nope").

test.describe('inputs', () => {
    test('invalid enum attributes → defaults, each with a warning', async ({ page }) => {
        const warnings: string[] = [];
        page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
        await load(page, 'inputs.html', { flag: 'fixtureReady' });
        const cfg = await editor(page).evaluate((el: any) => ({
            viewMode: el.viewMode,
            toolbar: el.toolbar,
            format: el.format,
            statusbar: el.statusbar,
        }));
        expect(cfg).toEqual({ viewMode: 'edit', toolbar: 'top', format: 'markdown', statusbar: 'none' });
        // Core warns once per rejected attribute (NOTES.md ED-11, resolved in core).
        const rejected = warnings.filter((w) => w.includes('rejected invalid value for attribute'));
        expect(rejected.map((w) => w.match(/ ([\w-]+)="/)?.[1]).sort()).toEqual(['format', 'statusbar', 'toolbar', 'view-mode']);
        // The editor still works on the defaults.
        await expect(pm(page).locator('h1')).toHaveText('Title');
        await expect(page.locator('km-editor#subject .we-toolbar-zone')).toBeVisible();
    });

    test('invalid property assignments are rejected (value kept) with a warning', async ({ page }) => {
        await load(page, 'inputs.html', { flag: 'fixtureReady' });
        const warnings: string[] = [];
        page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
        const out = await editor(page).evaluate((el: any) => {
            el.viewMode = 'split';
            el.viewMode = 'nonsense';
            el.interactionHost = { notAHost: true };
            return { viewMode: el.viewMode, host: el.interactionHost };
        });
        expect(out.viewMode).toBe('split');
        expect(out.host).toBeNull();
        await expect.poll(() => warnings.length).toBeGreaterThanOrEqual(2);
    });

    test('boolean `readonly` attribute: presence = true, removal = false', async ({ page }) => {
        await load(page, 'inputs.html', { flag: 'fixtureReady' });
        await editor(page).evaluate((el) => el.setAttribute('readonly', ''));
        expect(await editor(page).evaluate((el: any) => el.isReadonly)).toBe(true);
        await editor(page).evaluate((el) => el.removeAttribute('readonly'));
        expect(await editor(page).evaluate((el: any) => el.isReadonly)).toBe(false);
    });
});
