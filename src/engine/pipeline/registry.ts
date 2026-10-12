/**
 * PipelineRegistry (Phase 7; see PIPELINES.md).
 *
 * Holds the engine's named pipeline map and fires pipelines by name. This is the
 * single thing a toolbar button / context-menu entry / keybinding / programmatic
 * `engine.run(name)` all go through — "commands ARE pipelines":
 *
 *   - a `sync` pipeline runs inline and returns whether it resolved (so a keymap
 *     binding falls through on a non-applicable command);
 *   - a `deferred` pipeline kicks off async with an abort token (a re-fire of the
 *     same name supersedes the in-flight run), optional surface lock, the loader
 *     threshold, and the host `InteractionHost` for interactive stages.
 *
 * Observers subscribe per pipeline name via {@link on} and receive the run's
 * start / per-stage / status / result events (drives the dev visualizer and any
 * progress UI). The engine stays headless — the host provides the modal UI and
 * the lock implementation through the injected deps.
 */
import { runStages, runStagesSync, type RunResult } from './runner';
import type {
  InteractionHost,
  Pipeline,
  PipelineContext,
  PipelineEvent,
  PipelineListener,
  StageServices,
} from './types';

export interface PipelineRegistryDeps {
  /** The live editor view (for the dispatch / runCommand write port). */
  getView: () => any;
  /** Snapshot the context a run starts against (`{ doc, extra }`). */
  getContext: () => PipelineContext;
  /** The host modal bridge passed to interactive stages. */
  getInteractionHost: () => InteractionHost;
  /** Lock / unlock the surface for a gating run (a true `setEditable(false)`). */
  setLock: (locked: boolean) => void;
}

/** A sensible headless default: route an interactive request through
 * `window.confirm` (resolve on OK, cancel otherwise). A host that needs a richer
 * picker injects its own via `engine.setInteractionHost`. */
export function defaultInteractionHost(): InteractionHost {
  return {
    async request(req) {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const ok = window.confirm([req.title, req.message].filter(Boolean).join('\n\n'));
        return { cancelled: !ok };
      }
      return { cancelled: true };
    },
  };
}

export class PipelineRegistry {
  #map: Map<string, Pipeline>;
  #deps: PipelineRegistryDeps;
  #running = new Map<string, AbortController>();
  #generation = 0;
  #listeners = new Map<string, Set<PipelineListener>>();

  constructor(map: Map<string, Pipeline>, deps: PipelineRegistryDeps) {
    this.#map = map;
    this.#deps = deps;
  }

  has(name: string): boolean {
    return this.#map.has(name);
  }
  get(name: string): Pipeline | undefined {
    return this.#map.get(name);
  }
  names(): string[] {
    return [...this.#map.keys()];
  }

  /** Subscribe to a pipeline's run events. Returns an unsubscribe fn. */
  on(name: string, listener: PipelineListener): () => void {
    let set = this.#listeners.get(name);
    if (!set) this.#listeners.set(name, (set = new Set()));
    set.add(listener);
    return () => set!.delete(listener);
  }

  #emit(name: string, event: PipelineEvent): void {
    this.#listeners.get(name)?.forEach((fn) => fn(event));
  }

  /** The doc write port handed to every stage of an engine-run pipeline. */
  #services(): StageServices {
    const view = this.#deps.getView();
    return {
      view,
      dispatch: (tr) => view?.dispatch(tr),
      runCommand: (cmd) => (view ? cmd(view.state, view.dispatch, view) : false),
    };
  }

  /**
   * Fire a pipeline by name. Sync → runs now and returns whether it resolved;
   * deferred → kicks off an async run (superseding any in-flight run of the same
   * name) and returns `true`. Unknown name → `false`.
   */
  run(name: string): boolean {
    const pipeline = this.#map.get(name);
    if (!pipeline) return false;
    if (pipeline.timing === 'deferred') {
      void this.#runDeferred(name, pipeline);
      return true;
    }
    this.#emit(name, { type: 'start', generation: ++this.#generation });
    let result: RunResult;
    try {
      result = runStagesSync(
        pipeline,
        this.#deps.getContext(),
        (report) => this.#emit(name, { type: 'stage', report }),
        this.#services()
      );
    } catch (err) {
      this.#emit(name, { type: 'status', status: { phase: 'error', error: err } });
      throw err;
    }
    this.#emit(name, {
      type: 'status',
      status: result.halted ? { phase: 'halted', reason: result.reason } : { phase: 'ready' },
    });
    this.#emit(name, { type: 'result', context: result.context });
    return !result.halted;
  }

  async #runDeferred(name: string, pipeline: Pipeline): Promise<void> {
    this.#running.get(name)?.abort();
    const ac = new AbortController();
    this.#running.set(name, ac);
    const generation = ++this.#generation;
    this.#emit(name, { type: 'start', generation });

    const lock = pipeline.policy?.lock === true;
    if (lock) this.#deps.setLock(true);

    const thresholdMs = pipeline.policy?.thresholdMs ?? 200;
    const thresholdTimer = setTimeout(() => {
      if (this.#running.get(name) === ac) this.#emit(name, { type: 'status', status: { phase: 'pending' } });
    }, thresholdMs);

    try {
      const result = await runStages(
        pipeline,
        this.#deps.getContext(),
        { signal: ac.signal, ui: this.#deps.getInteractionHost(), generation, ...this.#services() },
        (report) => this.#emit(name, { type: 'stage', report })
      );
      clearTimeout(thresholdTimer);
      if (this.#running.get(name) !== ac) return; // superseded — drop silently
      this.#emit(name, {
        type: 'status',
        status: result.halted ? { phase: 'halted', reason: result.reason } : { phase: 'ready' },
      });
      this.#emit(name, { type: 'result', context: result.context });
    } catch (err) {
      clearTimeout(thresholdTimer);
      if (this.#running.get(name) === ac && !ac.signal.aborted) {
        this.#emit(name, { type: 'status', status: { phase: 'error', error: err } });
      }
    } finally {
      const stillCurrent = this.#running.get(name) === ac;
      if (lock && stillCurrent) this.#deps.setLock(false);
      if (stillCurrent) this.#running.delete(name);
    }
  }

  /** Abort every in-flight run (engine teardown). */
  dispose(): void {
    for (const ac of this.#running.values()) ac.abort();
    this.#running.clear();
    this.#listeners.clear();
  }
}
