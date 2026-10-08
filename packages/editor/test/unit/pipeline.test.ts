/**
 * Pipeline core tests (PIPELINES.md). Covers the two load-bearing pieces:
 * `runStages` (sequential outcome folding — resolve/halt/skip, abort) and
 * `DeferredRunner` (debounce coalescing, the loader-threshold "defer the spinner"
 * window, and the generation token that drops stale runs). Timers are faked so
 * the async machinery is deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runStages, runStagesSync, DeferredRunner } from '../../src/engine/pipeline/runner';
import type { InteractionHost, Pipeline, PipelineContext, RunStatus } from '../../src/engine/pipeline/types';

const noopUi: InteractionHost = { request: async () => ({ cancelled: true }) };
const ctx = (extra: Record<string, unknown> = {}): PipelineContext => ({ doc: null, extra });
const rt = (signal = new AbortController().signal) => ({ signal, ui: noopUi, generation: 1 });

describe('runStages', () => {
  it('threads resolve patches into extra sequentially', async () => {
    const pipeline: Pipeline = {
      name: 't', timing: 'deferred',
      stages: [
        { id: 'a', run: () => ({ action: 'resolve', patch: { a: 1 } }) },
        { id: 'b', run: (c) => ({ action: 'resolve', patch: { b: (c.extra.a as number) + 1 } }) },
      ],
    };
    const res = await runStages(pipeline, ctx(), rt());
    expect(res.halted).toBe(false);
    expect(res.context.extra).toEqual({ a: 1, b: 2 });
  });

  it('halt stops the chain and reports the reason; later stages do not run', async () => {
    const after = vi.fn();
    const pipeline: Pipeline = {
      name: 't', timing: 'deferred',
      stages: [
        { id: 'a', run: () => ({ action: 'resolve', patch: { a: 1 } }) },
        { id: 'stop', run: () => ({ action: 'halt', reason: 'nope' }) },
        { id: 'c', run: () => { after(); return { action: 'resolve', patch: { c: 3 } }; } },
      ],
    };
    const res = await runStages(pipeline, ctx(), rt());
    expect(res.halted).toBe(true);
    expect(res.reason).toBe('nope');
    expect(res.context.extra).toEqual({ a: 1 });
    expect(after).not.toHaveBeenCalled();
  });

  it('skip continues unchanged', async () => {
    const pipeline: Pipeline = {
      name: 't', timing: 'deferred',
      stages: [
        { id: 'a', run: () => ({ action: 'skip' }) },
        { id: 'b', run: () => ({ action: 'resolve', patch: { b: 2 } }) },
      ],
    };
    const res = await runStages(pipeline, ctx(), rt());
    expect(res.context.extra).toEqual({ b: 2 });
  });

  it('halts immediately when the signal is already aborted', async () => {
    const run = vi.fn(() => ({ action: 'skip' as const }));
    const pipeline: Pipeline = { name: 't', timing: 'deferred', stages: [{ id: 'a', run }] };
    const ac = new AbortController();
    ac.abort();
    const res = await runStages(pipeline, ctx(), rt(ac.signal));
    expect(res.halted).toBe(true);
    expect(res.reason).toBe('aborted');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('runStagesSync', () => {
  it('threads a payload through extra and honors halt', () => {
    // Models the paste pipeline shape: payload rides in extra.html.
    const pipeline: Pipeline = {
      name: 'paste', timing: 'sync',
      stages: [
        { id: 'upper', run: (c) => ({ action: 'resolve', patch: { html: (c.extra.html as string).toUpperCase() } }) },
        { id: 'guard', run: (c) => (c.extra.html as string).includes('X') ? { action: 'halt', reason: 'bad' } : { action: 'skip' } },
        { id: 'after', run: () => ({ action: 'resolve', patch: { reached: true } }) },
      ],
    };
    const ok = runStagesSync(pipeline, ctx({ html: 'abc' }));
    expect(ok.halted).toBe(false);
    expect(ok.context.extra).toEqual({ html: 'ABC', reached: true });

    const halted = runStagesSync(pipeline, ctx({ html: 'axc' }));
    expect(halted.halted).toBe(true);
    expect(halted.reason).toBe('bad');
    expect(halted.context.extra.reached).toBeUndefined(); // stage after halt never ran
  });

  it('throws on an async stage (sync pipelines cannot await)', () => {
    const pipeline: Pipeline = {
      name: 'paste', timing: 'sync',
      stages: [{ id: 'nope', run: async () => ({ action: 'skip' }) }],
    };
    expect(() => runStagesSync(pipeline, ctx())).toThrow(/Promise/);
  });

  it('throws on an interactive stage', () => {
    const pipeline: Pipeline = {
      name: 'paste', timing: 'sync',
      stages: [{ id: 'dialog', interactive: true, run: () => ({ action: 'skip' }) }],
    };
    expect(() => runStagesSync(pipeline, ctx())).toThrow(/interactive/);
  });
});

describe('DeferredRunner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const makeRunner = (pipeline: Pipeline, doc: () => any) => {
    const statuses: RunStatus[] = [];
    const results: PipelineContext[] = [];
    const runner = new DeferredRunner(pipeline, {
      getContext: () => ({ doc: doc(), extra: {} }),
      ui: noopUi,
      onStatus: (s) => statuses.push(s),
      onResult: (c) => results.push(c),
    });
    return { runner, statuses, results };
  };

  it('debounces: rapid schedules collapse into a single run', async () => {
    const runCount = vi.fn();
    const pipeline: Pipeline = {
      name: 'idle', timing: 'deferred', policy: { debounceMs: 800, thresholdMs: 200 },
      stages: [{ id: 'a', run: () => { runCount(); return { action: 'resolve', patch: { ok: true } }; } }],
    };
    const { runner, results } = makeRunner(pipeline, () => null);
    runner.schedule();
    runner.schedule();
    runner.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(runCount).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].extra).toEqual({ ok: true });
  });

  it('a fast run never surfaces the pending indicator; a slow one does', async () => {
    // Fast: resolves synchronously, well under the 200ms threshold.
    const fast: Pipeline = {
      name: 'idle', timing: 'deferred', policy: { debounceMs: 0, thresholdMs: 200 },
      stages: [{ id: 'a', run: () => ({ action: 'resolve', patch: { x: 1 } }) }],
    };
    const r1 = makeRunner(fast, () => null);
    r1.runner.schedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(r1.statuses.map((s) => s.phase)).toEqual(['ready']);

    // Slow: a stage that outlasts the threshold → pending, then ready.
    const slow: Pipeline = {
      name: 'idle', timing: 'deferred', policy: { debounceMs: 0, thresholdMs: 200 },
      stages: [{ id: 'a', run: () => new Promise((res) => setTimeout(() => res({ action: 'resolve', patch: { x: 1 } }), 1000)) }],
    };
    const r2 = makeRunner(slow, () => null);
    r2.runner.schedule();
    await vi.advanceTimersByTimeAsync(250); // past the threshold, before the stage resolves
    expect(r2.statuses.map((s) => s.phase)).toContain('pending');
    await vi.advanceTimersByTimeAsync(1000);
    expect(r2.statuses[r2.statuses.length - 1].phase).toBe('ready');
  });

  it('drops a stale run: a newer schedule supersedes an in-flight one', async () => {
    let docValue = 'first';
    const slow: Pipeline = {
      name: 'idle', timing: 'deferred', policy: { debounceMs: 0, thresholdMs: 200 },
      stages: [
        {
          id: 'echo',
          run: (c, r) =>
            new Promise((resolve, reject) => {
              const t = setTimeout(() => resolve({ action: 'resolve', patch: { doc: c.doc } }), 500);
              r.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
            }),
        },
      ],
    };
    const { runner, results } = makeRunner(slow, () => docValue);
    runner.schedule();                       // run #1 fires against 'first'
    await vi.advanceTimersByTimeAsync(100);  // in-flight
    docValue = 'second';
    runner.schedule();                       // run #2 supersedes #1 (aborts it)
    await vi.advanceTimersByTimeAsync(600);
    // Only the latest run's result lands, and it's the fresh document.
    expect(results).toHaveLength(1);
    expect(results[0].extra).toEqual({ doc: 'second' });
  });
});
