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
import { notifyListeners } from '@keenmate/web-components-core';
import { confirmText, dialogLabels } from '../../dialogs';
import type { LabelResolver } from '../../labels';
import { PendingGate, runStages, runStagesSync, type RunResult } from './runner';
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
  /** Lock / unlock the surface for a gating run (a true ProseMirror `editable: false`, separate from `isReadonly`). */
  setLock: (locked: boolean) => void;
  /** Label resolver handed to stages as `rt.label` (optional). */
  label?: StageServices['label'];
  /** View-mode switch handed to stages as `rt.setViewMode` (hosted engines only). */
  setViewMode?: StageServices['setViewMode'];
  /** The element a throwing run-event listener is logged against (its instance logger); absent → core's logger. */
  getLogSource?: () => unknown;
}

/** The default host: an interactive request becomes a core `/dialog` confirmation (resolve on OK, cancel
 * otherwise; a superseded run closes it). Button texts come from the editor's `labels` (`buttons.ok` / `buttons.cancel` /
 * `ariaLabels.close`) when the ctx carries its `label` resolver. A host that needs a richer picker injects its own via
 * `engine.setOptions({ interactionHost })` / the element's `interactionHost`. */
export function defaultInteractionHost(): InteractionHost {
  return {
    async request(req) {
      if (typeof document === 'undefined') return { isCancelled: true };
      const label = (req as { label?: LabelResolver }).label;
      const isOk = await confirmText({
        title: req.title,
        message: req.message,
        labels: label ? dialogLabels(label) : undefined,
        trigger: req.element ?? null,
        signal: req.signal,
      });
      return { isCancelled: !isOk };
    },
  };
}

export class PipelineRegistry {
  #map: Map<string, Pipeline>;
  #deps: PipelineRegistryDeps;
  #running = new Map<string, AbortController>();
  #generation = 0;
  #listeners = new Map<string, Set<PipelineListener>>();
  #anyListeners = new Set<(name: string, event: PipelineEvent) => void>();

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

  /** Subscribe to every pipeline's run events (`(name, event)`). Returns an unsubscribe fn. */
  onAny(listener: (name: string, event: PipelineEvent) => void): () => void {
    this.#anyListeners.add(listener);
    return () => this.#anyListeners.delete(listener);
  }

  /** Deliver a run event (core `notifyListeners`: a throwing listener is logged and skipped, the rest still hear it). */
  #emit(name: string, event: PipelineEvent): void {
    const log = { source: this.#deps.getLogSource?.() ?? null, category: 'UI', coreCategory: 'ELEMENT' as const, message: `pipeline "${name}" listener threw` };
    const listeners = this.#listeners.get(name);
    if (listeners?.size) notifyListeners(listeners, event, log);
    if (this.#anyListeners.size) notifyListeners([...this.#anyListeners].map((fn) => (e: PipelineEvent) => fn(name, e)), event, log);
  }

  /** The doc write port handed to every stage of an engine-run pipeline. */
  #services(): StageServices {
    const view = this.#deps.getView();
    return {
      view,
      dispatch: (tr) => view?.dispatch(tr),
      runCommand: (cmd) => (view ? cmd(view.state, view.dispatch, view) : false),
      ...(this.#deps.label ? { label: this.#deps.label } : {}),
      ...(this.#deps.setViewMode ? { setViewMode: this.#deps.setViewMode } : {}),
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

    const lock = pipeline.policy?.shouldLock === true;
    if (lock) this.#deps.setLock(true);

    // The loader threshold counts working time only — paused while a dialog waits
    // for the user (`waiting`), restarted when it closes.
    const gate = new PendingGate(
      pipeline.policy?.thresholdMs ?? 200,
      (status) => this.#emit(name, { type: 'status', status }),
      () => this.#running.get(name) === ac
    );
    gate.start();

    try {
      const result = await runStages(
        pipeline,
        this.#deps.getContext(),
        { signal: ac.signal, ui: gate.wrap(this.#deps.getInteractionHost()), generation, ...this.#services() },
        (report) => this.#emit(name, { type: 'stage', report })
      );
      gate.stop();
      if (this.#running.get(name) !== ac) return; // superseded — drop silently
      this.#emit(name, {
        type: 'status',
        status: result.halted ? { phase: 'halted', reason: result.reason } : { phase: 'ready' },
      });
      this.#emit(name, { type: 'result', context: result.context });
    } catch (err) {
      gate.stop();
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
    this.#anyListeners.clear();
  }
}
