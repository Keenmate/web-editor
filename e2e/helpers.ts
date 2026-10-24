/**
 * Shared e2e helpers (re-exported from `./fixtures`). Fixture pages live in
 * `test/<area>.html`; each `<km-editor>` there has an id.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Open a fixture page and wait until every `<km-editor>` on it is built
 * (`is-ready`) — plus an optional page-level readiness flag (`window[flag]`).
 */
export async function load(page: Page, path: string, opts: { flag?: string } = {}): Promise<void> {
    await page.goto(path.startsWith('/') ? path : `/test/${path}`);
    await page.waitForFunction(() => !!customElements.get('km-editor'));
    if (opts.flag) {
        const flag = opts.flag;
        await page.waitForFunction((f) => !!(window as any)[f], flag);
    }
    await page.waitForFunction(() =>
        [...document.querySelectorAll('km-editor')].every((el) => !el.isConnected || el.hasAttribute('is-ready'))
    );
}

/** The host element by id. */
export const editor = (page: Page, id = 'subject'): Locator => page.locator(`km-editor#${id}`);

/** The ProseMirror contenteditable of an editor. */
export const pm = (page: Page, id = 'subject'): Locator => page.locator(`km-editor#${id} .ProseMirror`).first();

/** A toolbar-zone button by command name. */
export const toolbarButton = (page: Page, action: string, id = 'subject'): Locator =>
    page.locator(`km-editor#${id} .km-toolbar-zone [data-action="${action}"]`);

/** Call a public method on the element and return its (serialisable) result. */
export async function call<T = unknown>(page: Page, method: string, args: unknown[] = [], id = 'subject'): Promise<T> {
    return page.evaluate(
        ({ id, method, args }) => (document.getElementById(id) as any)[method](...args),
        { id, method, args }
    ) as Promise<T>;
}

/** Live markdown of an editor. */
export const markdown = (page: Page, id = 'subject'): Promise<string> => call<string>(page, 'getMarkdown', [], id);
/** Live HTML of an editor. */
export const html = (page: Page, id = 'subject'): Promise<string> => call<string>(page, 'getHTML', [], id);

/**
 * Select the first occurrence of `text` inside the document (programmatically,
 * via `controller.runCommand`), so selection-dependent commands have a target.
 */
export async function selectText(page: Page, text: string, id = 'subject'): Promise<void> {
    const ok = await page.evaluate(
        ({ id, text }) => {
            const el = document.getElementById(id) as any;
            return el.controller.runCommand((state: any, dispatch: any) => {
                let from = -1;
                state.doc.descendants((node: any, pos: number) => {
                    if (from < 0 && node.isText && node.text.includes(text)) from = pos + node.text.indexOf(text);
                });
                if (from < 0) return false;
                const TextSelection = state.selection.constructor;
                dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, from + text.length)));
                return true;
            });
        },
        { id, text }
    );
    expect(ok, `text "${text}" found in the document`).toBe(true);
}

/** Put the caret at the end of the text `text` (programmatically). */
export async function caretAfter(page: Page, text: string, id = 'subject'): Promise<void> {
    const ok = await page.evaluate(
        ({ id, text }) => {
            const el = document.getElementById(id) as any;
            return el.controller.runCommand((state: any, dispatch: any) => {
                let at = -1;
                state.doc.descendants((node: any, pos: number) => {
                    if (at < 0 && node.isText && node.text.includes(text)) at = pos + node.text.indexOf(text) + text.length;
                });
                if (at < 0) return false;
                const TextSelection = state.selection.constructor;
                dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)));
                return true;
            });
        },
        { id, text }
    );
    expect(ok, `text "${text}" found in the document`).toBe(true);
}

/** Lines appended to the fixture's `<pre data-testid="<area>-log">`. */
export async function logLines(page: Page, area: string): Promise<string[]> {
    const text = (await page.locator(`[data-testid="${area}-log"]`).textContent()) ?? '';
    return text.split('\n').filter(Boolean);
}

/** Empty an event-log `<pre>`. */
export const clearLog = (page: Page, area: string): Promise<void> =>
    page.evaluate((a) => void (document.querySelector(`[data-testid="${a}-log"]`)!.textContent = ''), area);
