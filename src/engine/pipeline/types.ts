/**
 * Pipeline layer — types (proposed Phase 7; see PIPELINES.md).
 *
 * A pipeline is a named, trigger-bound, ordered chain of async stages that thread
 * a context `{ doc, extra }`. Stages never mutate in place — each returns an
 * outcome (merge a patch into `extra`, halt the chain, or skip). This file is the
 * reusable core; the demo (`src/dev/pipeline-demo.ts`) drives it against the
 * engine's `change` event without any engine surgery.
 *
 * PM types are kept loose (`any`) where importing them would leak ProseMirror
 * internals across this boundary, matching the loose-TS posture of the repo.
 */

/** The value threaded through a pipeline run. `extra` is derived data outside the text. */
export interface PipelineContext {
  /** The ProseMirror document (read-only for derive stages). */
  doc: any;
  /** Derived / attached data that lives alongside — not inside — the content. */
  extra: Record<string, unknown>;
}

/** A stage's result: merge-and-continue, stop the chain, or continue unchanged. */
export type StageOutcome =
  | { action: 'resolve'; patch?: Record<string, unknown> }
  | { action: 'halt'; reason?: string }
  | { action: 'skip' };

/**
 * Write port into the live editor — the bridge a stage uses to actually change
 * the document (the `insert` stage of a cloud-image pipeline, the command a
 * wrapped command-pipeline runs). Present when a pipeline is run by the engine;
 * absent in pure unit runs (a stage that writes must tolerate their absence).
 *
 * PM types are kept loose (`any`) to avoid leaking ProseMirror across this seam.
 */
export interface StageServices {
  /** The live `EditorView` (read `view.state`, `view.state.schema`, …). */
  view?: any;
  /** Dispatch a ProseMirror transaction against the live view. */
  dispatch?: (tr: any) => void;
  /** Run a ProseMirror `Command` against the live view; returns whether it applied. */
  runCommand?: (command: (state: any, dispatch?: any, view?: any) => boolean) => boolean;
}

/** Per-run services handed to a stage. */
export interface StageRuntime extends StageServices {
  /** Aborted when a newer run supersedes this one — cancel in-flight work. */
  signal: AbortSignal;
  /** Host-injected modal port (headless engine; the host renders the UI). */
  ui: InteractionHost;
  /** Monotonic run id; a result from a non-latest generation is dropped. */
  generation: number;
}

export interface PipelineStage {
  id: string;
  run: (ctx: PipelineContext, rt: StageRuntime) => Promise<StageOutcome> | StageOutcome;
  /** Opens a modal — allowed only in suspendable (deferred) pipelines. */
  interactive?: boolean;
}

/**
 * How a plugin contributes a stage into an existing pipeline (keyed by pipeline
 * name in `EditorPlugin.stages`). This is the universal extension bus: a late
 * plugin splices a stage into another's pipeline by anchor, without either
 * importing the other.
 *
 * - `{ stage, before }` / `{ stage, after }` — insert relative to an existing id.
 * - `{ stage }` — replace-in-place if its id already exists, else append.
 * - `{ remove }` — drop a stage by id.
 *
 * A `before`/`after`/`remove` naming a missing stage throws at assembly (a silent
 * no-op would hide a broken hook — same load-bearing strictness as the Markdown
 * serializer contract).
 */
export type StageContribution =
  | { stage: PipelineStage; before: string }
  | { stage: PipelineStage; after: string }
  | { stage: PipelineStage }
  | { remove: string };

/**
 * `sync` pipelines ride the browser's synchronous native events (paste/copy/key)
 * and cannot truly await; `deferred` pipelines get the debounce/threshold/abort
 * machinery. Only deferred pipelines may contain interactive stages.
 */
export type Timing = 'sync' | 'deferred';

export interface PipelinePolicy {
  /** Coalesce rapid triggers; don't start a run until this much idle passes. */
  debounceMs?: number;
  /** Delay before a pending indicator shows (the "defer the spinner" window). */
  thresholdMs?: number;
  /** Whether a run locks the surface. Dialogs always lock regardless. */
  lock?: boolean;
}

export interface Pipeline {
  name: string;
  timing: Timing;
  stages: PipelineStage[];
  policy?: PipelinePolicy;
}

/** Live status of a deferred run, for scoped per-feature indicators. */
export type RunStatus =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'ready' }
  | { phase: 'error'; error: unknown }
  | { phase: 'halted'; reason?: string };

/** Per-stage lifecycle phase, for step-level visualization. */
export type StagePhase = 'running' | 'ok' | 'skipped' | 'halted' | 'error' | 'aborted';

export interface StageReport {
  stageId: string;
  phase: StagePhase;
  error?: unknown;
}

/** Optional observer that sees each stage transition as a run progresses. */
export type StageReporter = (report: StageReport) => void;

/**
 * A run event emitted by the {@link PipelineRegistry} for a named pipeline —
 * everything an observer (a visualizer, a progress UI) needs to follow a run:
 * `start` (reset), `stage` (per-step), `status` (run-level), `result` (final
 * merged context). Listeners subscribe per pipeline name.
 */
export type PipelineEvent =
  | { type: 'start'; generation: number }
  | { type: 'stage'; report: StageReport }
  | { type: 'status'; status: RunStatus }
  | { type: 'result'; context: PipelineContext };

export type PipelineListener = (event: PipelineEvent) => void;

// ── Interaction port ────────────────────────────────────────────────────────

export interface InteractionRequest {
  kind: string;
  title: string;
  message?: string;
  payload?: unknown;
}

export interface InteractionResult {
  cancelled: boolean;
  value?: unknown;
}

/**
 * Host-provided modal bridge. The engine calls `request` and awaits it; the host
 * renders however it likes and resolves when the user is done. Must honor the
 * `signal` (close the dialog if the run is superseded).
 */
export interface InteractionHost {
  request(req: InteractionRequest, signal: AbortSignal): Promise<InteractionResult>;
}
