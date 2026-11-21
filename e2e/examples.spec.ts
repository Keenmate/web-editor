import { expect, test, type Page } from './fixtures';

// The examples site: the hub is rendered by the devkit kit (kmwc-* classes),
// every page loads cleanly with the shared layout.
const PAGES = ['examples-basic', 'examples-content', 'examples-plugins', 'examples-pipelines', 'examples-localization', 'examples-playground'];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('hub renders one card per registered page plus the version badge', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('.kmwc-index__card')).toHaveCount(PAGES.length);
  for (const name of PAGES) await expect(page.locator(`.kmwc-index__card[href="${name}.html"]`)).toHaveCount(1);
  await expect(page.locator('[data-kmwc-version]')).toHaveText(/^v\d/);
  expect(errors).toEqual([]);
});

for (const name of PAGES) {
  test(`${name}.html opens without errors`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/${name}.html`);
    await expect(page.locator('.container > header .back-link')).toHaveAttribute('href', 'index.html');
    await page.waitForFunction(() => !!customElements.get('km-editor'));
    // The page's editors render their ProseMirror document.
    await expect(page.locator('km-editor .ProseMirror').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('examples-localization.html: every toggle changes the shown text', async ({ page, dialogs }) => {
    const errors = trackErrors(page);
    await page.goto('/examples-localization.html');
    const out = (id: string) => page.locator(`#${id}`);

    // LO01 — instance labels (on by default: short + full keys), off → English.
    await expect(out('lo01-out')).toContainText('#lo01        bold tooltip: Tučné písmo (Ctrl+B)   view-edit: Upravit   status: Slova: 3');
    await expect(out('lo01-out')).toContainText('#lo01-plain  bold tooltip: Bold (Ctrl+B)   view-edit: Edit   status: Words: 3');
    await page.locator('#lo01-labels').uncheck();
    await expect(out('lo01-out')).toContainText('#lo01        bold tooltip: Bold (Ctrl+B)   view-edit: Edit   status: Words: 3');

    // LO02 — the page dictionary translates every editor, the prompt included.
    await page.locator('#lo02-dict').check();
    await expect(out('lo02-out')).toContainText('#lo02b  bold: Tučně   italic: Kurzíva   group: Formát   view-edit: Upravit   status: Slova: 4 / Znaky: 24');
    await page.locator('km-editor#lo02a .we-toolbar-zone .we-cmd[data-action="insert-code-block"]').click();
    await expect.poll(() => dialogs.seen.at(-1)?.message).toMatch(/^Zadejte jazyk \(/);
    await page.locator('#lo02-dict').uncheck();
    await expect(out('lo02-out')).toContainText('#lo02b  bold: Bold   italic: Italic   group: Format');

    // LO03 — page callback, then the element's own first; instance labels still win.
    await page.locator('#lo03-page').check();
    await expect(out('lo03-out')).toContainText('#lo03a  bold: Tučné   italic: Kurzíva   status: Slová: 3 / Znaky: 17');
    await expect(out('lo03-out')).toContainText('#lo03b  bold: Tučné   italic: Kurzíva   status: Instance wins: 3');
    await page.locator('#lo03-own').check();
    await expect(out('lo03-out')).toContainText('#lo03a  bold: Fett   italic: Kurzíva   status: Wörter: 3 / Znaky: 17');
    await page.locator('#lo03-page').uncheck();
    await page.locator('#lo03-own').uncheck();
    await expect(out('lo03-out')).toContainText('#lo03a  bold: Bold   italic: Italic   status: Words: 3');

    // LO04 — the unset twins follow the translated caption / tooltip.
    await page.locator('#lo04-follow').check();
    await expect(out('lo04-out')).toContainText('split button tooltip:  Rozdělit');
    await expect(out('lo04-out')).toContainText('bold aria-label:       Tučně');

    // LO05 — the status counts are formatted for the page locale.
    await page.locator('input[name="lo05-locale"][value="de-DE"]').check();
    await expect(out('lo05-out')).toHaveText('Words: 1.234 / Chars: 2.467');
    await page.locator('input[name="lo05-locale"][value="en-IN"]').check();
    await expect(out('lo05-out')).toHaveText('Words: 1,234 / Chars: 2,467');
    // The element's own `locale` beats the page locale; unset follows it again.
    await page.locator('input[name="lo05-own"][value="de"]').check();
    await expect(out('lo05-out')).toHaveText('Words: 1.234 / Chars: 2.467');
    await page.locator('input[name="lo05-own"][value=""]').check();
    await expect(out('lo05-out')).toHaveText('Words: 1,234 / Chars: 2,467');
    expect(errors).toEqual([]);
});
