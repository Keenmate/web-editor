/**
 * IMAGE USE-CASE PROTOTYPE (dev-only; see PIPELINES.md §"Interactive vs
 * automated, data currency, planner/executor, plugin-API wrappers").
 *
 * Builds on `phases-proto.ts` to run the cloud-image use cases end to end "just
 * to see what we missed," with REAL `Blob`s (tiny canvas swatches) so the
 * blob-as-currency claim is actually exercised — every stage reads a `Blob` from
 * `extra`, transforms the bytes, and writes a `Blob` back; serialization to a data
 * URI happens once, at the edge.
 *
 * Covered:
 *   A  — an interactive editor stage (crop) opens a modal and returns a blob.
 *   B1 — a planner stage writes `extra.cropPlan`; the SAME crop stage then runs
 *        headless from the plan (no dialog). Mode is chosen by whether a plan exists.
 *   wrappers — a pipeline-UNAWARE single-file `image-processor` (api only) is
 *        wrapped by a `batch` plugin that calls its public API per image; a
 *        `reformat` adapter bridges the shape mismatch; `gallery-maker` builds the
 *        gallery via its own public API. No plugin imports another.
 */
import type { OwnerPipelineConfig, PhasedStage, ProtoPlugin } from './phases-proto';

// ── a real-blob image asset + canvas ops (blob is the working currency) ──────────

export interface ImageAsset {
  id: string;
  name: string;
  blob: Blob;
  w: number;
  h: number;
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, quality));
}
function bitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function makeSwatch(name: string, color: string, w: number, h: number): Promise<ImageAsset> {
  const c = canvasOf(w, h);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  // Centered label so it survives an object-fit: cover crop on any aspect ratio.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.95)';
  g.font = 'bold 34px sans-serif';
  g.fillText(name, w / 2, h / 2 - 10);
  g.font = '22px sans-serif';
  g.fillText(`${w}×${h}`, w / 2, h / 2 + 26);
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 10;
  g.strokeRect(0, 0, w, h);
  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, blob: await toBlob(c), w, h };
}

function cropRect(w: number, h: number, aspect: string): { x: number; y: number; w: number; h: number } {
  if (aspect === 'free' || !aspect.includes(':')) return { x: 0, y: 0, w, h };
  const [aw, ah] = aspect.split(':').map(Number);
  const target = aw / ah;
  let cw = w;
  let ch = h;
  if (w / h > target) cw = Math.round(h * target);
  else ch = Math.round(w / target);
  return { x: Math.round((w - cw) / 2), y: Math.round((h - ch) / 2), w: cw, h: ch };
}

