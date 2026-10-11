# Pipelines — design note (Phase 7)

> Status: **implemented in the engine**. This describes the content-processing
> pipeline layer. The design is below; the "commands ARE pipelines" decision and
> the cloud-image worked example are now live in `src/engine/pipeline/`
> (`types` / `runner` / `assemble` / `registry`), wired into `EditorEngine`
> (`engine.pipelines`, `engine.run`, `engine.setInteractionHost`, the `lock`
> event) and exported from `index.ts`. The first-party `imageBrowserPlugin` /
> `imageBase64Plugin` and the `pipelines.html` visualizer exercise it end to end.
> The **Demo slice** at the end records the dev-playground proof that preceded the
> engine integration.

## The idea in one paragraph

A **pipeline** is a named, trigger-bound, ordered chain of **async stages** that
thread a **context** `{ doc, extra }`. Stages never mutate in place — each returns
the next context (or a patch to merge). Content transforms (Word cleanup,
reformat) run at the **edges** (paste, copy); derivations (TOC, summary, related
docs) run on a debounced **idle** trigger and write to `extra` — a field that
lives *outside* the text but still round-trips at serialize time. This is not a
rework of the existing `EditorPlugin` assembly system (schema/commands/chrome);
it is a new, parallel capability that plugins contribute into.

## Core concepts

### 1. Context — what gets threaded

```ts
interface PipelineContext {
  doc: PMNode;                     // the content (read-only for derive stages)
  extra: Record<string, unknown>;  // derived / attached data, outside the text
}
```

Each trigger extends this base with its own payload (paste → incoming slice;
copy → outgoing slice; keydown → the `KeyboardEvent`). Today the engine threads
only `doc`; **`extra` is the new primitive** and the home for everything derived.

### 2. Stage — the unit of work

```ts
type StageOutcome =
  | { action: 'resolve'; patch?: Record<string, unknown> } // merge patch → extra, continue
  | { action: 'halt'; reason?: string }                     // stop the chain (abort the paste, …)
  | { action: 'skip' };                                     // continue unchanged

interface PipelineStage {
  id: string;
  run: (ctx: PipelineContext, rt: StageRuntime) => Promise<StageOutcome> | StageOutcome;
  interactive?: boolean; // opens a modal — allowed only in suspendable pipelines
}

interface StageRuntime {
  signal: AbortSignal;       // superseded runs cancel in-flight work
  ui: InteractionHost;       // injected modal port (see §6)
  generation: number;        // monotonic run id (stale-drop)
}
```

**Async by default.** The runner always awaits. Sync stages just return an
outcome directly. Stages run **sequentially** (a true pipe), each seeing the
previous one's merged `extra`.

### 3. Pipeline — named + triggered + timed

```ts
type Timing = 'sync' | 'deferred';

interface Pipeline {
  name: string;                 // "paste" | "copy" | "keydown" | "idle" | custom
  timing: Timing;
  stages: PipelineStage[];
  policy?: { debounceMs?: number; thresholdMs?: number; lock?: boolean };
}
```

The engine hosts a **registry** of pipelines keyed by name and wires each to its
trigger source. Plugins contribute stages into a named pipeline (and may declare
new pipelines), ordered by the existing plugin dependency / id-layering rules.

### 4. Triggers → ProseMirror event sources

| Pipeline | Source | Direction | Timing |
|---|---|---|---|
| paste | `transformPastedHTML` / `transformPasted` / `handlePaste` | in | sync |
| copy / cut | `transformCopied` / clipboard serializer | out (clipboard) | sync |
| keydown | `handleKeyDown` | per-key | sync |
| idle | debounced transaction subscription | after typing settles | deferred |
| serialize | `getMarkdown` / `getHTML` / `getJSON` | out (format) | sync |
| *(open set)* | focus / blur / drop / change … | — | — |

### 5. Timing class — the rule that keeps it sane

- **sync** (paste, copy, keydown) — ride the browser's synchronous native event;
  cannot truly `await`. Short local transforms only.
- **deferred** (idle, deep checks) — fully async: debounced, cancellable,
  non-locking, with the generation-token + status model below.

The async machinery (debounce, threshold, abort, generation) attaches **only to
deferred pipelines**.

