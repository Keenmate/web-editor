/**
 * `<km-editor>` — the custom element, built on `@keenmate/web-components-core`
 * (`BlissElement`). A thin shell over the headless {@link EditorEngine}: it owns
 * the shadow root, adopts the editor stylesheet, declares the public surface as a
 * core input/event table, and bridges engine events to outward CustomEvents.
 *
 * Reactivity (per input `on:`):
 *   - `reinit` — content source changed (`value`) → rebuild the engine.
 *   - `update` — `mode` / `readonly` / `theme` / `format` → patch in place
 *                (toggle editable, reflect the attribute, re-report content).
 *
 * The content model is ONE ProseMirror document (the engine's). `format` is the
 * serialization lens for I/O (the `value` input, `getValue()`, and the `change`
 * event detail) — switching it never rebuilds the document, only changes how its
 * content is read in and out. This is the single-model design from PLAN.md: no
 * second editing surface, no convertor round-trip.
 *
 * NOTE on `el.value`: core installs an instance accessor for every input, so
 * reading `el.value` returns the last value ASSIGNED (the config), not live
 * edits. Use {@link getValue} / {@link getContent} to read what the user typed.
 */
import {
  BlissElement,
  toBool,
  toEnum,
  toText,
  adoptStyles,
  type InputDef,
} from '@keenmate/web-components-core';
import { EditorEngine, type EditorEngineOptions } from './engine/editor-engine';
import type { SerializationFormat } from './engine/serialization';
import { ViewLayout } from './ui/view-layout';
import styles from './css/editor.css?inline';
import { initLogger, contentLogger } from './logger';

// Build-time constant (vite `define`).
declare const __VERSION__: string;

/** How the editor is presented. Layout for `split`/`inline` lands in Phase 3. */
export type EditorMode = 'edit' | 'split' | 'preview' | 'inline';
/** The serialization lens used for content I/O. */
export type EditorFormat = SerializationFormat; // 'html' | 'markdown' | 'json'

const MODES = ['edit', 'split', 'preview', 'inline'] as const;
const FORMATS = ['markdown', 'html', 'json'] as const;

// ============================================================================
// INPUT TABLE — the whole <km-editor> public attribute/property surface.
// ============================================================================
const INPUTS: readonly InputDef[] = [
  {
    configKey: 'value',
    attribute: 'value',
    converter: toText({ isNullable: true }),
    on: 'reinit',
    description:
      'Initial content to load, interpreted per `format`. Reassigning replaces the document. Reading `el.value` returns this assigned value, NOT live edits — use `getValue()` for that.',
  },
  {
    configKey: 'format',
    attribute: 'format',
    converter: toEnum(FORMATS, { default: 'markdown' }),
    reflect: true,
    on: 'update',
    description:
      "Serialization lens for content I/O (`value`, `getValue()`, the `change` event): 'markdown' (default), 'html', or 'json'. Switching it re-reports the SAME document in the new format — it never rebuilds the document.",
  },
  {
    configKey: 'mode',
    attribute: 'mode',
    converter: toEnum(MODES, { default: 'edit' }),
    reflect: true,
    on: 'update',
    description:
      "Presentation: 'edit' (default), 'split' (editor + live output), 'preview' (read-only render), or 'inline' (overlay chrome on a live-page element). `preview` forces read-only. Full layouts arrive in Phase 3; for now the mode is stored, reflected, and announced via `mode-change`.",
  },
  {
    configKey: 'readonly',
    attribute: 'readonly',
    converter: toBool('default-false'),
    on: 'update',
    description: 'Make the editor read-only (no input). `mode="preview"` also forces this on.',
  },
  {
    configKey: 'theme',
    attribute: 'theme',
    converter: toText({ isNullable: true }),
    reflect: true,
    on: 'update',
    description: 'Theme name, reflected to the host attribute for CSS theming (`:host([theme="…"])`).',
  },
  {
    configKey: 'anchor',
    attribute: 'anchor',
    converter: toText({ isNullable: true }),
    on: 'update',
    description:
      'For `mode="inline"` only: a CSS selector for the live-page element the floating editor card anchors to (tracked via the core positioning primitive). Absent → the inline card renders in normal flow.',
  },
];

