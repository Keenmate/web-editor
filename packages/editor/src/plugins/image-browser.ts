/**
 * Cloud image browser — the command-triggered counterpart of the paste pipeline.
 *
 * Declares a DEFERRED, locking pipeline `image:browser:pick` fired by a toolbar
 * button: it opens a host-provided picker (an interactive stage via the injected
 * `InteractionHost`), awaits an upload, then inserts an `image` node through the
 * stage write port (`rt.dispatch`). Because it owns insertion it locks the editor
 * for the whole run, so no edit can race the insert and the position stays valid
 * without mapping.
 *
 * This reuses the `image` node from the `image` plugin (hence the dependency) —
 * it contributes behaviour, not schema. A second plugin (`image-base64`) can
 * splice a `to-base64` stage before `insert` without this plugin knowing — see
 * PIPELINES.md ("the universal extension bus").
 */
import { definePlugin, type EditorPlugin } from '../engine/plugin';
import type { Pipeline } from '../engine/pipeline/types';

/** A picked cloud asset (what the host picker returns as the interaction value). */
export interface CloudAsset {
  url: string;
  name?: string;
}

export interface ImageBrowserOptions {
  /**
   * Resolve a picked asset to its final `src` (e.g. upload to your CDN and return
   * the hosted URL). Honour the `signal` — a superseded run aborts. Defaults to
   * using the picked `url` as-is.
   */
  upload?: (asset: CloudAsset, signal: AbortSignal) => Promise<string>;
}

/** Build the cloud-image browser plugin. */
export function imageBrowserPlugin(opts: ImageBrowserOptions = {}): EditorPlugin {
  const upload = opts.upload ?? (async (asset: CloudAsset) => asset.url);

  const pipeline: Pipeline = {
    name: 'image:browser:pick',
    timing: 'deferred',
    policy: { lock: true, thresholdMs: 150 },
    stages: [
      {
        id: 'pick',
        interactive: true,
        run: async (_c, rt) => {
          const res = await rt.ui.request(
            { kind: 'cloud-picker', title: 'Choose a cloud image', message: 'Pick an image to insert.' },
            rt.signal
          );
          if (res.cancelled || !res.value) return { action: 'halt', reason: 'no image chosen' };
          return { action: 'resolve', patch: { asset: res.value as CloudAsset } };
        },
      },
      {
        id: 'upload',
        run: async (c, rt) => {
          const asset = c.extra.asset as CloudAsset;
          const src = await upload(asset, rt.signal);
          return { action: 'resolve', patch: { src, alt: asset.name ?? '' } };
        },
      },
      {
        id: 'insert',
        run: (c, rt) => {
          const view = rt.view;
          if (!view) return { action: 'halt', reason: 'no editor view' };
          const node = view.state.schema.nodes.image.create({
            src: c.extra.src,
            alt: c.extra.alt ?? '',
            title: '',
          });
          rt.dispatch?.(view.state.tr.replaceSelectionWith(node).scrollIntoView());
          return { action: 'resolve' };
        },
      },
    ],
  };

  return definePlugin({
    name: 'image-browser',
    dependencies: ['image'],
    pipelines: [pipeline],
    toolbarGroups: [
      {
        id: 'image-browser',
        label: 'Cloud image',
        items: [
          {
            type: 'command',
            command: 'image:browser:pick',
            label: 'Cloud image',
            icon: '☁',
            title: 'Insert image from the cloud',
          },
        ],
      },
    ],
    menuItems: [{ type: 'command', command: 'image:browser:pick', label: 'Insert cloud image…' }],
  });
}
