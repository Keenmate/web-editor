/**
 * PHASES + CONFIG-CELL PROTOTYPE (dev-only; see PIPELINES.md §"Ordering &
 * configuration — phases, the propose/dispose ladder, the config cell").
 *
 * A standalone prototype of the phase-based assembly + config-cell model we
 * designed. It deliberately lives in `src/dev` and does NOT touch the shipped
 * engine (`engine/pipeline/{types,assemble,runner}.ts`) — the plan is to prove the
 * shape here first, then promote it. It mirrors the shipped `assemble.ts` spine
 * (collect stages → fold contributions, in dependency-ordered plugin order) and
 * adds the three pieces that section specifies:
 *
 *   1. a per-pipeline **phase vocabulary** (owned by the pipeline, overridable by
 *      the app owner);
 *   2. **phase assignment** (plugin proposes via `stage.phase`; owner disposes via
 *      `assign`) + **intra-phase order** (owner `order` pins → soft anchors →
 *      declared order, stable-topo-sorted with cycle detection);
 *   3. the **config ladder** (plugin default ← factory override ← per-pipeline
 *      cell), resolved per `(pipeline, stage)` and surfaced to the stage as
 *      `rt.config`.
 *
 * Assembly is strict the same way the serializer contract is: an unknown phase, an
 * `assign`/`order` naming the wrong phase or a missing stage, or an ordering cycle
 * all THROW here rather than silently misbehaving.
 */

// ── Stage / pipeline / plugin shapes (prototype-local; mirror the shipped ones) ──

export type ProtoOutcome =
  | { action: 'resolve'; patch?: Record<string, unknown> }
  | { action: 'halt'; reason?: string }
  | { action: 'skip' };

export interface ProtoContext {
  doc?: unknown;
  extra: Record<string, unknown>;
}

/** Host-provided modal bridge (mirrors the shipped InteractionHost). An
 *  interactive stage awaits `request`; the host renders and resolves. */
export interface ProtoInteractionRequest {
  kind: string;
  title: string;
  payload?: unknown;
}
export interface ProtoInteractionResult {
  cancelled: boolean;
  value?: unknown;
}
export interface ProtoInteractionHost {
  request(req: ProtoInteractionRequest, signal: AbortSignal): Promise<ProtoInteractionResult>;
}

export interface ProtoRuntime {
  /** The stage's resolved config for THIS pipeline (default ← factory ← owner cell). */
  config: Record<string, unknown>;
  signal: AbortSignal;
  generation: number;
  /** Demo observability — the stage narrates what it saw. */
  log: (line: string) => void;
  /** Modal port for interactive stages (A — the editor-in-a-dialog case). */
  ui?: ProtoInteractionHost;
  /** Resolve ANOTHER plugin's public API by name (wrapper / adapter plugins). */
  getApi?: <T = unknown>(name: string) => T | undefined;
}

export interface PhasedStage {
  id: string;
  /** Which phase this stage joins — the plugin's proposal; owner `assign` overrides. */
  phase?: string;
  /** Opens a modal — needs `rt.ui` (A: the interactive editor stage). */
  interactive?: boolean;
  /** Soft intra-phase order: run before a peer IF it's present in the same phase. */
  beforeIfPresent?: string;
  /** Soft intra-phase order: run after a peer IF it's present in the same phase. */
  afterIfPresent?: string;
  /** Layer 1 of the config ladder — the plugin's built-in default. */
  defaultConfig?: Record<string, unknown>;
  run?: (ctx: ProtoContext, rt: ProtoRuntime) => ProtoOutcome | Promise<ProtoOutcome>;
}

/** How a plugin contributes a stage. Hard before/after anchors are the existing,
 *  orthogonal mechanism (see shipped `assemble.ts`); this prototype is about the
 *  *phase* path, so contributions here just join (replace-in-place / append). */
export type PhasedContribution = { stage: PhasedStage } | { remove: string };

export interface ProtoPipeline {
  name: string;
  /** The canonical, ordered phase vocabulary for this pipeline (owner can replace). */
  phases: string[];
  /** Owner-declared stages (usually empty — plugins contribute the work). */
  stages?: PhasedStage[];
}

export interface ProtoPlugin {
  name: string;
  dependencies?: string[];
  /** What this plugin exposes to OTHER plugins (wrappers call it). Opaque here. */
  api?: unknown;
  pipelines?: ProtoPipeline[];
  stages?: Record<string, PhasedContribution[]>;
  /** Layer 2 of the config ladder — a factory override, keyed by stage id.
   *  Simulates `cropPlugin({ ... })` constructed with app-wide options. */
  factoryConfig?: Record<string, Record<string, unknown>>;
}