/** Outward events (core §12.5) — install managed `onChange`/`onReady`/`onModeChange`. */
export interface EditorChangeDetail {
  /** Current content serialized in the active `format`. */
  value: string;
  format: EditorFormat;
}
export interface EditorModeChangeDetail {
  mode: EditorMode;
}
type EditorEvents = {
  change: EditorChangeDetail;
  ready: undefined;
  'mode-change': EditorModeChangeDetail;
};
const EVENTS = [
  {
    name: 'change',
    description:
      'The document changed. `detail.value` is the content serialized in the active `format`; `detail.format` is that format.',
  },
  {
    name: 'ready',
    description: 'The engine was built and mounted (once per element lifetime). No detail beyond readiness.',
  },
  {
    name: 'mode-change',
    description: 'The `mode` attribute/property changed. `detail.mode` is the new mode.',
  },
] as const;

export class KmEditorElement extends BlissElement<EditorEvents> {
  protected static override inputs = INPUTS;
  protected static override events = EVENTS;

  // Type-only: core installs the managed accessors at runtime (§12.5).
  declare onChange: ((e: CustomEvent<EditorChangeDetail>) => void) | null;
  declare onReady: ((e: CustomEvent<undefined>) => void) | null;
  declare onModeChange: ((e: CustomEvent<EditorModeChangeDetail>) => void) | null;

