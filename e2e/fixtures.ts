/**
 * Shared Playwright test fixtures for the web-editor e2e suite.
 *
 * Import `test` / `expect` from here instead of `@playwright/test`. Two always-on
 * additions:
 *
 * 1. **pageerror guard** (copied from web-multiselect) — fails any test in which
 *    the page threw an uncaught error. The listener attaches during fixture setup,
 *    before the test's first `page.goto`, so load-time errors are caught too.
 *    Opt out for a deliberate throw: read `pageErrors`, assert, then clear it
 *    (`pageErrors.length = 0`).
 *
 * 2. **dialog stub** — the link / image / code-block commands and the default
 *    interaction host open core `/dialog` prompts / confirmations (a `.km-dialog-layer`
 *    in `<body>`). Every one is answered from a per-test queue, in the page:
 *
 *        dialogs.answer('https://example.com');  // next prompt: type this, press OK
 *        dialogs.answer(null);                   // next prompt / confirmation: Cancel
 *        dialogs.answer(true);                   // next one: OK as it is
 *
 *    With an empty queue a dialog is cancelled. Every dialog is recorded in
 *    `dialogs.seen` (`{ type: 'prompt' | 'confirm', message: <its title>,
 *    defaultValue: <the field's starting value> }`) so specs can assert which
 *    dialogs appeared. A native `alert` / `prompt` / `confirm` would fail the test
 *    (`nativeDialogs`) — the editor never opens one.
 */
import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';
export * from './helpers';

export type DialogAnswer = string | boolean | null;

export interface DialogStub {
    /** Queue the answer for the next native dialog (FIFO). */
    answer(...answers: DialogAnswer[]): void;
    /** Every dialog shown so far, in order. */
    seen: Array<{ type: string; message: string; defaultValue: string }>;
}

export const test = base.extend<{ pageErrors: string[]; dialogs: DialogStub }>({
    pageErrors: [
        async ({ page }, use, testInfo) => {
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(e.message ?? String(e)));

            await use(errors);

            // Only enforce when the test otherwise passed — don't bury a more
            // specific failure (or an expected-to-fail test) under this one.
            if (errors.length > 0 && testInfo.status === testInfo.expectedStatus) {
                expect(errors, 'uncaught page error(s) during test').toEqual([]);
            }
        },
        { auto: true }
    ],
    dialogs: [
        async ({ page }, use, testInfo) => {
            const queue: DialogAnswer[] = [];
            const stub: DialogStub = {
                answer: (...answers) => void queue.push(...answers),
                seen: []
            };
            const native: string[] = [];
            page.on('dialog', async (dialog) => {
                native.push(`${dialog.type()}: ${dialog.message()}`);
                await dialog.dismiss().catch(() => {});
            });
            await page.exposeFunction('__kmDialogOpened', (seen: DialogStub['seen'][number]) => {
                stub.seen.push(seen);
                return queue.length ? queue.shift() : null;
            });
            await page.addInitScript(() => {
                const answer = async (layer: Element): Promise<void> => {
                    const panel = layer.shadowRoot?.querySelector('.km-dialog');
                    if (!panel) return;
                    const input = panel.querySelector<HTMLInputElement>('.km-dialog__input');
                    const reply = await (window as any).__kmDialogOpened({
                        type: input ? 'prompt' : 'confirm',
                        message: panel.querySelector('.km-sheet-title')?.textContent ?? '',
                        defaultValue: input?.value ?? ''
                    });
                    const click = (value: string): void =>
                        panel.querySelector<HTMLButtonElement>(`.km-dialog__action[data-value="${value}"]`)?.click();
                    if (reply === null || reply === undefined || reply === false) return click('cancel');
                    if (input && typeof reply === 'string') input.value = reply;
                    click('ok');
                };
                new MutationObserver((records) => {
                    for (const r of records) for (const n of r.addedNodes) {
                        if (n instanceof Element && n.classList.contains('km-dialog-layer')) void answer(n);
                    }
                }).observe(document, { childList: true, subtree: true });
            });
            await use(stub);
            if (native.length && testInfo.status === testInfo.expectedStatus) {
                expect(native, 'native browser dialog(s) opened').toEqual([]);
            }
        },
        { auto: true }
    ]
});

export { expect };
