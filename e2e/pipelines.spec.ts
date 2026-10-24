import { test, expect, load, pm, selectText, toolbarButton, logLines, clearLog, type Page } from './fixtures';

// Command pipelines: plugin stages spliced before / after / in place of a
// command's stage run on the toolbar AND the keymap path; a halting stage cancels.
// Fixture: test/pipelines.html.

const bold = async (page: Page, id: string, via: 'toolbar' | 'key') => {
    await selectText(page, 'plain', id);
    if (via === 'toolbar') await toolbarButton(page, 'bold', id).click();
    else await page.keyboard.press('Control+b');
};

test.describe('pipelines', () => {
    test.beforeEach(async ({ page }) => {
        await load(page, 'pipelines.html', { flag: 'fixtureReady' });
        await clearLog(page, 'pipelines');
    });

    for (const via of ['toolbar', 'key'] as const) {
        test(`before + after stages wrap the command (${via})`, async ({ page }) => {
            await bold(page, 'around', via);
            await expect(pm(page, 'around').locator('strong')).toHaveText('plain');
            expect(await logLines(page, 'pipelines')).toEqual(['around:before', 'around:after']);
        });

        test(`a same-id stage replaces the command (${via})`, async ({ page }) => {
            await bold(page, 'replace', via);
            await expect(pm(page, 'replace').locator('em')).toHaveText('plain');
            await expect(pm(page, 'replace').locator('strong')).toHaveCount(0);
            expect(await logLines(page, 'pipelines')).toEqual(['replace:run']);
        });

        test(`a halting stage cancels the command (${via})`, async ({ page }) => {
            await bold(page, 'halt', via);
            await page.waitForTimeout(50);
            await expect(pm(page, 'halt').locator('strong')).toHaveCount(0);
            expect(await logLines(page, 'pipelines')).toEqual(['halt:gate']);
            // Gate open → the command runs.
            await page.evaluate(() => ((window as any).shouldHalt = false));
            await bold(page, 'halt', via);
            await expect(pm(page, 'halt').locator('strong')).toHaveText('plain');
        });
    }

    test('controller.runCommand(name) goes through the pipeline too', async ({ page }) => {
        await selectText(page, 'plain', 'around');
        await page.evaluate(() => (document.getElementById('around') as any).controller.runCommand('bold'));
        await expect(pm(page, 'around').locator('strong')).toHaveText('plain');
        expect(await logLines(page, 'pipelines')).toEqual(['around:before', 'around:after']);
    });
});
