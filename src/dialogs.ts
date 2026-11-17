/**
 * The editor's prompts and confirmations go through core `/dialog` (SPEC §12.19) — never `window.prompt` /
 * `confirm`: a styled, translatable modal (a bottom sheet on a phone) with an inert page, a Tab trap and focus
 * back in the editor on close. The button / close texts come from the element's `labels` (`ok`, `cancel`,
 * `close`).
 *
 * A ProseMirror command is synchronous, so a prompting command answers `true` at once (it handled the key /
 * click), opens the dialog and applies its edit to the view's state AFTER the answer (`whenPrompted`).
 */
import { openDialog, promptDialog, type DialogLabels } from '@keenmate/web-components-core/dialog';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { LabelResolver } from './labels';

/** The dialog button / close texts from the editor's labels. */
export function dialogLabels(label: LabelResolver): DialogLabels {
  return { ok: label('ok'), cancel: label('cancel'), close: label('close') };
}

export interface EditorPromptOptions {
  /** The question (the dialog's title and accessible name). */
  title: string;
  /** Starting value (selected, so typing replaces it). */
  value?: string;
  /** `<input type>`. Default `'text'`. */
  inputType?: string;
}

/** Ask for one text value; resolves the text, or `null` on cancel / dismiss. Focus returns to the editor. */
export function promptText(view: EditorView | undefined, label: LabelResolver, opts: EditorPromptOptions): Promise<string | null> {
  return promptDialog({
    title: opts.title,
    value: opts.value ?? '',
    inputType: opts.inputType,
    labels: dialogLabels(label),
    trigger: (view?.dom as HTMLElement | undefined) ?? null,
  });
}

/** Ask a yes / no question; resolves `true` on OK. `signal` (a superseded run) closes it as cancelled. */
export async function confirmText(
  opts: { title: string; message?: string; labels?: DialogLabels; trigger?: Element | null; signal?: AbortSignal },
): Promise<boolean> {
  if (opts.signal?.aborted) return false;
  const labels = opts.labels ?? {};
  const handle = openDialog({
    title: opts.title,
    message: opts.message,
    labels,
    trigger: opts.trigger ?? null,
    actions: [
      { value: 'cancel', label: labels.cancel ?? 'Cancel' },
      { value: 'ok', label: labels.ok ?? 'OK', isPrimary: true },
    ],
  });
  const onAbort = (): void => handle.close(null);
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return (await handle.result) === 'ok';
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * A command that asks first: `ask(view)` runs only on a real run (not a dry "is it enabled?" run), and
 * `apply(answer, state)` builds the edit against the view's state at answer time (`null` = do nothing).
 * Without a view (a headless `run`) the command can't ask, so it does nothing.
 */
export function whenPrompted<T>(
  ask: (view: EditorView) => Promise<T | null>,
  apply: (answer: T, state: EditorState) => Transaction | null,
): Command {
  return (_state, dispatch, view) => {
    if (!dispatch) return true;
    if (!view) return false;
    void ask(view).then((answer) => {
      if (answer === null || (view as EditorView & { isDestroyed?: boolean }).isDestroyed) return;
      const tr = apply(answer, view.state);
      if (tr) view.dispatch(tr);
      view.focus();
    });
    return true;
  };
}
