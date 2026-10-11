/**
 * IMAGE USE-CASE PROTOTYPE — visual driver (dev-only; examples-image-cases.html).
 *
 * Runs the two image pipelines from `images-proto.ts` behind a real modal host, so
 * the use cases are clickable: pick a cloud image → (A) crop it in a dialog, or
 * (B1) turn on the planner and watch crop run headless; then build a gallery from
 * several images via a pipeline-unaware processor wrapped for batch + a shape
 * adapter + the gallery maker's public API. Nothing here touches the shipped engine.
 */
import {
  assemblePhased,
  buildApiRegistry,
  runAssembled,
  type OwnerPipelineConfig,
  type ProtoInteractionHost,
  type ProtoInteractionResult,
  type ProtoPlugin,
} from './phases-proto';
import {
  GALLERY_PIPELINE,
  PICK_PIPELINE,
  blobToDataUrl,
  cropAsset,
  galleryPlugins,
  makeSwatch,
  pickOwnerConfig,
  pickPipelinePlugins,
  type ImageAsset,
} from './images-proto';

// ── tiny DOM helper ─────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

// ── the cloud image catalog (varied dims so the planner has something to decide) ──

const CATALOG: Array<[string, string, number, number]> = [
  ['Sunset', '#f59e0b', 640, 400],
  ['Forest', '#16a34a', 400, 600],
  ['Ocean', '#0ea5e9', 800, 450],
  ['Berry', '#db2777', 500, 500],
];
let catalogCache: ImageAsset[] | undefined;
async function catalog(): Promise<ImageAsset[]> {
  if (!catalogCache) catalogCache = await Promise.all(CATALOG.map(([n, c, w, h]) => makeSwatch(n, c, w, h)));
  return catalogCache;
}

// ── modal interaction host ────────────────────────────────────────────────────────

function modal(
  title: string,
  body: HTMLElement,
  buttons: Array<{ label: string; primary?: boolean; value: () => unknown | null }>,
  signal: AbortSignal
): Promise<ProtoInteractionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const overlay = el('div', { class: 'im-modal' });
    const actions = el('div', { class: 'im-modal-actions' });
    const card = el('div', { class: 'im-modal-card' }, [el('div', { class: 'im-modal-title' }, [title]), body, actions]);
    const close = (r: ProtoInteractionResult) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      signal.removeEventListener('abort', onAbort);
      resolve(r);
    };
    const onAbort = () => close({ cancelled: true });
    signal.addEventListener('abort', onAbort);
    for (const b of buttons) {
      actions.append(
        el('button', {
          // Shared button vocabulary: primary = indigo, others = outline (readable).
          class: b.primary ? '' : 'btn-outline',
          onclick: () => {
            const v = b.value();
            if (v === undefined) return; // not ready (e.g. nothing picked yet) — ignore the click
            close(v === null ? { cancelled: true } : { cancelled: false, value: v });
          },
        }, [b.label])
      );
    }
    overlay.append(card);
    document.body.append(overlay);
  });
}

const host: ProtoInteractionHost = {
  async request(req, signal) {
    if (req.kind === 'cloud-picker') {
      const multi = !!(req.payload as { multi?: boolean }).multi;
      const selected = new Set<number>();
      const imgs: HTMLImageElement[] = [];
      let assets: ImageAsset[] = [];
      // Open with a loading placeholder — the catalog streams in once ready.
      const grid = el('div', { class: 'im-picker im-picker--loading' }, [
        el('div', { class: 'im-loading' }, ['Loading images…']),
      ]);
      const body = el('div', {}, [el('p', { class: 'im-hint' }, [multi ? 'Pick one or more.' : 'Pick one.']), grid]);

      // The dialog opens immediately; the OK button ignores clicks until a pick exists.
      const result = modal(
        req.title,
        body,
        [
          { label: 'Cancel', value: () => null },
          {
            label: 'OK',
            primary: true,
            value: () => {
              if (selected.size === 0) return undefined; // not ready — nothing picked yet
              const chosen = [...selected].map((i) => assets[i]);
              return multi ? chosen : chosen[0];
            },
          },
        ],
        signal
      );

      // Load the catalog INSIDE the open dialog, then render the thumbnails.
      void catalog().then((loaded) => {
        if (signal.aborted) return;
        assets = loaded;
        grid.classList.remove('im-picker--loading');
        grid.replaceChildren();
        loaded.forEach((a, i) => {
          const im = document.createElement('img');
          im.title = `${a.name} · ${a.w}×${a.h}`;
          void blobToDataUrl(a.blob).then((u) => (im.src = u));
          im.addEventListener('click', () => {
            if (!multi) {
              selected.clear();
              imgs.forEach((x) => x.classList.remove('sel'));
            }
            if (selected.has(i)) {
              selected.delete(i);
              im.classList.remove('sel');
            } else {
              selected.add(i);
              im.classList.add('sel');
            }
          });
          imgs.push(im);
          grid.append(im);
        });
      });

      return result;
    }

    if (req.kind === 'crop-editor') {
      const { image, aspect } = req.payload as { image: ImageAsset; aspect: string };
      const sel = document.createElement('select');
      ['free', '1:1', '3:4', '16:9'].forEach((o) => {
        const op = document.createElement('option');
        op.value = o;
        op.textContent = o;
        if (o === aspect) op.selected = true;
        sel.append(op);
      });
      const preview = document.createElement('img');
      preview.className = 'im-prev';
      void blobToDataUrl(image.blob).then((u) => (preview.src = u));
      const body = el('div', {}, [
        el('p', { class: 'im-hint' }, [`${image.name} · ${image.w}×${image.h} — choose an aspect, then Apply.`]),
        preview,
        el('div', { class: 'im-row' }, ['aspect: ', sel]),
      ]);
      const r = await modal(
        req.title,
        body,
        [
          { label: 'Cancel', value: () => null },
          { label: 'Apply crop', primary: true, value: () => ({ aspect: sel.value }) },
        ],
        signal
      );
      if (r.cancelled) return r;
      const out = await cropAsset(image, (r.value as { aspect: string }).aspect);
      return { cancelled: false, value: out };
    }

    return { cancelled: true };
  },
};