### 6. Async machinery (deferred pipelines)

- **Debounce** — coalesce keystrokes; don't start a run until typing settles
  (default ~1000ms for idle).
- **Loader threshold** — a *second* timer started when the run starts
  (default 200ms, configurable). If the run resolves first → merge silently, no
  indicator. If the threshold fires first → surface a **scoped** pending state.
- **Generation token** — each run gets a monotonic id; a result from a non-latest
  run is **dropped**, preventing stale clobbering and out-of-order merges.
- **AbortSignal** — a superseded run cancels its in-flight `fetch`es / waits.
- **Per-stage status** — `extra` entries carry a small state machine so the chrome
  can render per-feature spinners, not a global lock:

```ts
type DerivedStatus =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'ready' }
  | { phase: 'error'; error: unknown }
  | { phase: 'halted'; reason?: string };
```

### 7. Interaction port — modal, pausing, host-defined

A stage may open a **dialog**, which is **always modal and always pauses** the
pipeline (and locks the surface) until it resolves. The engine stays headless —
the host injects the UI:

```ts
interface InteractionRequest { kind: string; title: string; message?: string; payload?: unknown }
interface InteractionResult  { cancelled: boolean; value?: unknown }
interface InteractionHost    { request(req: InteractionRequest, signal: AbortSignal): Promise<InteractionResult> }
```

A stage `await`s `rt.ui.request(...)`; the pause *is* the awaited promise. The
result folds into `extra` (`resolve`) or stops the chain (`halt`).

Rules that follow:
- **Dialogs are allowed only in suspendable pipelines** (paste / idle / command).
  A dialog stage in a sync pipeline (copy / keydown) **throws at assembly** — the
  browser's synchronous clipboard/key events cannot pause for a modal. (Enforced
  the same way the Markdown serializer contract is.)
- **One modal at a time** — concurrent requests queue.
- **Abort closes the dialog** — a superseded run's open modal is cancelled.

### 8. `extra` serialization (egress)

The serialize/copy pipelines fold `extra` into output per format: YAML
frontmatter (Markdown), an envelope key (JSON), `<meta>` / `data-*` (HTML).
Whether a field parses **back** on import is a per-field decision (symmetric
round-trip vs. export-only + re-derive on load).

## How it relates to the existing plugin system

Orthogonal and additive. `EditorPlugin` keeps its current fields (schema,
commands, chrome, `pmPlugins`, …). Pipelines are a **new contribution channel**:

```ts
interface EditorPlugin {
  // …existing…
  pipelines?: Pipeline[];                               // declare new pipelines
  stages?: Record<string /*pipeline name*/, StageContribution[]>; // add stages to any pipeline
}
```

Stage ordering reuses `orderPlugins` + the `layerById` id-layering already in
`engine/plugin.ts`, so a late plugin can insert / replace / remove a stage in
another plugin's pipeline.

## Decision — commands ARE pipelines (the universal extension bus)

A toolbar button, a context-menu entry, and a keybinding all already target a
single **id** through the `CommandRegistry`. We make that id a **pipeline name**:
firing a button runs the pipeline of the same name. This collapses "command" and
"pipeline" into one model, so *everything a user can trigger is extensible the
same way* — a late plugin hooks a stage into `set-color-green` exactly as it
hooks one into `image:browser:pick`.

The weight worry ("a pipeline for *set green*?") dissolves because **cost scales
with timing + policy, not with being a pipeline**:

- A **command is sugar for a one-stage `sync` pipeline.** The engine auto-wraps
  every `CommandSpec` into a pipeline named by its id, whose single stage dispatches
  the PM `Command`. It runs through `runStagesSync` — no promise, no timer, still
  returns synchronously (keybinding-safe). Overhead over a bare command: ~nil.
- A **heavy action declares a `deferred` pipeline** and pays for the machinery
  (debounce / threshold / abort / lock / `InteractionHost`) only because it uses it.

Authors keep writing one-liner `commands`. Extensibility is **available on every
one of them, imposed on none.** The registry becomes: *every id is a pipeline;
most are trivial sync one-stagers; a few are rich async chains.*

### The one new primitive — anchored stage contribution

