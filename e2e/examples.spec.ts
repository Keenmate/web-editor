import { expect, test, type Page } from '@playwright/test';

// The examples site: the hub is rendered by the devkit kit (kmwc-* classes),
// every page loads cleanly with the shared layout.
const PAGES = ['examples-basic', 'examples-content', 'examples-plugins', 'examples-pipelines', 'examples-playground'];

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
