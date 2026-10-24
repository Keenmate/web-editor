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
 * 2. **dialog stub** — the link / image / code-block commands use `prompt()`
 *    (and the default interaction host uses `confirm()`), which would otherwise
 *    block the page. Every native dialog is answered from a per-test queue:
 *
 *        dialogs.answer('https://example.com');  // next prompt() returns this
 *        dialogs.answer(null);                   // next prompt()/confirm() is cancelled
 *        dialogs.answer(true);                   // next confirm() is accepted
 *
 *    With an empty queue: `prompt()` / `confirm()` are dismissed (cancel), `alert()`
 *    is accepted. Every dialog is recorded in `dialogs.seen` (`{ type, message,
 *    defaultValue }`) so specs can assert which dialogs appeared.
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
        async ({ page }, use) => {
            const queue: DialogAnswer[] = [];
            const stub: DialogStub = {
                answer: (...answers) => void queue.push(...answers),
                seen: []
            };
            page.on('dialog', async (dialog) => {
                const type = dialog.type();
                stub.seen.push({ type, message: dialog.message(), defaultValue: dialog.defaultValue() });
                const next = queue.length ? queue.shift() : undefined;
                try {
                    if (type === 'alert') await dialog.accept();
                    else if (next === undefined || next === null || next === false) await dialog.dismiss();
                    else if (type === 'prompt') await dialog.accept(next === true ? dialog.defaultValue() : String(next));
                    else await dialog.accept();
                } catch {
                    // Page closed while the dialog was open — nothing to answer.
                }
            });
            await use(stub);
        },
        { auto: true }
    ]
});

export { expect };
