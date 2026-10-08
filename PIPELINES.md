# Pipelines — design note (proposed Phase 7)

> Status: **design + demo**. This describes a content-processing pipeline layer
> for the editor. The full design is below; the **Demo slice** at the end is what
> we build first (dev-playground only) to prove the mechanics before committing
> the engine surface.

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
  stages?: Record<string /*pipeline name*/, PipelineStage[]>; // add stages to any pipeline
}
```

Stage ordering reuses `orderPlugins` + the `layerById` id-layering already in
`engine/plugin.ts`, so a late plugin can insert / replace / remove a stage in
another plugin's pipeline.

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