Today's `layerById` is replace-in-place + remove (match an id → swap/drop). Stage
insertion also needs **relative placement** so `image:toBase64Converter` can say
"before the `insert` stage" without owning the pipeline:

```ts
type StageContribution =
  | { stage: PipelineStage; before: string }   // insert before an existing stage id
  | { stage: PipelineStage; after: string }     // insert after
  | { stage: PipelineStage }                     // replace-in-place (id match) or append
  | { remove: string };                          // drop a stage by id
```

Assembly stays the same spine: `orderPlugins` fixes plugin order, then for each
pipeline we fold its contributions — `before`/`after` resolve against the current
stage ids, a bare `stage` with a matching id replaces in place (last plugin wins,
as groups do now), a new id appends, `remove` drops. A `before`/`after` naming a
missing anchor **throws at assembly** (same load-bearing strictness as the
Markdown serializer contract — a silent no-op would hide a broken hook).

### Worked example — the cloud-image story this enables

Two independent plugins, neither importing the other:

```ts
// Plugin A — declares the action as a deferred pipeline.
definePlugin({
  name: 'image:browser',
  pipelines: [{
    name: 'image:browser:pick',
    timing: 'deferred',
    policy: { lock: true },                 // gating: locks the editor for the run
    stages: [
      { id: 'pick',   interactive: true, run: (c, rt) => rt.ui.request({ kind: 'cloud-picker', title: 'Choose image' })
                                                           .then(r => r.cancelled ? { action: 'halt' }
                                                                                  : { action: 'resolve', patch: { file: r.value } }) },
      { id: 'upload', run: async (c, rt) => ({ action: 'resolve', patch: { src: await uploadToCloud(c.extra.file, rt.signal) } }) },
      { id: 'insert', run: (c, rt) => { rt.dispatch(insertImageNode(c.extra.src)); return { action: 'resolve' }; } },
    ],
  }],
  toolbarGroups: [{ id: 'image', label: 'Image',
    items: [{ type: 'command', command: 'image:browser:pick', label: 'Image', icon: '🖼' }] }],
});

// Plugin B — knows nothing of A's internals; just slots a stage in by name+anchor.
definePlugin({
  name: 'image:toBase64Converter',
  dependencies: ['image:browser'],
  stages: {
    'image:browser:pick': [
      { before: 'insert', stage: { id: 'to-base64', run: (c) => ({ action: 'resolve', patch: { src: toDataUri(c.extra.src) } }) } },
    ],
  },
});
```

Drop B into the plugin set and every cloud image now inlines as a data URI —
`image:browser` never changed. Pull B out and uploads go back to returning cloud
URLs. That is the extensibility you were after, and it falls out of the existing
`orderPlugins` + id-layering with only the `before`/`after` anchor added.

> Note the `insert` stage needs `rt.dispatch` (a view-write port) — the gating
> `lock` guarantees no edit raced the upload, so the position stays valid without
> mapping. That `dispatch` port is the command→pipeline bridge the auto-wrap uses
> too: the sugar wrapper's single stage is just `(c, rt) => (rt.dispatchCommand(spec.run), { action: 'resolve' })`.

## Ordering & configuration — phases, the propose/dispose ladder, the config cell

> Status: **design, not yet implemented.** The anchored-contribution primitive
> above (`before`/`after`/`remove`) is live. Everything in *this* section —
> phases, per-phase order, `assign`, the config cell, `rt.config` — is an agreed
> design extension on top of it, not yet in `types.ts` / `assemble.ts` / the
> engine config. Captured here so we can keep exploring it against something
> written down.

### The problem the anchor primitive leaves open

Anchors give **absolute placement against a concrete id** (`before: 'insert'`).
That is exactly enough for a structural anchor, and exactly *not* enough for the
case where two independent plugins carry a hidden ordering constraint between
*each other*:

- `image-compress` and `image-base64` both legitimately want `before: 'insert'`.
- But compress must run **before** base64 (compress the bytes, *then* encode to a
  data URI — encoding first would mean compressing a base64 string, which is
  wrong).
- Neither should have to `import` the other or hardcode the other's id — they are
  independent plugins a user mixes freely.

Today their relative order falls out of plugin load order: silent, and fragile.
We need a way to express "these run in this order" that neither plugin owns.

