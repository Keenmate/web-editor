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
import type { EditorViewMode, EditorToolbar, EditorStatusBar } from '../web-component';

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
  /** Persistent slot for the static (zone) toolbar. */
  readonly toolbarMount: HTMLDivElement;
  /** Persistent slots for the dedicated status bar(s) — top and bottom edges. */
  readonly statusTopMount: HTMLDivElement;
  readonly statusBottomMount: HTMLDivElement;
  /** Persistent shadow-local layer the floating presenters portal into. */
  readonly overlayLayer: HTMLDivElement;
  /** Persistent slot for the pipeline pending loader (corner of the editor body; `hidden` when idle). */
  readonly pendingMount: HTMLDivElement;

  #shadow: ShadowRoot;
  #host: HTMLElement;
  #serialize: (format: SerializationFormat) => string;

  #root?: HTMLDivElement;
  #outputTabs?: HTMLDivElement;
  #outputPre?: HTMLPreElement;
  #outputFormat: SerializationFormat = 'html';

  #mode: EditorViewMode = 'edit';
  #isInert = false;
  #anchorSelector: string | null = null;
  #anchorHandle?: AnchorHandle;

  constructor(opts: ViewLayoutOptions) {
    this.#shadow = opts.shadow;
    this.#host = opts.host;
    this.#serialize = opts.serialize;

    this.mount = document.createElement('div');
    this.mount.className = 'km-editor';
    this.mount.setAttribute('part', 'editor');

    // Toolbar slot — placed at the top of the root on every render; the chrome
    // fills it with the static toolbar (empty + zero-height until it does).
    this.toolbarMount = document.createElement('div');
    this.toolbarMount.className = 'we-toolbar';
    this.toolbarMount.setAttribute('part', 'toolbar');

    // Status-bar slots — dedicated strips (top / bottom edges of the body),
    // separate from the toolbar zones.
    this.statusTopMount = document.createElement('div');
    this.statusTopMount.className = 'we-status';
    this.statusTopMount.setAttribute('part', 'status-top');
    this.statusBottomMount = document.createElement('div');
    this.statusBottomMount.className = 'we-status';
    this.statusBottomMount.setAttribute('part', 'status-bottom');

    // Pending-loader slot — overlays the editor body's corner while a deferred
    // pipeline (e.g. an image upload) outlives its loader threshold.
    this.pendingMount = document.createElement('div');
    this.pendingMount.className = 'we-pending';
    this.pendingMount.setAttribute('part', 'loader');
    this.pendingMount.hidden = true;

    // Overlay layer — a sibling of the root (not re-rendered), so portaled
    // floating panels survive a view-mode change. Positioned panels are fixed,
    // so this layer itself takes no space.
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'we-overlays';
    this.#shadow.appendChild(this.overlayLayer);
  }

  /** Seed the split output lens (before the user clicks a tab). */
  setDefaultOutputFormat(format: SerializationFormat): void {
    this.#outputFormat = format;
  }

  /**
   * (Re)build the shadow structure for `mode` + `toolbarSide`. The toolbar slot
   * and the editor mount are wrapped in one bordered `.we-surface` frame (so the
   * toolbar sits flush against the editor, with a divider, rather than floating as
   * a separate card); `toolbarSide` sets which edge the toolbar occupies. Builds
   * the output panel only for `split`; (re)anchors only for `inline`.
   */
  render(
    mode: EditorViewMode,
    anchorSelector: string | null,
    toolbarSide: EditorToolbar = 'top',
    statusSide: EditorStatusBar = 'none'
  ): void {
    this.#mode = mode;
    this.#anchorSelector = anchorSelector;
    this.#teardownAnchor();

    // Detach the persistent nodes so replaceChildren() below can't destroy them.
    this.toolbarMount.remove();
    this.statusTopMount.remove();
    this.statusBottomMount.remove();
    this.pendingMount.remove();
    this.mount.remove();

    if (!this.#root) {
      this.#root = document.createElement('div');
      this.#root.setAttribute('part', 'container');
      this.#root.toggleAttribute('inert', this.#isInert);
      this.#shadow.appendChild(this.#root);
    }
    const root = this.#root;
    root.className = `we-root we-${mode}`;
    root.replaceChildren();
    this.#outputTabs = undefined;
    this.#outputPre = undefined;

    // The editor frame (surface) owns the border and docks the toolbar to its
    // side. The status bar lives INSIDE, in the body group next to the editor —
    // so it always hugs the content, with the toolbar on the outside.
    const body = document.createElement('div');
    body.className = 'we-body';
    if (statusSide === 'top' || statusSide === 'both') body.appendChild(this.statusTopMount);
    body.appendChild(this.mount);
    if (statusSide === 'bottom' || statusSide === 'both') body.appendChild(this.statusBottomMount);
    body.appendChild(this.pendingMount);

    const surface = document.createElement('div');
    surface.className = `we-surface we-tb-${toolbarSide}`;
    surface.setAttribute('part', 'surface');
    surface.appendChild(this.toolbarMount);
    surface.appendChild(body);
    root.appendChild(surface);

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

  /**
   * Release live positioning resources without tearing down the structure.
   * The element calls this on `disconnect()` so a detached-but-held `inline`
   * editor doesn't keep a floating-ui `autoUpdate` loop running against its
   * detached host; a reconnect re-anchors via `render()`.
   */
  deactivate(): void {
    this.#teardownAnchor();
  }

  /**
   * Re-acquire live positioning after {@link deactivate} (the host was
   * reconnected): re-anchors an `inline` editor without rebuilding the shadow
   * structure, so the editor mount — and the live view — stays where it is.
   */
  activate(): void {
    this.#teardownAnchor();
    if (this.#mode === 'inline') this.#setupInline();
  }

  /** `disabled`: make the whole surface (editor, toolbar, status, output) `inert`. */
  setInert(isInert: boolean): void {
    this.#isInert = isInert;
    this.#root?.toggleAttribute('inert', isInert);
  }

  destroy(): void {
    this.#teardownAnchor();
    this.overlayLayer.remove();
    this.#root?.remove();
    this.#root = undefined;
  }

  // ── split output panel ──────────────────────────────────────────────────

  #buildOutputPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'we-output';
    panel.setAttribute('part', 'output');

    const tabs = document.createElement('div');
    tabs.className = 'we-output-tabs';
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
    pre.className = 'we-output-pre';
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
