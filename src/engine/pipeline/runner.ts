/**
 * Pipeline runner (proposed Phase 7; see PIPELINES.md).
 *
 * `runStages` folds a context through a pipeline's stages sequentially, honoring
 * the three outcomes (resolve / halt / skip). `DeferredRunner` wraps a deferred
 * pipeline with the async machinery: debounce, a monotonic generation token
 * (stale runs are dropped), a loader threshold (the "defer the spinner" window),
 * and an `AbortSignal` that supersedes in-flight work.
 */
import type {
  InteractionHost,
  Pipeline,
  PipelineContext,
  RunStatus,
  StageOutcome,
  StageReporter,
  StageServices,
} from './types';

export interface RunResult {
  context: PipelineContext;
  halted: boolean;
  reason?: string;
}

const NEVER_ABORT = new AbortController().signal;
const NO_INTERACTION: InteractionHost = {
  request() {
    throw new Error('Interactive stages are not allowed in a sync pipeline.');
  },
};

/**
 * Run a `sync` pipeline to completion synchronously — for triggers that ride the
 * browser's native synchronous events (paste / copy / keydown) and cannot await.
 * Stages must return an outcome directly; an async or interactive stage throws
 * (the design-doc contract that dialogs/awaits belong only to deferred pipelines).
 */
export function runStagesSync(
  pipeline: Pipeline,
  context: PipelineContext,
  report?: StageReporter,
  services?: StageServices
): RunResult {
  let ctx = context;
  for (const stage of pipeline.stages) {
    if (stage.interactive) {
      throw new Error(`Sync pipeline "${pipeline.name}" cannot contain interactive stage "${stage.id}".`);
    }
    report?.({ stageId: stage.id, phase: 'running' });
    let outcome: StageOutcome;
    try {
      const result = stage.run(ctx, { signal: NEVER_ABORT, ui: NO_INTERACTION, generation: 0, ...services });
      if (result && typeof (result as Promise<StageOutcome>).then === 'function') {
        throw new Error(`Sync pipeline "${pipeline.name}" stage "${stage.id}" returned a Promise.`);
      }
      outcome = result as StageOutcome;
    } catch (err) {
      report?.({ stageId: stage.id, phase: 'error', error: err });
      throw err;
    }
    if (outcome.action === 'halt') {
      report?.({ stageId: stage.id, phase: 'halted' });
      return { context: ctx, halted: true, reason: outcome.reason };
    }
    if (outcome.action === 'resolve') {
      if (outcome.patch) ctx = { ...ctx, extra: { ...ctx.extra, ...outcome.patch } };
      report?.({ stageId: stage.id, phase: 'ok' });
    } else {
      report?.({ stageId: stage.id, phase: 'skipped' });
    }
  }
  return { context: ctx, halted: false };
}

/**
 * Run every stage in order, threading the context. The optional `report` observer
 * sees each stage transition (running → ok/skipped/halted/error/aborted) for
 * step-level visualization. Throws only on an unexpected stage error (after
 * reporting it).
 */
export async function runStages(
  pipeline: Pipeline,
  context: PipelineContext,
  rt: { signal: AbortSignal; ui: InteractionHost; generation: number },
  report?: StageReporter
): Promise<RunResult> {
  let ctx = context;
  for (const stage of pipeline.stages) {
    if (rt.signal.aborted) {
      report?.({ stageId: stage.id, phase: 'aborted' });
      return { context: ctx, halted: true, reason: 'aborted' };
    }
    report?.({ stageId: stage.id, phase: 'running' });
    let outcome;
    try {
      outcome = await stage.run(ctx, rt);
    } catch (err) {
      report?.({ stageId: stage.id, phase: rt.signal.aborted ? 'aborted' : 'error', error: err });
      throw err;
    }
    if (outcome.action === 'halt') {
      report?.({ stageId: stage.id, phase: 'halted' });
      return { context: ctx, halted: true, reason: outcome.reason };
    }
    if (outcome.action === 'resolve') {
      if (outcome.patch) ctx = { ...ctx, extra: { ...ctx.extra, ...outcome.patch } };
      report?.({ stageId: stage.id, phase: 'ok' });
    } else {
      report?.({ stageId: stage.id, phase: 'skipped' });
    }
  }
  return { context: ctx, halted: false };
}

export interface DeferredRunnerDeps {
  /** Snapshot the current context at the moment a run fires (post-debounce). */
  getContext: () => PipelineContext;
  /** Host modal bridge passed to interactive stages. */
  ui: InteractionHost;
  /** Status transitions (drive scoped spinners / error UI). */
  onStatus: (status: RunStatus) => void;
  /** A completed, non-stale run's merged context. */
  onResult: (context: PipelineContext) => void;
  /** Fired when a run begins (post-debounce), before any stage — reset step UI. */
  onStart?: (generation: number) => void;
  /** Per-stage transitions for step-level visualization. */
  onStage?: StageReporter;
}

/**
 * Debounced, cancellable runner for a single deferred pipeline. Call `schedule()`
 * on each change; it coalesces, runs once idle, drops stale results, and only
 * surfaces `pending` if the run outlasts the threshold.
 */
export class DeferredRunner {
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private thresholdTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private current: AbortController | undefined;

  constructor(
    private readonly pipeline: Pipeline,
    private readonly deps: DeferredRunnerDeps
  ) {}

  /** Debounce a run. Later calls within the window reset the timer. */
  schedule(): void {
    clearTimeout(this.debounceTimer);
    const wait = this.pipeline.policy?.debounceMs ?? 1000;
    this.debounceTimer = setTimeout(() => void this.fire(), wait);
  }

  private async fire(): Promise<void> {
    // Supersede any in-flight run (aborts its fetches / closes its dialog).
    this.current?.abort();
    clearTimeout(this.thresholdTimer);

    const generation = ++this.generation;
    const controller = new AbortController();
    this.current = controller;
    this.deps.onStart?.(generation);

    // Defer the pending indicator: only show it if the run is still the latest
    // and still running when the threshold fires.
    const threshold = this.pipeline.policy?.thresholdMs ?? 200;
    this.thresholdTimer = setTimeout(() => {
      if (generation === this.generation) this.deps.onStatus({ phase: 'pending' });
    }, threshold);

    try {
      const result = await runStages(
        this.pipeline,
        this.deps.getContext(),
        { signal: controller.signal, ui: this.deps.ui, generation },
        this.deps.onStage
      );
      clearTimeout(this.thresholdTimer);
      if (generation !== this.generation) return; // superseded — drop silently
      if (result.halted) {
        this.deps.onStatus({ phase: 'halted', reason: result.reason });
        return;
      }
      this.deps.onResult(result.context);
      this.deps.onStatus({ phase: 'ready' });
    } catch (err) {
      clearTimeout(this.thresholdTimer);
      // A superseded run that threw on abort is not an error the user cares about.
      if (generation === this.generation) this.deps.onStatus({ phase: 'error', error: err });
    }
  }

  dispose(): void {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.thresholdTimer);
    this.current?.abort();
  }
}