// ── scenario cards ────────────────────────────────────────────────────────────────

function card(title: string, desc: string, body: HTMLElement): HTMLElement {
  return el('section', { class: 'example-section' }, [el('h2', {}, [title]), el('p', { class: 'description', html: desc }), body]);
}

async function runAndRender(
  plugins: ProtoPlugin[],
  pipeline: string,
  owner: OwnerPipelineConfig,
  logEl: HTMLPreElement,
  render: (extra: Record<string, unknown>) => void | Promise<void>
): Promise<void> {
  logEl.textContent = '';
  const log = (line: string) => {
    logEl.textContent += line + '\n';
  };
  let asm;
  try {
    asm = assemblePhased(plugins, pipeline, owner);
  } catch (err) {
    log(`THROW → ${(err as Error).message}`);
    return;
  }
  log(`order: ${asm.stages.map((s) => s.id).join(' › ')}`);
  const ctx = await runAssembled(asm, { extra: {} }, log, { ui: host, getApi: buildApiRegistry(plugins) });
  await render(ctx.extra);
}

function scenarioPick(): HTMLElement {
  const planner = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const base64 = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const aspect = document.createElement('select');
  ['free', '1:1', '3:4', '16:9'].forEach((o) => {
    const op = document.createElement('option');
    op.value = o;
    op.textContent = o;
    aspect.append(op);
  });

  const log = el('pre', { class: 'log-panel im-log' });
  const result = el('div', { class: 'im-result-area' });

  const run = el('button', {
    onclick: () =>
      void runAndRender(
        pickPipelinePlugins({ planner: planner.checked, base64: base64.checked }),
        PICK_PIPELINE,
        pickOwnerConfig(aspect.value),
        log,
        async (extra) => {
          result.replaceChildren();
          const final = extra.final as ImageAsset | undefined;
          if (final) {
            const im = document.createElement('img');
            im.className = 'im-final';
            im.src = await blobToDataUrl(final.blob);
            result.append(im, el('div', { class: 'im-cap' }, [`final · ${final.w}×${final.h}`]));
          }
        }
      ),
  }, ['▶ run image:pick']);

  const controls = el('div', { class: 'controls' }, [
    el('label', { class: 'toggle-label' }, [planner, ' planner (B1 — crop runs headless)']),
    el('label', { class: 'toggle-label' }, [base64, ' base64 encode']),
    el('label', { class: 'toggle-label' }, ['crop config aspect: ', aspect]),
  ]);

  return card(
    'A + B1 · pick → (interactive crop | planned headless crop) → compress → watermark → encode → insert',
    'Run it: a <b>cloud picker</b> opens, then (A) the <b>crop editor</b> modal — one stage does the whole interactive job and returns a blob. Turn on <b>planner</b> and run again: an <code>auto-plan</code> stage writes <code>extra.cropPlan</code> and the <b>same</b> crop stage runs <b>headless</b>, no dialog. Blob is the currency throughout; compress shrinks it, watermark lands on the compressed image, base64 serializes once at the edge.',
    el('div', {}, [controls, run, log, result])
  );
}

function scenarioGallery(): HTMLElement {
  const log = el('pre', { class: 'log-panel im-log' });
  const result = el('div', { class: 'im-result-area' });
  const run = el('button', {
    onclick: () =>
      void runAndRender(galleryPlugins(), GALLERY_PIPELINE, {}, log, (extra) => {
        result.innerHTML = (extra.galleryHtml as string) ?? '';
      }),
  }, ['▶ run gallery:build']);

  return card(
    'wrappers + batch + adapter · pick-many → batch-process → adapt → assemble',
    'Pick <b>several</b> images. A pipeline-<b>unaware</b> single-file <code>image-processor</code> (API only, no stages) is wrapped by <code>image-batch</code>, which calls its public <code>process()</code> per image. <code>image-adapt</code> reshapes <code>{id,name,blob}</code> → <code>{src,caption}</code>, and <code>gallery-maker</code> builds the gallery via its own public <code>build()</code> API. No plugin imports another — they meet on the <code>extra</code> blackboard and by named API.',
    el('div', {}, [run, log, result])
  );
}

// ── boot ─────────────────────────────────────────────────────────────────────────

const root = document.getElementById('im-root');
if (root) root.append(scenarioPick(), scenarioGallery());
