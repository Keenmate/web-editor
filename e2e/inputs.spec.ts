import { test, expect, load, editor, pm } from './fixtures';

// Input validation: invalid enum attributes fall back to their default (silently —
// core's attribute path does not warn); invalid property assignments are rejected
// with a console warning. Fixture: test/inputs.html
// (mode="bogus" toolbar="sideways" format="xml" statusbar="nope").

test.describe('inputs', () => {
    test('invalid enum attributes → defaults (no warning: core attribute path is silent)', async ({ page }) => {
        const warnings: string[] = [];
        page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
        await load(page, 'inputs.html', { flag: 'fixtureReady' });
        const cfg = await editor(page).evaluate((el: any) => ({
            mode: el.mode,
            toolbar: el.toolbar,
            format: el.format,
            statusbar: el.statusbar,
        }));
        expect(cfg).toEqual({ mode: 'edit', toolbar: 'top', format: 'markdown', statusbar: 'none' });
        // Core's toEnum falls back silently on the attribute path (only property
        // rejections warn) — see NOTES.md ED-11 for the plan's "+ warn" expectation.
        expect(warnings.filter((w) => /bogus|sideways|xml|nope/.test(w))).toEqual([]);
        // The editor still works on the defaults.
        await expect(pm(page).locator('h1')).toHaveText('Title');
        await expect(page.locator('km-editor#subject .km-toolbar-zone')).toBeVisible();
    });

    test('invalid property assignments are rejected (value kept) with a warning', async ({ page }) => {
        await load(page, 'inputs.html', { flag: 'fixtureReady' });
        const warnings: string[] = [];
        page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
        const out = await editor(page).evaluate((el: any) => {
            el.mode = 'split';
            el.mode = 'nonsense';
            el.interactionHost = { notAHost: true };
            return { mode: el.mode, host: el.interactionHost };
        });
        expect(out.mode).toBe('split');
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
