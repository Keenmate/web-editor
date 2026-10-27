import { test, expect, load } from './fixtures';

test.describe('<km-editor>', () => {
  test('renders the value as a ProseMirror document', async ({ page }) => {
    await load(page, 'fixture.html');
    const editorRoot = page.locator('#subject .ProseMirror');
    await expect(editorRoot.locator('h1')).toHaveText('Hello');
    await expect(editorRoot.locator('strong')).toHaveText('bold');
  });

  test('typing updates `value` and fires change', async ({ page }) => {
    await load(page, 'fixture.html');
    const editorRoot = page.locator('#subject .ProseMirror');
    await expect(editorRoot.locator('h1')).toHaveText('Hello');
    const changeFired = page.evaluate(
      () => new Promise<boolean>((resolve) => document.getElementById('subject')!.addEventListener('change', () => resolve(true), { once: true }))
    );
    await editorRoot.locator('h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' world');
    expect(await changeFired).toBe(true);
    const markdown = await page.evaluate(() => (document.getElementById('subject') as unknown as { value: string }).value);
    expect(markdown).toContain('# Hello world');
  });
});