/** The app owner's authoritative, additive override for one pipeline. */
export interface OwnerPipelineConfig {
  /** Redefine the vocabulary / across-phase order for THIS app. */
  phases?: string[];
  /** Within-phase order, KEYED BY PHASE. Partial — only the stages you name are pinned. */
  order?: Record<string, string[]>;
  /** Deliberate relocation: stageId → phase. The only way to move a stage off its declared phase. */
  assign?: Record<string, string>;
  /** Layer 3 of the config ladder — per-pipeline, per-stage config (the config cell). */
  config?: Record<string, Record<string, unknown>>;
}

export interface AssembledPipeline {
  name: string;
  phases: string[];
  /** Final resolved stage order. */
  stages: PhasedStage[];
  /** Resolved config per stage (the ladder, merged). */
  configByStage: Record<string, Record<string, unknown>>;
  /** Which phase each stage landed in (for the viz). */
  phaseOf: Record<string, string>;
}

// ── Dependency ordering (mirrors the engine's orderPlugins intent) ──────────────

function orderPlugins(plugins: readonly ProtoPlugin[]): ProtoPlugin[] {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const result: ProtoPlugin[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();
  const visit = (p: ProtoPlugin): void => {
    if (done.has(p.name)) return;
    if (onStack.has(p.name)) throw new Error(`Plugin dependency cycle at "${p.name}".`);
    onStack.add(p.name);
    for (const dep of p.dependencies ?? []) {
      const d = byName.get(dep);
      if (d) visit(d);
    }
    onStack.delete(p.name);
    done.add(p.name);
    result.push(p);
  };
  for (const p of plugins) visit(p);
  return result;
}

// ── Intra-phase ordering: owner pins → soft anchors → declared order ────────────

function resolveIntraPhase(
  items: readonly PhasedStage[],
  orderList: readonly string[] | undefined,
  pipelineName: string,
  phase: string
): PhasedStage[] {
  const ids = new Set(items.map((s) => s.id));

  // rank = sort key / tiebreak: owner-pinned stages first (in their listed order),
  // then everything else in declared order.
  const rank = new Map<string, number>();
  items.forEach((s, i) => {
    const pin = orderList ? orderList.indexOf(s.id) : -1;
    rank.set(s.id, pin >= 0 ? pin : 1000 + i);
  });

  // edges: [a, b] means "a must come before b".
  const edges: Array<[string, string]> = [];
  if (orderList) {
    const present = orderList.filter((id) => ids.has(id));
    for (let i = 0; i < present.length - 1; i++) edges.push([present[i], present[i + 1]]);
  }
  for (const s of items) {
    if (s.beforeIfPresent && ids.has(s.beforeIfPresent)) edges.push([s.id, s.beforeIfPresent]);
    if (s.afterIfPresent && ids.has(s.afterIfPresent)) edges.push([s.afterIfPresent, s.id]);
  }

  // Kahn's topological sort, breaking ties by rank (stable, deterministic).
  const indeg = new Map<string, number>(items.map((s) => [s.id, 0]));
  const adj = new Map<string, string[]>(items.map((s) => [s.id, []]));
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const byId = new Map(items.map((s) => [s.id, s]));
  const ready = new Set(items.filter((s) => indeg.get(s.id) === 0).map((s) => s.id));
  const out: PhasedStage[] = [];
  while (ready.size) {
    const next = [...ready].sort((x, y) => rank.get(x)! - rank.get(y)!)[0];
    ready.delete(next);
    out.push(byId.get(next)!);
    for (const m of adj.get(next)!) {
      indeg.set(m, indeg.get(m)! - 1);
      if (indeg.get(m) === 0) ready.add(m);
    }
  }
  if (out.length !== items.length) {
    const stuck = items.filter((s) => !out.includes(s)).map((s) => s.id);
    throw new Error(`Ordering cycle in phase "${phase}" of "${pipelineName}": ${stuck.join(' ⇄ ')}.`);
  }
  return out;
}

// ── Assembly ────────────────────────────────────────────────────────────────────

export function assemblePhased(
  plugins: readonly ProtoPlugin[],
  pipelineName: string,
  owner: OwnerPipelineConfig = {}
): AssembledPipeline {
  const ordered = orderPlugins(plugins);

  // The declaring pipeline (last plugin to declare the name wins, as groups do).
  let pipe: ProtoPipeline | undefined;
  for (const p of ordered) {
    const found = (p.pipelines ?? []).find((pp) => pp.name === pipelineName);
    if (found) pipe = found;
  }
  if (!pipe) throw new Error(`No pipeline named "${pipelineName}" is declared by any plugin.`);

  const phases = owner.phases ?? pipe.phases;
  if (!phases || phases.length === 0) throw new Error(`Pipeline "${pipelineName}" has no phases.`);
  const phaseSet = new Set(phases);

  // 1. Collect stages: owner-declared, then contributions folded in plugin order.
  //    Gather the factory-config layer along the way.
  const stages: PhasedStage[] = [...(pipe.stages ?? [])];
  const factoryConfig: Record<string, Record<string, unknown>> = {};
  for (const p of ordered) {
    for (const [sid, cfg] of Object.entries(p.factoryConfig ?? {})) {
      factoryConfig[sid] = { ...(factoryConfig[sid] ?? {}), ...cfg };
    }
    for (const c of p.stages?.[pipelineName] ?? []) {
      if ('remove' in c) {
        const idx = stages.findIndex((s) => s.id === c.remove);
        if (idx === -1)
          throw new Error(`Plugin "${p.name}": cannot remove stage "${c.remove}" — not in "${pipelineName}".`);
        stages.splice(idx, 1);
      } else {
        const idx = stages.findIndex((s) => s.id === c.stage.id);
        if (idx === -1) stages.push(c.stage);
        else stages[idx] = c.stage;
      }
    }
  }

  // 2. Assign each stage to a phase (owner.assign > stage.phase > first phase).
  const phaseOf: Record<string, string> = {};
  for (const s of stages) {
    const phase = owner.assign?.[s.id] ?? s.phase ?? phases[0];
    if (!phaseSet.has(phase))
      throw new Error(
        `Stage "${s.id}" → unknown phase "${phase}" in "${pipelineName}". Known phases: ${phases.join(', ')}.`
      );
    phaseOf[s.id] = phase;
  }

  // 3. Validate owner.order references (unknown phase / stage, or wrong phase).
  for (const [phase, idList] of Object.entries(owner.order ?? {})) {
    if (!phaseSet.has(phase)) throw new Error(`owner.order names unknown phase "${phase}" in "${pipelineName}".`);
    for (const id of idList) {
      if (!stages.some((s) => s.id === id)) throw new Error(`owner.order["${phase}"] names unknown stage "${id}".`);
      if (phaseOf[id] !== phase)
        throw new Error(
          `owner.order["${phase}"] lists "${id}", but it is in phase "${phaseOf[id]}". Use assign to relocate it.`
        );
    }
  }

  // 4. Order within each phase, then concatenate in vocabulary order.
  const final: PhasedStage[] = [];
  for (const phase of phases) {
    const inPhase = stages.filter((s) => phaseOf[s.id] === phase);
    final.push(...resolveIntraPhase(inPhase, owner.order?.[phase], pipelineName, phase));
  }

  // 5. Resolve the config ladder per stage (shallow-merge, later layer wins).
  const configByStage: Record<string, Record<string, unknown>> = {};
  for (const s of final) {
    configByStage[s.id] = {
      ...(s.defaultConfig ?? {}),
      ...(factoryConfig[s.id] ?? {}),
      ...(owner.config?.[s.id] ?? {}),
    };
  }

  return { name: pipelineName, phases, stages: final, configByStage, phaseOf };
}

// ── Execution (prove rt.config threads through to run()) ────────────────────────

/** Build the plugin-API registry (resolve a plugin's public `api` by name) from a
 *  plugin set — the mechanism wrapper/adapter plugins use to call another plugin. */
export function buildApiRegistry(plugins: readonly ProtoPlugin[]): <T = unknown>(name: string) => T | undefined {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  return <T = unknown>(name: string) => byName.get(name)?.api as T | undefined;
}

export interface RunDeps {
  /** Modal port for interactive stages. */
  ui?: ProtoInteractionHost;
  /** Resolve another plugin's public API by name. */
  getApi?: <T = unknown>(name: string) => T | undefined;
}

export async function runAssembled(
  asm: AssembledPipeline,
  initial: ProtoContext,
  log: (line: string) => void,
  deps: RunDeps = {}
): Promise<ProtoContext> {
  let ctx = initial;
  const controller = new AbortController();
  for (const s of asm.stages) {
    if (!s.run) continue;
    if (s.interactive && !deps.ui) {
      log(`⚠ ${s.id} is interactive but no host was provided — skipping.`);
      continue;
    }
    const rt: ProtoRuntime = {
      config: asm.configByStage[s.id] ?? {},
      signal: controller.signal,
      generation: 1,
      log,
      ui: deps.ui,
      getApi: deps.getApi,
    };
    const outcome = await s.run(ctx, rt);
    if (outcome.action === 'halt') {
      log(`⛔ ${s.id} halted${outcome.reason ? `: ${outcome.reason}` : ''}`);
      break;
    }
    if (outcome.action === 'resolve' && outcome.patch) {
      ctx = { ...ctx, extra: { ...ctx.extra, ...outcome.patch } };
    }
  }
  return ctx;
}