  #shadow: ShadowRoot;
  #layout: ViewLayout;
  #engine?: EditorEngine;
  #unsubscribe?: () => void;
  // The content source string, in `format`. Seeded from `value`, refreshed from
  // the live engine before a teardown so a reconnect rebuild keeps the edits.
  #content: string | null = null;
  // `ready` fires once per element lifetime; `is-ready` presence is the guard.
  #readyFired = false;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    // §12.8: adopt the shared editor stylesheet into the shadow root (one cached
    // CSSStyleSheet per string). Linked render-blocking in the playground; here it
    // rides the component so consumers need no separate <link>.
    adoptStyles(this.#shadow, styles);
    // Owns the shadow structure + the persistent editor mount across view modes.
    this.#layout = new ViewLayout({
      shadow: this.#shadow,
      host: this,
      serialize: (fmt) => (this.#engine ? this.#engine.serialize(fmt) : ''),
    });
  }

  // ── core lifecycle hooks ──────────────────────────────────────────────────

  /** Content source changed (or first connect): (re)build the engine. */
  protected override reinit(): void {
    // A `value` (re)assignment is an explicit content replacement — take it as the
    // new source. (First connect also lands here with config.value as the seed.)
    this.#content = (this.config.value as string | null) ?? null;
    if (this.isConnected) this.#rebuildEngine();
  }

  /** Cosmetic/behavioural change: patch the live engine without a rebuild. */
  protected override update(partial: Record<string, unknown>): void {
    if ('readonly' in partial || 'mode' in partial) {
      this.#engine?.setEditable(this.#resolveEditable());
    }
    // Structural view-mode / anchor change: re-arrange the shadow layout in place
    // (the persistent mount is re-parented, so the live document survives).
    if ('mode' in partial || 'anchor' in partial) {
      this.#applyLayout();
    }
    if ('mode' in partial) {
      this.emit('mode-change', { mode: this.config.mode as EditorMode });
    }
    // `format` changed: the document is unchanged, but its reported serialization
    // is — re-announce so split-view / bound consumers refresh their output.
    if ('format' in partial && this.#engine) {
      this.emit('change', this.#changeDetail());
    }
    // `theme` reflects via the input table; nothing imperative to do here yet.
  }

  /** Activate: ensure the engine exists (a DOM move tore it down in disconnect()). */
  protected override connect(): void {
    if (!this.#engine) this.#buildEngine();
  }

  /** Deactivate: snapshot live content, then tear the engine down. */
  protected override disconnect(): void {
    if (this.#engine) this.#content = this.#engine.serialize(this.#format());
    this.#teardownEngine();
  }

  // ── engine lifecycle ────────────────────────────────────────────────────────

  #rebuildEngine(): void {
    // Preserve nothing here: reinit means the content source itself changed, so
    // #content was just refreshed from config.value by the caller.
    this.#teardownEngine();
    this.#buildEngine();
  }

  #buildEngine(): void {
    const format = this.#format();
    // Seed the split output lens to the I/O format, then lay out the shadow so the
    // persistent mount is attached before the view measures itself.
    this.#layout.setDefaultOutputFormat(format);
    this.#applyLayout();

    const options: EditorEngineOptions = {
      mount: this.#layout.mount,
      editable: this.#resolveEditable(),
    };
    this.#applyContentOption(options, format, this.#content);

    this.#engine = new EditorEngine(options);

    // Bridge engine → outward events, and keep the split output panel live.
    this.#unsubscribe = this.#engine.events.on('change', () => {
      this.#layout.refreshOutput();
      this.emit('change', this.#changeDetail());
    });
    this.#layout.refreshOutput(); // initial fill (engine now exists)

    initLogger.debug(`<km-editor> engine built (format=${format}, editable=${options.editable}) v${
      typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'
    }`);

    // First build of this element's lifetime: announce readiness once.
    if (!this.#readyFired) {
      this.#readyFired = true;
      this.setAttribute('is-ready', '');
      this.emit('ready');
    }
  }

  #teardownEngine(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#engine?.destroy();
    this.#engine = undefined;
  }

  /** (Re)arrange the shadow layout for the current mode + anchor. */
  #applyLayout(): void {
    this.#layout.render(this.config.mode as EditorMode, (this.config.anchor as string | null) ?? null);
  }

  /** Map a content string + format onto the matching engine option. */
  #applyContentOption(options: EditorEngineOptions, format: EditorFormat, content: string | null): void {
    if (content == null || content === '') return; // engine falls back to the default doc
    try {
      if (format === 'json') options.json = JSON.parse(content);
      else if (format === 'html') options.html = content;
      else options.markdown = content;
    } catch (err) {
      contentLogger.warn(`<km-editor> could not parse initial ${format} content; starting empty`, err);
    }
  }

  #resolveEditable(): boolean {
    const readonly = this.config.readonly === true;
    const previewing = this.config.mode === 'preview';
    return !readonly && !previewing;
  }

  #format(): EditorFormat {
    return (this.config.format as EditorFormat) ?? 'markdown';
  }

  #changeDetail(): EditorChangeDetail {
    return { value: this.#engine!.serialize(this.#format()), format: this.#format() };
  }

  // ── public content API (not inputs) ───────────────────────────────────────

  /** Live content serialized in the active `format` (or an explicit one). */
  getValue(format?: EditorFormat): string {
    this.flush();
    return this.#engine ? this.#engine.serialize(format ?? this.#format()) : '';
  }

  /** Alias for {@link getValue} — reads live content, not the assigned `value` input. */
  getContent(format?: EditorFormat): string {
    return this.getValue(format);
  }

  getHTML(): string {
    this.flush();
    return this.#engine?.getHTML() ?? '';
  }

  getMarkdown(): string {
    this.flush();
    return this.#engine?.getMarkdown() ?? '';
  }

  getJSON(): unknown {
    this.flush();
    return this.#engine?.getJSON() ?? null;
  }

  /** Replace the document with `value`, parsed in `format` (defaults to the active one). */
  setValue(value: string, format?: EditorFormat): void {
    this.flush();
    const fmt = format ?? this.#format();
    this.#content = value;
    if (this.#engine) {
      if (fmt === 'json') this.#engine.setJSON(JSON.parse(value));
      else this.#engine.setContent(value, fmt);
    }
  }

  /** The underlying headless engine (null before the first build / after teardown). */
  get engine(): EditorEngine | null {
    this.flush();
    return this.#engine ?? null;
  }

  /** Whether the engine has been built and `ready` has fired. */
  get isReady(): boolean {
    return this.hasAttribute('is-ready');
  }

  focus(): void {
    this.flush();
    this.#engine?.focus();
  }

  destroy(): void {
    this.#teardownEngine();
    this.#layout.destroy();
  }
}

// Importing this module registers the element (back-compat contract). The full
// global-API publish + logger wiring happens in index.ts via registerComponent();
// both defines are idempotent, so importing either path works.
if (typeof customElements !== 'undefined' && !customElements.get('km-editor')) {
  customElements.define('km-editor', KmEditorElement);
}
