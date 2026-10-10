/**
 * Pipeline visualizer (dev-only; see PIPELINES.md). A dedicated test page: the
 * editor on the left, and on the right one lane per pipeline. As a pipeline runs,
 * each stage chip blinks green while running, fades to gray on success, goes amber
 * on halt, red on error, dashed on skip, and struck-through on abort — driven by
 * the runner's real per-stage reports, not faked.
 *
 * Two deferred pipelines are wired off the editor's `change` event:
 *   • idle (debounce 600ms)  — word-count → summary → classify (interactive modal)
 *   • deep-check (1400ms)    — readability → link-scan → policy (halts/errors on
 *                              keywords, to exercise the amber/red states)
 */
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { DeferredRunner, runStages, runStagesSync, type RunResult } from '../engine/pipeline/runner';
import type {
  InteractionHost,
  Pipeline,
  PipelineContext,
  RunStatus,
  StageReport,
} from '../engine/pipeline/types';
import '../index';
import type { KmEditorElement } from '../index';
import { defaultPlugins } from '../engine/default-plugins';
import { imageBrowserPlugin } from '../plugins/image-browser';
import { imageBase64Plugin } from '../plugins/image-base64';

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

const text = (doc: any): string => ((doc?.textContent as string) ?? '').trim();

function countWords(doc: any): number {
  const t = text(doc);
  return t ? t.split(/\s+/).length : 0;
}

function fakeSummary(doc: any): string {
  const t = text(doc);
  if (!t) return '(empty)';
  const s = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

/** A tiny "cloud library" the picker offers (public picsum images). */
const CLOUD_IMAGES = [
  { url: 'https://picsum.photos/id/1025/480/320', name: 'pup' },
  { url: 'https://picsum.photos/id/1039/480/320', name: 'falls' },
  { url: 'https://picsum.photos/id/1062/480/320', name: 'shore' },
];

/** Stand-in for a real upload: wait (watch the slider), then return the src. */
function fakeUpload(asset: { url: string; name?: string }, signal: AbortSignal): Promise<string> {
  return delay(settings.delayMs, signal).then(() => asset.url);
}

/** A mock modal host: a real DOM overlay, abort-aware (superseded run closes it).
 * Branches on the request kind — a thumbnail picker for `cloud-picker`, a
 * sensitivity select otherwise (classify / confirm-import). */
function createMockInteractionHost(): InteractionHost {
  return {
    request(req, signal) {
      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'pv-modal';
        const body =
          req.kind === 'cloud-picker'
            ? `<div class="pv-picker">${CLOUD_IMAGES.map(
                (img, i) => `<img data-pick="${i}" src="${img.url}" alt="${img.name}" title="${img.name}" />`
              ).join('')}</div>`
            : `<select data-role="value">
                 <option>Public</option><option>Internal</option><option>Confidential</option>
               </select>`;
        overlay.innerHTML = `
          <div class="pv-modal-card">
            <div class="pv-modal-title">${req.title}</div>
            <div class="pv-modal-msg">${req.message ?? ''}</div>
            ${body}
            <div class="pv-modal-actions">
              <button data-role="cancel">Cancel (halt)</button>
              ${req.kind === 'cloud-picker' ? '' : '<button data-role="ok" class="primary">OK (resolve)</button>'}
            </div>
          </div>`;
        const close = () => {
          signal.removeEventListener('abort', onAbort);
          overlay.remove();
        };
        const onAbort = () => { close(); resolve({ cancelled: true }); };
        signal.addEventListener('abort', onAbort);
        // Cloud picker: clicking a thumbnail resolves with that asset.
        overlay.querySelectorAll('[data-pick]').forEach((el) => {
          el.addEventListener('click', () => {
            const asset = CLOUD_IMAGES[Number((el as HTMLElement).dataset.pick)];
            close();
            resolve({ cancelled: false, value: asset });
          });
        });
        overlay.querySelector('[data-role=ok]')?.addEventListener('click', () => {
          const value = (overlay.querySelector('[data-role=value]') as HTMLSelectElement).value;
          close();
          resolve({ cancelled: false, value });
        });
        overlay.querySelector('[data-role=cancel]')?.addEventListener('click', () => {
          close();
          resolve({ cancelled: true });
        });
        document.body.appendChild(overlay);
      });
    },
  };
}