### Why not the usual suspects

- **Ordered list / "configure them properly"** (Express/Koa/redux middleware) —
  works only for a small curated set hand-ordered by one person; breaks the moment
  a dependency adds a plugin the user didn't order.
- **Numeric priority / weight** — everyone picks `100`; collisions are invisible;
  the number carries no meaning. Avoid.
- **Capability dataflow** (`consumes`/`produces`, à la Bazel/Nix/make) — most
  principled, but leaks data-shape into the type system; heavier than we need.

The mature answer is a blend of **phases** (coarse, declarative) and **declared
relative constraints** (the stubborn pair), with the **app owner** holding the
final word. Full automation is a holy grail whose *shape only the owner knows* —
plugins can try the most logical path; they cannot know the product's intent.

### Phases — the coarse, declarative order

The **pipeline** (not the contributing plugins) owns an **ordered vocabulary of
phase names** — the canonical processing order for *that* pipeline. Each stage
declares which phase it belongs to; the assembler orders by phase index.

```ts
// image:browser:pick's canonical order
phases: ['acquire', 'geometry', 'optimize', 'annotate', 'encode', 'insert']
//         pick        crop        compress    watermark   base64    write
//         upload      resize
//                     orient
```

Because `optimize` is defined before `annotate`, "the watermark goes on the
already-compressed image" is automatic — no plugin names another. A new
`image-watermark` plugin just declares `phase: 'annotate'` and slots in without
touching compress or base64. This is the Rollup bet: a fixed, well-known order
that plugins pick a slot in.

**Granularity is the real lever.** A flat `transform` bucket is too coarse —
crop, compress, and watermark aren't one phase, they're a *sequence* with a real,
stable order (crop first → fewer pixels to compress; watermark last → the overlay
stays crisp, not degraded by compression). Phases should be as fine as the order
is stable and semantic. The phase list is an **editorial decision** about the
domain's canonical order, made once, by the pipeline owner — it's a human-curated,
readable stand-in for a dataflow graph, without the data-shape leakage.

### Intra-phase order — deterministic default + soft anchors

Two stages *will* legitimately land in the same phase with a real order between
them. Within a phase:

- **Default: declared / load order.** Predictable, never random — this alone
  kills the silent load-order bug.
- **Soft anchor when it matters:** `afterIfPresent` / `beforeIfPresent` — order
  relative to a named peer *only if it's present*, skip silently if not. Distinct
  from the hard `before: 'insert'` (which throws on a missing anchor — correct for
  a structural anchor, wrong for an optional peer).

### Propose / dispose — plugins propose, the owner disposes

Plugins declare a sensible default (phase + optional soft anchors) — the "most
logical path." The **app owner** has the final, authoritative word, set at engine
config, and it must **not** require listing every stage (that would be brittle to
plugin churn). The override is **additive and partial**:

```ts
new EditorEngine({
  plugins: [imageBrowserPlugin({ upload }), cropPlugin(), imageBase64Plugin],
  pipelines: {
    'image:browser:pick': {
      // coarse: the ordered vocabulary for THIS app (across-phase order)
      phases: ['acquire', 'geometry', 'optimize', 'annotate', 'encode', 'insert'],
      // surgical: within-phase order, KEYED BY PHASE — unambiguous and partial.
      // Only the stages you name are pinned; everything else keeps its phase default,
      // so adding a plugin tomorrow doesn't touch this.
      order: { geometry: ['orient', 'crop', 'resize'] },
    },
  },
})
```

Two **orthogonal, each-unambiguous** levers:

- **`phases`** — ordering *across* phases (the vocabulary itself).
- **`order`, keyed by phase** — ordering *within* a phase. Keying by phase answers
  "which phase does this order belong to?" explicitly — a flat `order: [...]`
  array is underspecified (is it a global relative sequence, or within one
  phase?). You never need a cross-phase `order`; that's what `phases` is for.

**Relocation is deliberate, never implicit.** If the owner lists a stage under a
phase its plugin didn't declare, that is a conflict. Default: **throw** ("`crop`
is in phase `optimize`, not `geometry`") — catches typos. An explicit opt-in moves
it: `assign: { crop: 'geometry' }`. So a misspelled stage id never silently
teleports across phases.

