import { test, expect, load, pm, markdown, caretAfter, toolbarButton } from './fixtures';

// Undo / redo: toolbar buttons + Mod-z / Mod-y / Mod-Shift-z, enabled state.
// Fixture: test/history.html (value "start").

test.describe('history', () => {
    test.beforeEach(async ({ page }) => load(page, 'history.html', { flag: 'fixtureReady' }));

    const typeEnd = async (page: import('@playwright/test').Page, text: string) => {
        await caretAfter(page, 'start');
        await page.keyboard.type(text);
    };

    test('fresh document: undo and redo are disabled', async ({ page }) => {
        await expect(toolbarButton(page, 'undo')).toBeDisabled();
        await expect(toolbarButton(page, 'redo')).toBeDisabled();
    });

    test('toolbar undo / redo restore the document; enabled state follows the stacks', async ({ page }) => {
        await typeEnd(page, ' one');
        expect(await markdown(page)).toBe('start one');
        await expect(toolbarButton(page, 'undo')).toBeEnabled();
        await expect(toolbarButton(page, 'redo')).toBeDisabled();
        await toolbarButton(page, 'undo').click();
        expect(await markdown(page)).toBe('start');
        await expect(toolbarButton(page, 'undo')).toBeDisabled();
        await expect(toolbarButton(page, 'redo')).toBeEnabled();
        await toolbarButton(page, 'redo').click();
        expect(await markdown(page)).toBe('start one');
        await expect(toolbarButton(page, 'redo')).toBeDisabled();
    });

    test('Mod-z undoes, Mod-y and Mod-Shift-z redo', async ({ page }) => {
        await typeEnd(page, ' one');
        await page.keyboard.press('Control+z');
        expect(await markdown(page)).toBe('start');
        await page.keyboard.press('Control+y');
        expect(await markdown(page)).toBe('start one');
        await page.keyboard.press('Control+z');
        expect(await markdown(page)).toBe('start');
        await page.keyboard.press('Control+Shift+z');
        expect(await markdown(page)).toBe('start one');
    });

    test('undo reverts a formatting command', async ({ page }) => {
        await page.evaluate(() => (document.getElementById('subject') as any).controller.runCommand('heading'));
        await expect(pm(page).locator('h1')).toHaveText('start');
        await page.keyboard.press('Control+z');
        await expect(pm(page).locator('h1')).toHaveCount(0);
        await expect(pm(page).locator('p')).toHaveText('start');
    });

    test('a new edit after undo clears the redo stack', async ({ page }) => {
        await typeEnd(page, ' one');
        await page.keyboard.press('Control+z');
        await expect(toolbarButton(page, 'redo')).toBeEnabled();
        await page.keyboard.type('X');
        await expect(toolbarButton(page, 'redo')).toBeDisabled();
    });

    test('setValue starts a fresh history (cannot undo past the replacement)', async ({ page }) => {
        await typeEnd(page, ' one');
        await page.evaluate(() => (document.getElementById('subject') as any).setValue('replaced'));
        await expect(toolbarButton(page, 'undo')).toBeDisabled();
        await pm(page).focus();
        await page.keyboard.press('Control+z');
        expect(await markdown(page)).toBe('replaced');
    });
});