// ── Pipeline definitions ────────────────────────────────────────────────────

const classifyEnabled = { on: false };
/** Shared, slider-controlled artificial delay for every async stage (ms). */
const settings = { delayMs: 900 };

const idlePipeline: Pipeline = {
  name: 'idle',
  timing: 'deferred',
  policy: { debounceMs: 600, thresholdMs: 200 },
  stages: [
    { id: 'word-count', run: (c) => ({ action: 'resolve', patch: { words: countWords(c.doc) } }) },
    {
      id: 'summary',
      run: async (c, rt) => {
        await delay(settings.delayMs, rt.signal);
        return { action: 'resolve', patch: { summary: fakeSummary(c.doc) } };
      },
    },
    {
      id: 'classify',
      interactive: true,
      run: async (c, rt) => {
        if (!classifyEnabled.on) return { action: 'skip' };
        const res = await rt.ui.request(
          { kind: 'classify', title: 'Classify document', message: 'Pick a sensitivity level.' },
          rt.signal
        );
        if (res.cancelled) return { action: 'halt', reason: 'classification cancelled' };
        return { action: 'resolve', patch: { classification: res.value } };
      },
    },
  ],
};

const deepCheckPipeline: Pipeline = {
  name: 'deep-check',
  timing: 'deferred',
  policy: { debounceMs: 1400, thresholdMs: 200 },
  stages: [
    {
      id: 'readability',
      run: async (c, rt) => {
        await delay(settings.delayMs, rt.signal);
        const words = countWords(c.doc);
        return { action: 'resolve', patch: { readability: words < 40 ? 'easy' : 'dense' } };
      },
    },
    {
      id: 'link-scan',
      run: async (c, rt) => {
        await delay(settings.delayMs, rt.signal);
        const links = (text(c.doc).match(/https?:\/\/\S+/g) ?? []).length;
        return { action: 'resolve', patch: { links } };
      },
    },
    {
      id: 'policy',
      run: async (c, rt) => {
        await delay(settings.delayMs, rt.signal);
        const t = text(c.doc).toLowerCase();
        // Deliberate demo triggers: type these words to see amber / red states.
        if (t.includes('forbidden')) throw new Error('forbidden content detected');
        if (t.includes('secret')) return { action: 'halt', reason: 'contains "secret"' };
        return { action: 'resolve', patch: { policy: 'ok' } };
      },
    },
  ],
};

// ── Paste pipeline (sync; rides transformPastedHTML) ────────────────────────