**What throws at assembly** (same load-bearing strictness as the serializer
contract): unknown phase name, a cycle in soft anchors, an `order` that contradicts
a stage's **hard** anchor (`before: 'insert'`), or an `order`/`assign` naming a
stage not in the named phase. The owner can override a *preference*; they cannot
silently break a structural contract — to really mean it, drop/replace that stage
explicitly.

### Configuration — a property of the (stage × pipeline) cell

A stage like `crop` needs *behavioral* config (allowed aspect ratios, default
ratio, min/max dimensions), separate from *where* it runs. **Config is not a
property of the plugin — it's a property of the (stage × pipeline) cell.** One
`cropPlugin`, but two pipelines crop differently:

```ts
new EditorEngine({
  plugins: [imageBrowserPlugin({ upload }), cropPlugin(), imageBase64Plugin],
  pipelines: {
    'image:portrait:pick': {               // a manager's portrait
      phases: ['acquire', 'geometry', 'encode', 'insert'],
      order:  { geometry: ['orient', 'crop'] },
      config: { crop: { aspect: '3:4', defaultAspect: '3:4' } },
    },
    'image:gallery:pick': {                // little squares
      phases: ['acquire', 'geometry', 'encode', 'insert'],
      order:  { geometry: ['crop'] },
      config: { crop: { aspect: '1:1', min: [256, 256] } },
    },
  },
})
```

Same single crop plugin, two behaviors — factory config alone can't express this
without duplicating the plugin into two instances for what is genuinely *one*
capability used two ways. So config must live at the pipeline level, per stage.

**The config is an opaque blob keyed by stage id.** The engine just routes it to
the stage; the *plugin* interprets it — exactly as factory options are opaque to
the engine today. No coupling: storing config is not understanding config.

**Config ladder** (later layer wins; shallow-merge by top-level key):

1. **Plugin built-in default** — crop's sensible fallback. The "most logical path"
   for config.
2. **Factory override** — app-wide invariant (`cropPlugin({ min: [320,320] })`,
   "never below 320px anywhere"). Still useful; now optional.
3. **Per-pipeline, per-stage config** — the owner, in the pipeline block, keyed by
   stage id. The home for the portrait-vs-gallery distinction. Wins.

