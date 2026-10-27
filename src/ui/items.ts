/**
 * Toolbar / menu / status item model.
 *
 * Toolbar, selection-toolbar and context-menu entries are core action items
 * (`@keenmate/web-components-core/actions`): `{ action, text, icon, tooltip,
 * shortcut, cssClass, isVisible / isDisabled / isToggled + get*Callback(ctx),
 * onClick(detail) }`, a divider `{ divider: true }`, or a built-in name as a
 * string (`'bold'`). A built-in is a registered command; the command supplies
 * the defaults (text / icon / tooltip / shortcut / toggled / disabled), so an
 * entry only sets what differs.
 *
 * Items cluster into {@link ToolGroup}s — the self-contained unit a zone
 * toolbar lays out (and the future drag-and-drop handle). {@link StatusItem}s
 * are a SEPARATE kind: live state indicators (`Words: 234`) for the dedicated
 * status bar — never action items, never draggable.
 */
import type { MenuDivider } from '@keenmate/web-components-core/actions';
import type { EditorToolbarEntry, StatusContext } from '../interaction';

const divider: MenuDivider = { divider: true };

// ── Core item lists ─────────────────────────────────────────────────────────
// The engine assembles each presenter's list as: core-leading + plugin items +
// core-trailing (see `assembleItems`). These are the core (always-present)
// commands; link / image / table items come from their plugins.

/** Core static-toolbar items (no history — that trails after plugin items). */
export const coreToolbarItems: readonly EditorToolbarEntry[] = [
  'bold',
  'italic',
  'underline',
  divider,
  'heading',
  'paragraph',
  divider,
  'bullet-list',
  'ordered-list',
  divider,
  'insert-code-block',
];

/** Core static-toolbar trailing group (history). */
export const coreHistoryItems: readonly EditorToolbarEntry[] = [divider, 'undo', 'redo'];

/** Core selection-toolbar items (inline formatting + block type). */
export const coreSelectionItems: readonly EditorToolbarEntry[] = [
  'bold',
  'italic',
  'underline',
  divider,
  'heading',
  'paragraph',
];

/** Core context-menu items (leading). */
export const coreMenuItems: readonly EditorToolbarEntry[] = ['bold', 'italic', 'underline'];

/** Core context-menu trailing group (history). */
export const coreMenuHistoryItems: readonly EditorToolbarEntry[] = [divider, 'undo', 'redo'];

// ── Tool groups (the zone-toolbar unit) ──────────────────────────────────────

/**
 * A named cluster of entries — the unit a zone toolbar lays out as one
 * contiguous button group (groups are divider-separated and wrap as a whole),
 * and the unit future drag-and-drop reorders. A layout container, not a
 * submenu. `text` is the group's accessible name (`aria-label`), not rendered.
 */
export interface ToolGroup {
  id: string;
  text?: string;
  items: readonly EditorToolbarEntry[];
}

/** Core tool groups (leading). Plugin groups slot in after these. */
export const coreToolbarGroups: readonly ToolGroup[] = [
  { id: 'format', text: 'Format', items: ['bold', 'italic', 'underline'] },
  { id: 'block', text: 'Block', items: ['heading', 'paragraph'] },
  { id: 'list', text: 'Lists', items: ['bullet-list', 'ordered-list'] },
  { id: 'insert', text: 'Insert', items: ['insert-code-block'] },
];

/** Core tool groups (trailing — history sits after plugin groups). */
export const coreHistoryGroups: readonly ToolGroup[] = [{ id: 'history', text: 'History', items: ['undo', 'redo'] }];

// ── Status items (the dedicated status-bar unit) ─────────────────────────────

/**
 * A live state indicator for the status bar. `render(ctx)` is called with the
 * current editor state (`ctx.state`, + `controller` / `element`) on every
 * change; it returns text or a node. Status items are not action items and are
 * never draggable.
 */
export interface StatusItem {
  id: string;
  render: (ctx: StatusContext) => string | Node;
  /** Which end of the status bar to dock to. Default `'start'`. */
  align?: 'start' | 'end';
  /**
   * Which strip to render in when the status bar is `'both'`. Default `'bottom'`.
   * Ignored for single-edge status bars (`'top'`/`'bottom'`), which show every item.
   */
  bar?: 'top' | 'bottom';
  tooltip?: string;
}

function wordCount({ state }: StatusContext): number {
  const text = state.doc.textBetween(0, state.doc.content.size, ' ', ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Core status items — a word count and a character count (docked end). They're
 * placed on different edges (`bar`), so `statusbar="both"` shows a populated strip
 * on each; single-edge status bars (`top`/`bottom`) show every item regardless.
 */
export const coreStatusItems: readonly StatusItem[] = [
  { id: 'words', align: 'end', bar: 'bottom', render: (ctx) => ctx.label('words', { count: wordCount(ctx) }) },
  { id: 'chars', align: 'end', bar: 'top', render: (ctx) => ctx.label('chars', { count: ctx.state.doc.textContent.length }) },
];

/** The default static toolbar — the full editing command set. */
export const defaultToolbarItems: readonly EditorToolbarEntry[] = [
  'bold',
  'italic',
  'underline',
  divider,
  'heading',
  'paragraph',
  divider,
  'bullet-list',
  'ordered-list',
  divider,
  'insert-link',
  'insert-image',
  'insert-code-block',
  'insert-table',
  divider,
  'undo',
  'redo',
];

/** Compact inline-formatting bar shown over a non-empty text selection. */
export const defaultSelectionItems: readonly EditorToolbarEntry[] = [
  'bold',
  'italic',
  'underline',
  divider,
  'insert-link',
  divider,
  'heading',
  'paragraph',
];

/** Right-click editing menu (labelled, vertical). */
export const defaultContextMenuItems: readonly EditorToolbarEntry[] = [
  'bold',
  'italic',
  'underline',
  divider,
  'insert-link',
  'insert-image',
  'insert-code-block',
  'insert-table',
  divider,
  'undo',
  'redo',
];