/** Strip Microsoft Office / Word clipboard cruft. */
function stripOffice(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '') // conditional comments
    .replace(/<!--[\s\S]*?-->/g, '') // remaining comments
    .replace(/<(meta|link|xml|style)[^>]*>[\s\S]*?<\/\1>/gi, '') // head blocks
    .replace(/<(meta|link)[^>]*\/?>/gi, '')
    .replace(/<\/?(o:p|w:[a-z]+|m:[a-z]+|v:[a-z]+)[^>]*>/gi, '') // namespaced tags
    .replace(/\s*mso-[^:;"']*:[^;"']*;?/gi, '') // mso-* style props
    .replace(/\sclass="?Mso[^"\s>]*"?/gi, ''); // Mso* classes
}

/** Drop presentational attributes (quoted or unquoted) and unwrap bare spans. */
function stripAttrs(html: string): string {
  return html
    .replace(/\s*(style|class|lang|align)="[^"]*"/gi, '')
    .replace(/\s*(style|class|lang|align)='[^']*'/gi, '')
    .replace(/\s*(style|class|lang|align)=[^\s"'>]+/gi, '') // unquoted (Word emits lang=EN-US)
    .replace(/<span\s*>\s*([\s\S]*?)\s*<\/span>/gi, '$1')
    .replace(/<\/?html[^>]*>|<\/?head[^>]*>|<\/?body[^>]*>/gi, '');
}

/** Collapse whitespace and drop empty blocks. */
function normalizeHtml(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\r?\n\s*){2,}/g, '\n')
    .trim();
}

const pastePipeline: Pipeline = {
  name: 'paste',
  timing: 'sync',
  stages: [
    {
      id: 'guard-scripts',
      run: (c) =>
        /<script|javascript:/i.test(c.extra.html as string)
          ? { action: 'halt', reason: 'blocked unsafe paste' }
          : { action: 'skip' },
    },
    { id: 'strip-office', run: (c) => ({ action: 'resolve', patch: { html: stripOffice(c.extra.html as string) } }) },
    { id: 'strip-attrs', run: (c) => ({ action: 'resolve', patch: { html: stripAttrs(c.extra.html as string) } }) },
    { id: 'normalize', run: (c) => ({ action: 'resolve', patch: { html: normalizeHtml(c.extra.html as string) } }) },
  ],
};

/** A canned messy Word paste, for the "Simulate" button (no real clipboard needed). */
const WORD_SAMPLE = `<html xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta name=Generator content="Microsoft Word 15"><style>p.MsoNormal{margin:0}</style></head>
<body><!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->
<p class=MsoNormal style="margin:0cm;mso-pagination:none"><span style='font-family:"Calibri",sans-serif;mso-fareast-language:EN-US'>Hello&nbsp;from <b style="mso-bidi-font-weight:normal">Word</b>.<o:p></o:p></span></p>
<p class=MsoNormal><span lang=EN-US>Second paragraph, full of junk.</span></p>
</body></html>`;

const squish = (h: string): string => h.replace(/\s+/g, ' ').trim().slice(0, 240);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Prefer clipboard HTML; fall back to wrapping plain text. */
const toHtml = (html: string, plain: string): string =>
  html || (plain ? '<p>' + escapeHtml(plain) + '</p>' : '');

// ── Async paste pipeline (deferred; intercepts via handlePaste) ─────────────
// Unlike the sync pipeline, this one can await and pause on a modal — because it
// CANCELS the native paste and inserts the result itself via a transaction.

/** Which handler real Ctrl+V uses (the two can't both act on one paste). */
const pasteMode = { mode: 'sync' as 'sync' | 'async' };

const asyncPastePipeline: Pipeline = {
  name: 'paste-async',
  timing: 'deferred',
  stages: [
    {
      // Stands in for real async work before inserting (upload images, call an API…).
      id: 'fetch-meta',
      run: async (c, rt) => {
        await delay(settings.delayMs, rt.signal);
        return { action: 'resolve', patch: { bytes: (c.extra.html as string).length } };
      },
    },
    {
      // The thing a sync paste cannot do: pause on a modal before deciding.
      id: 'confirm-import',
      interactive: true,
      run: async (c, rt) => {
        const res = await rt.ui.request(
          {
            kind: 'confirm',
            title: 'Import pasted content?',
            message: 'The native paste was cancelled. This async step can pause here (modal). Pick an import level, or Cancel to insert nothing.',
          },
          rt.signal
        );
        if (res.cancelled) return { action: 'halt', reason: 'import cancelled' };
        return { action: 'resolve', patch: { importAs: res.value } };
      },
    },
    {
      id: 'clean',
      run: (c) => ({ action: 'resolve', patch: { html: normalizeHtml(stripAttrs(stripOffice(c.extra.html as string))) } }),
    },
  ],
};

// ── Lane rendering ────────────────────────────────────────────────────────

function buildLane(pipeline: Pipeline): {
  root: HTMLElement;
  onStart(): void;
  onStage(r: StageReport): void;
  onStatus(s: RunStatus): void;
  onResult(extra: Record<string, unknown>): void;
} {
  const root = document.createElement('div');
  root.className = 'pv-lane';
  const policy = pipeline.policy ?? {};
  root.innerHTML = `
    <div class="pv-lane-head">
      <span class="pv-lane-name">${pipeline.name}</span>
      <span class="pv-badge">${pipeline.timing} · ${policy.debounceMs ?? 1000}ms</span>
      <span class="pv-lane-status" data-role="status">idle</span>
    </div>
    <div class="pv-stages" data-role="stages"></div>
    <pre class="pv-extra" data-role="extra">{}</pre>`;
  const stagesEl = root.querySelector('[data-role=stages]') as HTMLElement;
  const chips = new Map<string, HTMLElement>();
  pipeline.stages.forEach((stage, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'pv-arrow';
      arrow.textContent = '→';
      stagesEl.appendChild(arrow);
    }
    const chip = document.createElement('span');
    chip.className = 'pv-stage';
    chip.textContent = stage.id + (stage.interactive ? ' ⧉' : '');
    stagesEl.appendChild(chip);
    chips.set(stage.id, chip);
  });
  const statusEl = root.querySelector('[data-role=status]') as HTMLElement;
  const extraEl = root.querySelector('[data-role=extra]') as HTMLElement;

  const setChip = (id: string, cls: string) => {
    const chip = chips.get(id);
    if (!chip) return;
    chip.className = 'pv-stage' + (cls ? ' pv-' + cls : '');
    // Force-restart the fade/pulse animation on re-entry.
    void chip.offsetWidth;
  };

  return {
    root,
    onStart() {
      chips.forEach((_, id) => setChip(id, ''));
    },
    onStage(r) {
      setChip(r.stageId, r.phase === 'ok' ? 'done' : r.phase);
    },
    onStatus(s) {
      statusEl.textContent =
        s.phase === 'error' ? `error: ${String((s as any).error?.message ?? (s as any).error)}` :
        s.phase === 'halted' ? `halted${s.reason ? ` (${s.reason})` : ''}` :
        s.phase;
      statusEl.dataset.phase = s.phase;
    },
    onResult(extra) {
      extraEl.textContent = JSON.stringify(extra, null, 2);
    },
  };
}

