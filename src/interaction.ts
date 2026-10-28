/**
 * The public interaction model of `<km-editor>` (web-components-core `/actions`,
 * SPEC §12.5 / §12.12). Types + the controller facade builder.
 *
 * Every callback takes ONE `ctx`; every ctx and every event detail carries
 * `controller` (the public {@link EditorController}, also `el.controller`) and
 * `element` (the host) — both non-enumerable, so `JSON.stringify` / logs see
 * only the data. Contexts built by a standalone {@link EditorEngine} (no
 * `<km-editor>` around it) have no `controller` / `element`.
 */
import type { ComponentContext } from '@keenmate/web-components-core';
import type {
  ActionEventDetail,
  ActionItem,
  ActionSource,
  MenuDivider,
} from '@keenmate/web-components-core/actions';
import type { Command, EditorState } from 'prosemirror-state';
import type { SerializationFormat } from './engine/serialization';
import type { LabelResolver } from './labels';
import type { EditorViewMode } from './web-component';

// ============================================================================
// Controller
// ============================================================================

/**
 * The public facade — `el.controller`, and `controller` on every callback ctx
 * and event detail. Delegates to the live element (pending input changes are
 * flushed first), so it survives engine rebuilds. Reads before the first build
 * return empty values.
 */
export interface EditorController {
  /** Live content serialized in the active `contentFormat` (read-only; same as `el.value`). */
  readonly value: string;
  getHTML(): string;
  getMarkdown(): string;
  getJSON(): unknown;
  /** Replace the document with `value`, parsed in `format` (default: the active `contentFormat`). Without a format, just assign `value`. */
  setValue(value: string, format?: SerializationFormat): void;
  focus(): void;
  /**
   * Run a registered command / pipeline by name (`'bold'`, `'insert-table'`,
   * `'image:browser:pick'`), or a ProseMirror `Command` against the live view.
   * Programmatic: no `action` event, no `beforeActionCallback`. Returns whether
   * it applied (a deferred pipeline returns `true` once started).
   */
  runCommand(command: string | Command): boolean;
  /** Whether a registered command's effect is applied at the selection (Bold in bold text). */
  isCommandToggled(name: string): boolean;
  /** Whether a registered command can run now. */
  isCommandEnabled(name: string): boolean;
}

/** The methods the facade is built from (one list for every target). */
const CONTROLLER_METHODS = [
  'getHTML',
  'getMarkdown',
  'getJSON',
  'setValue',
  'focus',
  'runCommand',
  'isCommandToggled',
  'isCommandEnabled',
] as const;

type ControllerTarget = Pick<EditorController, (typeof CONTROLLER_METHODS)[number] | 'value'>;

/** Build the facade from a method-name list; `getTarget()` is resolved per call. */
export function createEditorController(getTarget: () => ControllerTarget): EditorController {
  const controller = {} as Record<string, unknown>;
  for (const name of CONTROLLER_METHODS) {
    controller[name] = (...args: unknown[]) =>
      (getTarget()[name] as (...a: unknown[]) => unknown)(...args);
  }
  Object.defineProperty(controller, 'value', { get: () => getTarget().value, enumerable: true });
  return Object.freeze(controller) as unknown as EditorController;
}

// ============================================================================
// Contexts
// ============================================================================

/** The component context every editor ctx / detail carries. */
export type EditorComponentContext = ComponentContext<EditorController, HTMLElement>;

/** What every engine-built ctx inherits: the component context + `label`. */
export interface EditorLabelContext extends EditorComponentContext {
  /**
   * Resolve a UI string through the element's `labels` (non-enumerable):
   * `ctx.label('words', { count: 3 })`. See `src/labels.ts` for the keys.
   */
  readonly label: LabelResolver;
}

/**
 * The ctx of command predicates (`CommandSpec.getIsToggledCallback` /
 * `getIsEnabledCallback`), status items (`StatusItem.render`) and toolbar /
 * menu item callbacks: the current ProseMirror state.
 */
export interface EditorStateContext extends EditorLabelContext {
  /** The current (read-only) ProseMirror editor state. */
  state: EditorState;
}

/** Surface ctx of the toolbar / selection toolbar / context menu items. */
export type EditorActionContext = EditorStateContext;
/** The ctx of a command's `getIsToggledCallback` / `getIsEnabledCallback`. */
export type CommandContext = EditorStateContext;
/** The ctx of a status item's `render`. */
export type StatusContext = EditorStateContext;

// ============================================================================
// Action items
// ============================================================================

/**
 * A built-in action = a registered command / pipeline name (`'bold'`,
 * `'insert-link'`, `'image:browser:pick'`). Open-ended: plugins register more.
 */
export type EditorAction = string;

/**
 * A toolbar / selection-toolbar / context-menu item — a core `ActionItem`.
 * `action` names a registered command (its text / icon / tooltip / shortcut /
 * toggled / disabled state are the defaults); `action: 'custom'` (or no
 * `action`) + `id` is a consumer item that only fires `onClick` + the `action`
 * event.
 */
export type EditorActionItem = ActionItem<EditorActionContext, EditorAction>;

/**
 * One entry of a toolbar / menu list: an item, a divider
 * (`{ divider: true }` / `menuDivider()`), or a built-in name as shorthand
 * (`'bold'` → `{ action: 'bold' }`). Submenus are not supported.
 */
export type EditorToolbarEntry = EditorActionItem | MenuDivider | EditorAction;

/** Which editor surface an item was activated from. */
export type EditorActionSource = Extract<ActionSource, 'toolbar' | 'context-menu'> | 'selection-toolbar';

/** Detail of the `action` event / `onAction` / item `onClick` / `beforeActionCallback`. */
export type EditorActionEventDetail = ActionEventDetail<EditorActionContext, EditorAction>;

// ============================================================================
// Event details
// ============================================================================

export interface ChangeEventDetail extends EditorComponentContext {
  /** Current content serialized in the active `contentFormat`. */
  value: string;
  /** The active `contentFormat` (`markdown` | `html` | `json`). */
  contentFormat: SerializationFormat;
}

/**
 * `ctx` of `getValueFormatCallback` — format the value written into the hidden
 * form input (e.g. sanitize HTML). Only the SUBMITTED value is affected; `el.value`
 * and the `change` detail stay the document in `contentFormat`.
 */
export interface ValueFormatContext extends EditorComponentContext {
  /** The live content serialized in the active `contentFormat` (same as `el.value`). */
  value: string;
  /** The active `contentFormat` (`markdown` | `html` | `json`). */
  contentFormat: SerializationFormat;
}

/** `ready` carries only the component context. */
export type ReadyEventDetail = EditorComponentContext;

export interface ViewModeChangeEventDetail extends EditorComponentContext {
  viewMode: EditorViewMode;
}

export interface LockChangeEventDetail extends EditorComponentContext {
  /** A gating (locking) pipeline started (`true`) or finished (`false`). */
  isLocked: boolean;
}

/** Event name → detail (the element's typed event map). */
export type EditorEventMap = {
  change: ChangeEventDetail;
  ready: ReadyEventDetail;
  'view-mode-change': ViewModeChangeEventDetail;
  'lock-change': LockChangeEventDetail;
  action: EditorActionEventDetail;
};
