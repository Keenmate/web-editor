import { test, expect } from '@playwright/test';

test.describe('<km-editor>', () => {
  test('renders the value as a ProseMirror document', async ({ page }) => {
    await page.goto('/test/fixture.html');
    const editorRoot = page.locator('#subject .ProseMirror');
    await expect(editorRoot.locator('h1')).toHaveText('Hello');
    await expect(editorRoot.locator('strong')).toHaveText('bold');
  });

  test('typing updates getValue() and fires change', async ({ page }) => {
    await page.goto('/test/fixture.html');
    const editorRoot = page.locator('#subject .ProseMirror');
    await expect(editorRoot.locator('h1')).toHaveText('Hello');
    const changeFired = page.evaluate(
      () => new Promise<boolean>((resolve) => document.getElementById('subject')!.addEventListener('change', () => resolve(true), { once: true }))
    );
    await editorRoot.locator('h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' world');
    expect(await changeFired).toBe(true);
    const markdown = await page.evaluate(() => (document.getElementById('subject') as unknown as { getValue(): string }).getValue());
    expect(markdown).toContain('# Hello world');
  });
});