// ── Bootstrap ────────────────────────────────────────────────────────────

const km = document.querySelector('#km') as KmEditorElement | null;
const lanesHost = document.querySelector('#pv-lanes') as HTMLElement;
const classifyToggle = document.querySelector('#pv-classify') as HTMLInputElement | null;

classifyToggle?.addEventListener('change', () => {
  classifyEnabled.on = classifyToggle.checked;
});

type Lane = ReturnType<typeof buildLane>;

/** Insert cleaned HTML at the cursor (used by the Simulate button). */
function insertHTML(engine: any, html: string): void {
  const dom = new window.DOMParser().parseFromString(html, 'text/html');
  const slice = PMDOMParser.fromSchema(engine.schema).parseSlice(dom.body);
  engine.view.dispatch(engine.view.state.tr.replaceSelection(slice).scrollIntoView());
  engine.view.focus();
}

/**
 * Run the sync paste pipeline, then replay its stage reports onto the lane with a
 * small stagger (the real transform is instant — the stagger is purely so the eye
 * can follow the steps). Returns the cleaned HTML (or '' if a stage halted).
 */
function runPaste(engine: any, lane: Lane, html: string): string {
  const reports: StageReport[] = [];
  const res: RunResult = runStagesSync(pastePipeline, { doc: engine.state.doc, extra: { html } }, (r) =>
    reports.push(r)
  );
  const after = res.halted ? '' : ((res.context.extra.html as string) ?? html);

  // The transform is already done (sync). The replay below is cosmetic — it walks
  // the chips through their states and only reveals the before/after when the last
  // step lands, so the result box and the animation agree.
  lane.onStart();
  lane.onStatus({ phase: 'pending' });
  lane.onResult({}); // clear the previous paste's result at the start of this run
  let i = 0;
  const tick = () => {
    if (i < reports.length) {
      lane.onStage(reports[i++]);
      setTimeout(tick, Math.min(settings.delayMs, 300) || 130);
    } else {
      lane.onStatus(res.halted ? { phase: 'halted', reason: res.reason } : { phase: 'ready' });
      lane.onResult({ before: squish(html), after: squish(after || '(blocked)'), charsRemoved: html.length - after.length });
    }
  };
  tick();
  return after;
}

let asyncPasteCtrl: AbortController | null = null;

/** Lock/unlock the editor for the duration of a gating run (truly read-only + dimmed). */
function setEditorLocked(engine: any, locked: boolean): void {
  engine.setEditable(!locked);
  (document.querySelector('#pv-editor-col') as HTMLElement | null)?.classList.toggle('pv-locked', locked);
}

/**
 * The async paste path: the native paste was already cancelled by the caller, so
 * here we await freely (delay + modal), then insert the result via a transaction.
 *
 * Because it owns insertion, it LOCKS the editor for the whole run — modal or not.
 * That closes the window (literally and figuratively) in which an edit could race
 * the insert, so the stored position stays valid without any mapping. The lock
 * covers the pre-modal `fetch-meta` await too, which has no window of its own.
 */