export async function cropAsset(a: ImageAsset, aspect: string): Promise<ImageAsset> {
  const r = cropRect(a.w, a.h, aspect);
  const c = canvasOf(r.w, r.h);
  c.getContext('2d')!.drawImage(await bitmap(a.blob), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return { ...a, blob: await toBlob(c), w: r.w, h: r.h };
}

export async function scaleAsset(a: ImageAsset, maxW: number): Promise<ImageAsset> {
  if (a.w <= maxW) return a;
  const w = maxW;
  const h = Math.round((a.h * maxW) / a.w);
  const c = canvasOf(w, h);
  c.getContext('2d')!.drawImage(await bitmap(a.blob), 0, 0, w, h);
  return { ...a, blob: await toBlob(c), w, h };
}

export async function grayscaleAsset(a: ImageAsset): Promise<ImageAsset> {
  const c = canvasOf(a.w, a.h);
  const g = c.getContext('2d')!;
  g.drawImage(await bitmap(a.blob), 0, 0);
  const img = g.getImageData(0, 0, a.w, a.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  return { ...a, blob: await toBlob(c) };
}

export async function watermarkAsset(a: ImageAsset, text: string): Promise<ImageAsset> {
  const c = canvasOf(a.w, a.h);
  const g = c.getContext('2d')!;
  g.drawImage(await bitmap(a.blob), 0, 0);
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.font = `bold ${Math.max(14, Math.round(a.w / 14))}px sans-serif`;
  g.textAlign = 'right';
  g.fillText(text, a.w - 14, a.h - 16);
  return { ...a, blob: await toBlob(c) };
}

export async function compressAsset(a: ImageAsset, quality: number): Promise<ImageAsset> {
  const c = canvasOf(a.w, a.h);
  c.getContext('2d')!.drawImage(await bitmap(a.blob), 0, 0);
  return { ...a, blob: await toBlob(c, 'image/jpeg', quality) };
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
export function kb(b: Blob): string {
  return `${(b.size / 1024).toFixed(1)} kB`;
}

// ── shared stages ────────────────────────────────────────────────────────────────

const pick: PhasedStage = {
  id: 'pick',
  phase: 'acquire',
  interactive: true,
  run: async (_c, rt) => {
    const r = await rt.ui!.request({ kind: 'cloud-picker', title: 'Choose image', payload: { multi: false } }, rt.signal);
    if (r.cancelled) return { action: 'halt', reason: 'cancelled' };
    const asset = r.value as ImageAsset;
    rt.log(`pick → ${asset.name} ${asset.w}×${asset.h} (${kb(asset.blob)})`);
    return { action: 'resolve', patch: { image: asset } };
  },
};

/** The planner (B1): inspects the image and writes an intent for crop to execute. */
const autoPlan: PhasedStage = {
  id: 'auto-plan',
  phase: 'acquire',
  afterIfPresent: 'pick',
  run: (c, rt) => {
    const img = c.extra.image as ImageAsset;
    const aspect = img.w > img.h ? '1:1' : '3:4';
    rt.log(`auto-plan → saw ${img.w}×${img.h}, emit cropPlan { aspect: "${aspect}" }`);
    return { action: 'resolve', patch: { cropPlan: { aspect } } };
  },
};

/** The SAME crop stage serves A and B1: headless if a plan is present, else modal. */
const crop: PhasedStage = {
  id: 'crop',
  phase: 'geometry',
  interactive: true,
  defaultConfig: { aspect: 'free' },
  run: async (c, rt) => {
    const img = c.extra.image as ImageAsset;
    const plan = c.extra.cropPlan as { aspect: string } | undefined;
    if (plan) {
      const out = await cropAsset(img, plan.aspect);
      rt.log(`crop (headless — from plan) → ${plan.aspect} → ${out.w}×${out.h}`);
      return { action: 'resolve', patch: { image: out } };
    }
    const r = await rt.ui!.request(
      { kind: 'crop-editor', title: 'Edit image', payload: { image: img, aspect: rt.config.aspect } },
      rt.signal
    );
    if (r.cancelled) return { action: 'halt', reason: 'crop cancelled' };
    const out = r.value as ImageAsset;
    rt.log(`crop (interactive) → ${out.w}×${out.h}`);
    return { action: 'resolve', patch: { image: out } };
  },
};

const compress: PhasedStage = {
  id: 'compress',
  phase: 'optimize',
  defaultConfig: { quality: 0.4 },
  run: async (c, rt) => {
    const img = c.extra.image as ImageAsset;
    const out = await compressAsset(img, rt.config.quality as number);
    rt.log(`compress q=${rt.config.quality} → ${kb(out.blob)} (was ${kb(img.blob)})`);
    return { action: 'resolve', patch: { image: out } };
  },
};

const watermark: PhasedStage = {
  id: 'watermark',
  phase: 'annotate',
  defaultConfig: { text: '© demo' },
  run: async (c, rt) => {
    const img = c.extra.image as ImageAsset;
    const out = await watermarkAsset(img, rt.config.text as string);
    rt.log(`watermark "${rt.config.text}" (onto the already-compressed image)`);
    return { action: 'resolve', patch: { image: out } };
  },
};

const toBase64: PhasedStage = {
  id: 'to-base64',
  phase: 'encode',
  run: async (c, rt) => {
    const img = c.extra.image as ImageAsset;
    const url = await blobToDataUrl(img.blob);
    rt.log(`to-base64 → data URI (${Math.round(url.length / 1024)} kB string)`);
    return { action: 'resolve', patch: { dataUrl: url } };
  },
};

const insert: PhasedStage = {
  id: 'insert',
  phase: 'insert',
  run: (c, rt) => {
    const img = c.extra.image as ImageAsset;
    rt.log(`insert → final ${img.w}×${img.h} ${kb(img.blob)}`);
    return { action: 'resolve', patch: { final: img } };
  },
};

// ── pipeline 1 — image:pick (A + B1 + phase ordering + config cell) ──────────────

export const PICK_PIPELINE = 'image:pick';

export function pickPipelinePlugins(opts: { planner: boolean; base64: boolean }): ProtoPlugin[] {
  const list: ProtoPlugin[] = [
    {
      name: 'image-browser',
      pipelines: [{ name: PICK_PIPELINE, phases: ['acquire', 'geometry', 'optimize', 'annotate', 'encode', 'insert'] }],
      stages: { [PICK_PIPELINE]: [{ stage: pick }, { stage: insert }] },
    },
    { name: 'image-crop', dependencies: ['image-browser'], stages: { [PICK_PIPELINE]: [{ stage: crop }] } },
    { name: 'image-compress', dependencies: ['image-browser'], stages: { [PICK_PIPELINE]: [{ stage: compress }] } },
    { name: 'image-watermark', dependencies: ['image-browser'], stages: { [PICK_PIPELINE]: [{ stage: watermark }] } },
  ];
  if (opts.planner)
    list.push({ name: 'image-autoplan', dependencies: ['image-browser'], stages: { [PICK_PIPELINE]: [{ stage: autoPlan }] } });
  if (opts.base64)
    list.push({ name: 'image-base64', dependencies: ['image-browser'], stages: { [PICK_PIPELINE]: [{ stage: toBase64 }] } });
  return list;
}

export function pickOwnerConfig(aspect: string): OwnerPipelineConfig {
  return { config: { crop: { aspect } } };
}

// ── pipeline 2 — gallery:build (wrappers + batch + adapter) ──────────────────────

export const GALLERY_PIPELINE = 'gallery:build';

/** API shape the single-file processor exposes to other plugins. */
interface ProcessorApi {
  process(a: ImageAsset): Promise<ImageAsset>;
}
/** API shape the gallery maker exposes. */
interface GalleryApi {
  build(items: { src: string; caption: string }[]): string;
}

const pickMany: PhasedStage = {
  id: 'pick-many',
  phase: 'acquire',
  interactive: true,
  run: async (_c, rt) => {
    const r = await rt.ui!.request({ kind: 'cloud-picker', title: 'Choose images', payload: { multi: true } }, rt.signal);
    if (r.cancelled) return { action: 'halt', reason: 'cancelled' };
    const assets = r.value as ImageAsset[];
    rt.log(`pick-many → ${assets.length} images`);
    return { action: 'resolve', patch: { images: assets } };
  },
};

/** The batch wrapper: a single-file tool used N times, batched in userland. */
const batchProcess: PhasedStage = {
  id: 'batch-process',
  phase: 'process',
  run: async (c, rt) => {
    const imgs = c.extra.images as ImageAsset[];
    const api = rt.getApi!<ProcessorApi>('image-processor');
    if (!api) return { action: 'halt', reason: 'image-processor api missing' };
    const processed: ImageAsset[] = [];
    for (const im of imgs) {
      if (rt.signal.aborted) break;
      processed.push(await api.process(im));
    }
    rt.log(`batch-process → ${processed.length} via image-processor.api (single-file tool, batched by wrapper)`);
    return { action: 'resolve', patch: { processed } };
  },
};

/** The adapter: reshape {id,name,blob} → {src,caption} the gallery maker expects. */
const adapt: PhasedStage = {
  id: 'adapt',
  phase: 'adapt',
  run: async (c, rt) => {
    const processed = c.extra.processed as ImageAsset[];
    const items = await Promise.all(processed.map(async (p) => ({ src: await blobToDataUrl(p.blob), caption: p.name })));
    rt.log(`adapt → reshaped ${items.length} {id,name,blob} → {src,caption} for gallery-maker`);
    return { action: 'resolve', patch: { galleryItems: items } };
  },
};

const assemble: PhasedStage = {
  id: 'assemble',
  phase: 'assemble',
  run: (c, rt) => {
    const items = c.extra.galleryItems as { src: string; caption: string }[];
    const api = rt.getApi!<GalleryApi>('gallery-maker');
    const html = api ? api.build(items) : '';
    rt.log(`assemble → gallery of ${items.length} tiles (via gallery-maker.api.build)`);
    return { action: 'resolve', patch: { galleryHtml: html } };
  },
};

export function galleryPlugins(): ProtoPlugin[] {
  return [
    // gallery-maker: declares the pipeline + exposes its public build() API.
    {
      name: 'gallery-maker',
      api: {
        build: (items: { src: string; caption: string }[]) =>
          `<div class="im-gal">${items
            .map((i) => `<figure><img src="${i.src}" alt="${i.caption}"><figcaption>${i.caption}</figcaption></figure>`)
            .join('')}</div>`,
      } satisfies GalleryApi,
      pipelines: [{ name: GALLERY_PIPELINE, phases: ['acquire', 'process', 'adapt', 'assemble'] }],
      stages: { [GALLERY_PIPELINE]: [{ stage: assemble }] },
    },
    // image-browser-many: contributes the multi-pick acquire stage.
    { name: 'image-browser-many', dependencies: ['gallery-maker'], stages: { [GALLERY_PIPELINE]: [{ stage: pickMany }] } },
    // image-processor: PIPELINE-UNAWARE — api only, no stages. The "stale/single-file" tool.
    {
      name: 'image-processor',
      api: { process: async (a: ImageAsset) => scaleAsset(await grayscaleAsset(a), 160) } satisfies ProcessorApi,
    },
    // image-batch: wraps image-processor for batch use.
    { name: 'image-batch', dependencies: ['image-browser-many', 'image-processor'], stages: { [GALLERY_PIPELINE]: [{ stage: batchProcess }] } },
    // image-adapt: bridges the shape mismatch between batch output and gallery input.
    { name: 'image-adapt', dependencies: ['image-batch', 'gallery-maker'], stages: { [GALLERY_PIPELINE]: [{ stage: adapt }] } },
  ];
}
