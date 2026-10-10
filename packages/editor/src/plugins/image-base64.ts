/**
 * Inline-images-as-base64 — a one-stage plugin that demonstrates the pipeline
 * extension bus. It contributes a single `to-base64` stage into the
 * `image:browser:pick` pipeline, anchored BEFORE its `insert` stage, so every
 * picked image is fetched and converted to a `data:` URI before it lands in the
 * document.
 *
 * It imports nothing from `image-browser` beyond the pipeline NAME and the anchor
 * stage id. Drop it into the plugin set → uploads inline as data URIs; pull it
 * out → they stay as cloud URLs. Neither plugin changes. (PIPELINES.md.)
 */
import { definePlugin } from '../engine/plugin';

/** Fetch an image URL and convert it to a `data:` URI. Aborts with the run. */
async function toDataUri(src: string, signal: AbortSignal): Promise<string> {
  const resp = await fetch(src, { signal });
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const imageBase64Plugin = definePlugin({
  name: 'image-base64',
  dependencies: ['image-browser'],
  stages: {
    'image:browser:pick': [
      {
        before: 'insert',
        stage: {
          id: 'to-base64',
          run: async (c, rt) => {
            const src = c.extra.src as string;
            if (!src || src.startsWith('data:')) return { action: 'skip' };
            return { action: 'resolve', patch: { src: await toDataUri(src, rt.signal) } };
          },
        },
      },
    ],
  },
});