async function runAsyncPaste(engine: any, lane: Lane, html: string, ui: InteractionHost): Promise<void> {
  asyncPasteCtrl?.abort();
  const ctrl = new AbortController();
  asyncPasteCtrl = ctrl;

  lane.onStart();
  lane.onStatus({ phase: 'pending' });
  lane.onResult({});

  const wasEditable = engine.isEditable();
  setEditorLocked(engine, true);

  try {
    const res: RunResult = await runStages(
      asyncPastePipeline,
      { doc: engine.state.doc, extra: { html } },
      { signal: ctrl.signal, ui, generation: 0 },
      (r) => lane.onStage(r)
    );
    if (res.halted) {
      lane.onStatus({ phase: 'halted', reason: res.reason });
      lane.onResult({ before: squish(html), after: '(not imported)' });
      return;
    }
    const after = (res.context.extra.html as string) ?? html;
    lane.onStatus({ phase: 'ready' });
    lane.onResult({ before: squish(html), after: squish(after), charsRemoved: html.length - after.length });
    insertHTML(engine, after); // we own the insertion; the editor was locked throughout
  } catch (err) {
    if (!ctrl.signal.aborted) lane.onStatus({ phase: 'error', error: err });
  } finally {
    // Only the still-current run restores editability (a superseded run handed off).
    if (asyncPasteCtrl === ctrl) setEditorLocked(engine, !wasEditable);
  }
}

// One host for every interactive stage (paste confirm, classify, cloud picker).
const ui = createMockInteractionHost();
// Whether the image:browser:pick pipeline inlines picked images as base64
// (toggling it adds/removes the imageBase64Plugin → rebuilds the engine).
const base64 = { on: false };

// Engine-bound wiring is torn down + rebuilt whenever the plugin set changes
// (the <km-editor> rebuilds its engine on a `plugins` reassignment).
let disposers: Array<() => void> = [];
let activeRunners: DeferredRunner[] = [];
const laneRefs: { sync?: Lane; async?: Lane } = {};

function teardownWiring() {
  disposers.forEach((off) => off());
  disposers = [];
  activeRunners.forEach((r) => r.dispose());
  activeRunners = [];
  lanesHost.innerHTML = '';
}

/** Bind the engine-bound lanes, runners, and observers to a (freshly built) engine. */
function wire(engine: any) {
  teardownWiring();

  // Paste lanes. Sync rides transformPastedHTML (clean inline, insert immediately).
  // Async intercepts via handlePaste: cancels the native paste, awaits (modal),
  // then inserts via a transaction. Real Ctrl+V uses whichever the mode selects.
  const syncPasteLane = buildLane(pastePipeline);
  lanesHost.appendChild(syncPasteLane.root);
  const asyncPasteLane = buildLane(asyncPastePipeline);
  lanesHost.appendChild(asyncPasteLane.root);
  laneRefs.sync = syncPasteLane;
  laneRefs.async = asyncPasteLane;

  engine.view.setProps({
    transformPastedHTML: (html: string) => runPaste(engine, syncPasteLane, html),
    handlePaste: (_view: any, event: ClipboardEvent) => {
      if (pasteMode.mode !== 'async') return false; // let the sync path handle it
      const html = toHtml(
        event.clipboardData?.getData('text/html') ?? '',
        event.clipboardData?.getData('text/plain') ?? ''
      );
      if (!html) return false;
      void runAsyncPaste(engine, asyncPasteLane, html, ui);
      return true; // cancel native insertion — we insert ourselves when it resolves
    },
  });

  // Command-triggered pipeline lane: image:browser:pick (toolbar ☁ button or the
  // page's "Insert cloud image"). The lane is built from the ASSEMBLED pipeline,
  // so with base64 on you can see the hooked `to-base64` chip appear before insert.
  const imgPipeline = engine.pipelines.get('image:browser:pick');
  if (imgPipeline) {
    const lane = buildLane(imgPipeline);
    lanesHost.appendChild(lane.root);
    disposers.push(
      engine.pipelines.on('image:browser:pick', (ev: any) => {
        if (ev.type === 'start') lane.onStart();
        else if (ev.type === 'stage') lane.onStage(ev.report);
        else if (ev.type === 'status') lane.onStatus(ev.status);
        else if (ev.type === 'result') {
          const e = ev.context.extra;
          lane.onResult({ ...e, src: typeof e.src === 'string' ? squish(e.src) : e.src });
        }
      })
    );
  }
  // Reflect the real engine lock (setEditable(false) during a gating run) as the
  // page dim + badge — this is the engine locking itself, not a page-level trick.
  disposers.push(
    engine.events.on('lock', (e: any) => {
      (document.querySelector('#pv-editor-col') as HTMLElement | null)?.classList.toggle('pv-locked', e.locked);
    })
  );

  // Deferred lanes — driven (debounced) by the change event.
  for (const pipeline of [idlePipeline, deepCheckPipeline]) {
    const lane = buildLane(pipeline);
    lanesHost.appendChild(lane.root);
    activeRunners.push(
      new DeferredRunner(pipeline, {
        getContext: (): PipelineContext => ({ doc: engine.state.doc, extra: {} }),
        ui,
        onStart: () => lane.onStart(),
        onStage: (r) => lane.onStage(r),
        onStatus: (s) => lane.onStatus(s),
        onResult: (ctx) => lane.onResult(ctx.extra),
      })
    );
  }
  const scheduleAll = () => activeRunners.forEach((r) => r.schedule());
  disposers.push(engine.events.on('change', scheduleAll));
  scheduleAll();
  (window as any).pipelineRunners = activeRunners;
}

