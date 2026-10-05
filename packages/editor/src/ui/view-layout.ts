/**
 * ViewLayout — owns the `<km-editor>` shadow-DOM structure for the four view
 * modes (Phase 3 / PLAN B1):
 *
 *   - `edit`    — the editor surface alone.
 *   - `split`   — editor + a live output panel (format-switchable: md/html/json).
 *   - `preview` — the editor surface, read-only (the element forces editable off).
 *   - `inline`  — the host floats as an overlay card; when an `anchor` selector
 *                 is given it tracks that live-page element via core `anchor()`.
 *
 * The editor **mount node is persistent** (`this.mount`): switching modes
 * re-parents it rather than recreating it, so the live ProseMirror view (and the
 * document + selection) survive a mode change. The output panel is the only
 * mode-specific structure that is built/torn down.
 */
import { anchor, type AnchorHandle } from '@keenmate/web-components-core/positioning';
import type { SerializationFormat } from '../engine/serialization';
import type { EditorMode } from '../web-component';

const OUTPUT_FORMATS: readonly SerializationFormat[] = ['markdown', 'html', 'json'];
const OUTPUT_LABELS: Record<SerializationFormat, string> = {
  markdown: 'Markdown',
  html: 'HTML',
  json: 'JSON',
};

export interface ViewLayoutOptions {
  shadow: ShadowRoot;
  /** The custom element (positioned as the floating card in `inline` mode). */
  host: HTMLElement;
  /** Serialize the current document to a format — feeds the split output panel. */
  serialize: (format: SerializationFormat) => string;
}

export class ViewLayout {
  /** The persistent editor surface. The engine mounts its view here, once. */
  readonly mount: HTMLDivElement;

  #shadow: ShadowRoot;
  #host: HTMLElement;
  #serialize: (format: SerializationFormat) => string;

  #root?: HTMLDivElement;
  #outputTabs?: HTMLDivElement;
  #outputPre?: HTMLPreElement;
  #outputFormat: SerializationFormat = 'html';

  #mode: EditorMode = 'edit';
  #anchorSelector: string | null = null;
  #anchorHandle?: AnchorHandle;

  constructor(opts: ViewLayoutOptions) {
    this.#shadow = opts.shadow;
    this.#host = opts.host;
    this.#serialize = opts.serialize;

    this.mount = document.createElement('div');
    this.mount.className = 'km-editor';
    this.mount.setAttribute('part', 'editor');
  }

  /** Seed the split output lens (before the user clicks a tab). */
  setDefaultOutputFormat(format: SerializationFormat): void {
    this.#outputFormat = format;
  }

  /**
   * (Re)build the shadow structure for `mode`. Re-parents the persistent mount;
   * builds the output panel only for `split`; (re)anchors only for `inline`.
   */
  render(mode: EditorMode, anchorSelector: string | null): void {
    this.#mode = mode;
    this.#anchorSelector = anchorSelector;
    this.#teardownAnchor();

    // Detach the mount so replaceChildren() below can't destroy it.
    this.mount.remove();

    if (!this.#root) {
      this.#root = document.createElement('div');
      this.#root.setAttribute('part', 'root');
      this.#shadow.appendChild(this.#root);
    }
    const root = this.#root;
    root.className = `km-root km-${mode}`;
    root.replaceChildren();
    this.#outputTabs = undefined;
    this.#outputPre = undefined;

    root.appendChild(this.mount);
    if (mode === 'split') {
      root.appendChild(this.#buildOutputPanel());
      this.refreshOutput();
    }
    if (mode === 'inline') this.#setupInline();
  }

  /** Refresh the split output panel in place (no structural change). */
  refreshOutput(): void {
    if (this.#mode !== 'split' || !this.#outputPre) return;
    this.#outputPre.textContent = this.#serialize(this.#outputFormat);
  }

  destroy(): void {
    this.#teardownAnchor();
    this.#root?.remove();
    this.#root = undefined;
  }

  // ── split output panel ──────────────────────────────────────────────────

  #buildOutputPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'km-output';
    panel.setAttribute('part', 'output');

    const tabs = document.createElement('div');
    tabs.className = 'km-output-tabs';
    for (const fmt of OUTPUT_FORMATS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = OUTPUT_LABELS[fmt];
      btn.dataset.format = fmt;
      if (fmt === this.#outputFormat) btn.classList.add('active');
      btn.addEventListener('click', () => this.#selectOutput(fmt));
      tabs.appendChild(btn);
    }

    const pre = document.createElement('pre');
    pre.className = 'km-output-pre';
    pre.setAttribute('part', 'output-content');

    panel.append(tabs, pre);
    this.#outputTabs = tabs;
    this.#outputPre = pre;
    return panel;
  }

  #selectOutput(format: SerializationFormat): void {
    this.#outputFormat = format;
    if (this.#outputTabs) {
      for (const child of Array.from(this.#outputTabs.children)) {
        child.classList.toggle('active', (child as HTMLElement).dataset.format === format);
      }
    }
    this.refreshOutput();
  }

  // ── inline overlay anchoring ──────────────────────────────────────────────

  #setupInline(): void {
    const selector = this.#anchorSelector;
    if (!selector) return; // no target → the card renders in normal flow (CSS chrome only)

    // Resolve against the host's root (shadow-aware) first, then the document.
    const scope = this.#host.getRootNode() as Document | ShadowRoot;
    const ref =
      (scope.querySelector?.(selector) as HTMLElement | null) ??
      document.querySelector<HTMLElement>(selector);
    if (!ref) return;

    // Float the host over the reference (core positioning primitive, SPEC §12.2).
    this.#anchorHandle = anchor(this.#host, ref, {
      placement: 'bottom-start',
      strategy: 'fixed',
      offset: 6,
      matchWidth: 'min',
    });
  }

  #teardownAnchor(): void {
    this.#anchorHandle?.destroy();
    this.#anchorHandle = undefined;
    // Clear the inline styles anchor() wrote to the host (see core anchor.js).
    for (const prop of ['position', 'left', 'top', 'width', 'min-width']) {
      this.#host.style.removeProperty(prop);
    }
  }
}