Config has **no collision problem** (unlike order — crop's ratio is entirely
crop's own business, no other plugin competes over it), which is why it needs a
precedence *ladder* but not the arbitration machinery order needs.

**The stage reads its resolved config at runtime** via `rt.config` — the assembler
resolves the ladder per `(pipeline, stage)` and hands each stage *its own* merged
blob (the runner knows which stage it's running):

```ts
// crop stage — author writes this once, never cares which layer won
run(ctx, rt) {
  const { aspect, min } = rt.config as CropConfig;   // resolved for THIS pipeline
  const r = await rt.ui.request(
    { kind: 'crop', title: 'Crop', payload: { src: ctx.extra.src, aspect, min } },
    rt.signal,
  );
  return r.cancelled ? { action: 'halt' } : { action: 'resolve', patch: { src: r.value } };
}
```

Three things crop touches, kept distinct:

- **config** — construction/assembly-time, via the ladder, read as `rt.config`.
  Stable for the run.
- **data** — runtime, via `ctx.extra` (the image the previous stage produced).
  Changes every run.
- **UI** — runtime, via `rt.ui.request(...)` (crop is `interactive`: it opens the
  cropper; the host renders it). The host's job, not config.

### The model, in one frame

- **phases** (vocabulary, owned by the pipeline) + **per-phase `order`** +
  **`assign`** → *structure*; plugins propose, **owner disposes**.
- **config ladder** (plugin default → factory → per-pipeline cell), read via
  **`rt.config`** → *behavior*; varies per pipeline, opaque to the engine.
- **soft anchors** (`afterIfPresent` / `beforeIfPresent`) → the stubborn
  intra-phase pair, without cross-plugin coupling.
- Hard `before`/`after`/`remove` anchors stay for true structural placement.

### Open threads (to explore further)

- **Deferred:** letting a *plugin* introduce a new phase (reintroduces the
  ordering problem recursively — where does the new phase go?). Start with a fixed,
  pipeline-owned phase list; stages only join existing phases. If a plugin truly
  needs a new phase later, anchor the phase relative to an existing one (same
  soft-anchor idea, one level up).
- **Merge semantics for the config ladder** — shallow (predictable, owner replaces
  a whole key) vs. deep. Leaning shallow.
- **`assign` vs. throw** default — leaning throw-by-default with explicit `assign`
  to relocate.
- Whether `phases` on the pipeline is required or defaults to a single implicit
  phase (absent `phases` = today's flat behavior).

## Interactive vs automated, data currency, planner/executor, plugin-API wrappers

> Status: **design, not yet implemented** — continues the section above. These are
> the use cases we intend to build next "just to see what we missed," so the
> intent here is to be concrete enough to implement against, then correct the doc
> from what the code teaches us.

### Interactive (A) vs automated (B) — when composition even applies

The phase/order/composition machinery is **not always-on**. It's the toolkit for
the *automated* path. The interactive path opts out by being a single stage, and
that's correct — not a compromise.

- **A — a human drives a full editor.** You pick a cloud image, a rich editor
  opens in a dialog (crop, resize, rotate, filters, even its own compression), the
  user does everything, and the stage returns the result. This is **one
  `interactive` stage that does the whole job**; the pipeline collapses to
  `pick → edit → encode → insert`. There's nothing to compose *around* it and you
  wouldn't want to — the human already handled it. The only thing you "give up" is
  splicing a stage *inside* the editor (between its crop and resize), which nothing
  realistic wants, because the canonical phase order already sequences every other
  operation (compress, watermark, encode) *after* geometry. So: full editor = one
  self-contained stage, no tradeoff.
- **B — automated, headless, often per-image.** No human in the loop, so
  independent operations must be sequenced and extended programmatically. *This* is
  where phases, order, the planner/executor split, batch, and wrappers earn their
  keep (compress-before-base64, watermark-in-`annotate`, per-image plans, …).

Scope discipline for A: a fused editor should stay within its phase's remit
(geometry). If it *also* compresses internally, it's doing `optimize` work inside a
`geometry` stage, and a later `annotate` watermark lands on the internally
compressed image — fine if intended, surprising if not. That's an author choice,
not a model flaw.

### Data currency — a `Blob` on the blackboard, not a dataURI string

crop / resize / compress / watermark all operate on **bytes**. Carry a `Blob` (or
`ImageBitmap`) through `extra` as the working representation; convert only at the
edges — URL→blob once at ingress (`fetch`→`blob`), blob→dataURI/upload once at
egress (`encode`/`insert`). Round-tripping through base64 strings between stages
would waste work.

The **one coupling that remains** is the `extra` **key schema**: stages don't
import each other, but they *do* agree on key names and shapes (`extra.blob: Blob`,
`extra.cropPlan: CropPlan`, `extra.processed: ProcessedItem[]`). That's the
blackboard contract — the deliberate seam, same spirit as agreeing on a pipeline
name + anchor id. A plugin should publish the `extra` keys it reads/writes as part
of its public surface.

### Planner / executor split (the other half of B)

"Instead of editing each image by hand" doesn't require a stage to *do* the work —
it can emit **instructions** another stage executes.

- **B1 — intent on the blackboard (this is the pattern).** A detector stage writes
  an intent into `extra` (`extra.cropPlan = { aspect: '1:1', focus: [x, y] }`); the
  crop stage **reads the plan and runs headless** instead of opening its dialog.
  The detector neither does the crop nor imports crop — it drops a well-known key;
  crop picks it up. The elegant payoff: **the same crop stage serves both A and B**
  by choosing its mode from whether a plan is present:

  ```ts
  run(ctx, rt) {
    const plan = ctx.extra.cropPlan as CropPlan | undefined;
    if (plan) return { action: 'resolve', patch: { blob: await applyCrop(ctx.extra.blob, plan) } }; // headless
    const r = await rt.ui.request({ kind: 'crop', payload: { ...rt.config, blob: ctx.extra.blob } }, rt.signal);
    return r.cancelled ? { action: 'halt' } : { action: 'resolve', patch: { blob: r.value } };
  }
  ```

  For batch, the detector emits **one plan per image** and crop applies them all
  without a single prompt — which is the whole point of "not one by one."

- **B2 — a stage rewrites the running pipeline (rejected).** Possible in principle,
  but it breaks what makes phases/order/assign analyzable: assembly is static, you
  can read a pipeline and know its stages. Runtime graph mutation makes "what will
  run?" unanswerable without executing, and it fights owner-disposes (whose order
  wins — the owner's, or the injected stage's?). **Get the dynamism from data, not
  from graph surgery:** a static crop stage whose *behavior* is driven by
  `extra.cropPlan` gives everything B2 would, while staying static and ownable.

### Plugin API as a contract; wrappers & adapters

The decisive generalization: **a plugin's public API is a first-class contract,
and the pipeline is only *one* consumer of it.** When two plugins don't line up —
one has a stale API, expects a different data shape, or was built for single-file
use — you don't modify either; you write a thin **wrapper plugin** that calls the
public API and re-exposes the capability in the shape the pipeline (or the next
plugin) needs. Ports-and-adapters / facade / decorator, applied to plugins — the
Unix "small tools glued by adapters" philosophy.

This splits a plugin into **two orthogonal surfaces**:

```ts
interface EditorPlugin {
  // …existing…
  api?: unknown;                                       // what I expose to OTHER plugins (callable)
  pipelines?: Pipeline[];                              // how I declare pipelines
  stages?: Record<string, StageContribution[]>;        // how I join pipelines
}
```

A plugin can have either or both. A superb-but-old single-file processor can be
**pipeline-unaware** — pure `api`, no stages — and a wrapper is what gives it a
stage. Requirements this places on the conventions:

1. **Resolve another plugin's API by name.** `dependencies: ['image-processor']`
   already establishes the edge; we add API resolution on top (a plugin registry
   keyed by name → its `api`, handed to the wrapper at assembly/runtime, loose-typed,
   consumer casts — same posture as `rt.config`).
2. **The wrapper owns lifecycle translation.** A stage calling another plugin's API
   is responsible for turning that plugin's promises/errors/abort into
   `StageOutcome`s (`halt`/`error`) and honoring `rt.signal` across the loop. The
   wrapped plugin stays unaware it's in a pipeline.

The worked gallery flow:

```
[image-processor]   single-file, superb, stale API, pipeline-unaware (api only)
      ▲ wrapper calls its public API per image (abort + concurrency cap)
[batch-wrapper]     stage: reads extra.images: Blob[] → writes extra.processed: ProcessedItem[]
      ▼
[reformat OR gallery-wrapper]   bridges the shape mismatch (two strategies)
      ▼
[gallery-maker]     consumes the corrected shape, builds the gallery
```

**Two adapter strategies for the shape mismatch:**

- **Stage-level reformatter** — a plugin adding a stage that reads `extra.processed`
  and writes `extra.galleryInput`. The glue is *visible on the blackboard*:
  reorderable, removable, inspectable. Prefer this when unsure — it keeps the glue a
  first-class, debuggable pipeline citizen rather than buried in a facade.
- **API-level wrapper (facade)** — a plugin wrapping `gallery-maker`'s API and
  calling it with corrected data. The glue is *encapsulated*; the pipeline sees only
  the wrapper's stage. Prefer this when the wrapped tool should stay invisible.

**The API is a versioned contract, and the wrapper is the seam that absorbs
drift.** "Getting old in terms of public API" is exactly what wrappers exist for:
when the processor's v2 breaks its API, you adjust *one* wrapper and every
downstream consumer is insulated — churn is contained at the adapter, never rippled
through the pipeline.

Cost to stay honest about: wrappers add indirection, and wrappers-of-wrappers get
deep. What keeps it traceable is the **blackboard** — every wrapper's input and
output still land as named `extra` keys, so the data flow stays visible even when
the call stack is wrapped three deep.

### Batch — resolved as a wrapper concern, not a core primitive

The earlier open question ("does the context model need first-class batch /
fan-out?") is **largely answered: no.** The batch-wrapper *is* the fan-out — it maps
over `extra.images[]` in userland and collects results. The core stays
single-context; batching is a composition concern a wrapper owns. The only reason
to revisit a core primitive is if batch needs **engine-level per-item
progress/abort/UI** — one modal per image, a progress bar across N. Pure data batch
doesn't; it's a loop inside one stage honoring one `rt.signal`.

## The four motivating features, mapped

| Feature | Pipeline | Timing | Writes | Notes |
|---|---|---|---|---|
| Word HTML cleanup | paste | sync | `ctx.doc` | `transformPastedHTML` string scrub |
| Reformat to standard form | paste or idle | sync / deferred | `ctx.doc` / `extra` | fragment vs. whole-doc |
| Auto TOC | idle | deferred | `extra.toc` | read-only over doc; chrome renders it |
| AI summary / related docs | idle | deferred | `extra.*` | async + generation token; may use a dialog |

## Open decisions (not blocking the demo)

1. **Built-in pipeline ownership** — does the engine ship `paste`/`copy`/`keydown`/
   `idle` as always-present named pipelines (plugins only add stages), or is every
   pipeline plugin-declared? (Leaning: engine ships the built-ins.)
2. **`extra` round-trip symmetry** — per field; decide when we wire egress.
3. **Async → doc writes** (auto-attach inline). Two regimes:
   - **Gating** (e.g. async paste that owns insertion) — **locks the editor for
     the whole run** (modal or not), so no edit can race the insert and the stored
     position stays valid without mapping. The lock covers pre-modal async spans
     and windowless pipelines too — a true `setEditable(false)`, not just a visual
     overlay. (Demonstrated in the visualizer's async paste lane.)
   - **Ambient** (background enrichment that must not block typing — "related
     docs", auto-attach) — *cannot* lock, so it genuinely needs transaction
     dispatch + position mapping. Deferred until after `extra`-only derivations.

---

## Demo slice (build this first)

Goal: prove the **deferred** machinery end-to-end with **no backend and no engine
surgery** — live only in the dev playground (`src/dev`, excluded from the shipped
build). If this feels right, we promote the core into the engine as Phase 7.

### Scope

- A minimal, reusable core in `src/engine/pipeline/` (type-checked, not yet
  exported from `index.ts`):
  - `types.ts` — the interfaces above (kept loose where PM types would leak), plus
    `StageReport`/`StageReporter` for step-level visualization.
  - `runner.ts` — `runStages()` (sequential outcome handling, optional per-stage
    reporter) + `DeferredRunner` (debounce + generation token + loader threshold +
    abort, with `onStart`/`onStage` observability hooks).
- A dedicated visual test page — `pipelines.html` + `src/dev/pipeline-viz.ts`:
  the editor on the left, one **lane per pipeline** on the right. Each stage chip
  blinks green while running, fades to gray on success, goes amber on halt, red on
  error, dashed on skip, struck-through on abort — driven by the runner's real
  per-stage reports. Two deferred pipelines run off the editor's `change` event:
  - **idle** (debounce 600ms) — `word-count` (sync) → `summary` (async delay) →
    `classify` (interactive modal, toggled from the page).
  - **deep-check** (debounce 1400ms) — `readability` → `link-scan` → `policy`
    (halts on the word "secret", throws/errors on "forbidden" — to exercise the
    amber/red states on demand).
  - A **mock `InteractionHost`** renders a real modal (DOM overlay), resolves on
    OK/Cancel, and honors the `AbortSignal` (a superseded run closes it).

### What the demo proves

- Context threading + sequential stages + patch-merge into `extra`.
- Debounce + the 200ms "defer the spinner" behavior (fast run = no spinner; slow
  `summary` = spinner).
- Generation token dropping stale runs (type during a slow run → first result
  discarded).
- Abort cancelling in-flight work (and closing an open modal).
- The modal pausing the pipeline; OK → `resolve`, Cancel → `halt`.

### Explicitly out of the demo

Real paste/copy/keydown wiring, `extra` egress serialization, async→doc writes,
the `EditorPlugin.pipelines`/`stages` contribution channel, and the engine
registry. Those land in the real Phase 7 if the demo validates the shape.

### Migration path

`src/engine/pipeline/{types,runner}.ts` are written to be the real core. Phase 7
adds the registry, the trigger wiring (clipboard/keydown PM plugins + idle
subscription), the plugin contribution channel, and egress — reusing these files
unchanged.