/** The dev plugin set: defaults + the cloud-image browser, plus base64 when on. */
function pluginSet() {
  const set = [...defaultPlugins(), imageBrowserPlugin({ upload: fakeUpload })];
  if (base64.on) set.push(imageBase64Plugin);
  return set;
}

/** Rebuild the editor on the current plugin set, re-inject the host, and re-wire. */
function applyPlugins() {
  if (!km) return;
  km.plugins = pluginSet(); // rebuilds the engine synchronously, preserving content
  const engine = km.engine;
  if (!engine) return;
  engine.setInteractionHost(ui);
  wire(engine);
}

/** Bind the page controls ONCE (they reach the live engine / lanes at click time). */
function wireControlsOnce() {
  document.querySelector('#pv-simulate')?.addEventListener('click', () => {
    const engine = km?.engine;
    if (!engine || !laneRefs.sync) return;
    const cleaned = runPaste(engine, laneRefs.sync, WORD_SAMPLE);
    if (cleaned) insertHTML(engine, cleaned);
  });
  document.querySelector('#pv-simulate-async')?.addEventListener('click', () => {
    const engine = km?.engine;
    if (engine && laneRefs.async) void runAsyncPaste(engine, laneRefs.async, WORD_SAMPLE, ui);
  });
  document.querySelector('#pv-simulate-image')?.addEventListener('click', () => {
    km?.engine?.run('image:browser:pick');
  });

  const pasteModeSel = document.querySelector('#pv-paste-mode') as HTMLSelectElement | null;
  pasteModeSel?.addEventListener('change', () => {
    pasteMode.mode = pasteModeSel.value as 'sync' | 'async';
  });
  const base64Toggle = document.querySelector('#pv-base64') as HTMLInputElement | null;
  base64Toggle?.addEventListener('change', () => {
    base64.on = base64Toggle.checked;
    applyPlugins(); // rebuild with / without the base64 stage
  });

  // Delay slider — scales every async stage so you can watch them pulse.
  const delayInput = document.querySelector('#pv-delay') as HTMLInputElement | null;
  const delayLabel = document.querySelector('#pv-delay-label') as HTMLElement | null;
  if (delayInput) {
    const syncDelay = () => {
      settings.delayMs = Number(delayInput.value);
      if (delayLabel) delayLabel.textContent = String(settings.delayMs);
      activeRunners.forEach((r) => r.schedule()); // re-run so the new delay shows
    };
    delayInput.addEventListener('input', syncDelay);
    syncDelay();
  }
}

function start() {
  wireControlsOnce();
  applyPlugins();
}

if (km) {
  if (km.isReady && km.engine) start();
  else km.addEventListener('ready', () => start());
}
