/**
 * Toolbar / menu / status item model.
 *
 * A command-driven item references a command id (whose `isActive` / `isEnabled` a
 * presenter reflects) or is a separator. Items cluster into {@link ToolGroup}s —
 * the self-contained unit a zone toolbar lays out (and the future drag-and-drop
 * handle). {@link StatusItem}s are a SEPARATE kind: live state indicators
 * (`Words: 234`) for the dedicated status bar — never command buttons, never
 * draggable.
 */
import type { EditorState } from 'prosemirror-state';

export interface CommandItem {
  type: 'command';
  /** Command id registered in the engine's CommandRegistry. */
  command: string;
  /** Full accessible name; also the menu label. */
  label: string;
  /** Compact glyph for a toolbar button; falls back to `label`. */
  icon?: string;
  /** Tooltip; falls back to `label`. */
  title?: string;
}

export interface SeparatorItem {
  type: 'separator';
}

export type ToolbarItem = CommandItem | SeparatorItem;

const sep: SeparatorItem = { type: 'separator' };

// ── Core item groups (Phase 5) ──────────────────────────────────────────────
// The engine assembles each presenter's list as: core-leading + plugin items +
// core-trailing (see `assembleItems`). These are the core (always-present)
// commands; link / image / table items come from their plugins.

/** Core static-toolbar items (no history — that trails after plugin items). */
export const coreToolbarItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold', icon: 'B', title: 'Bold (Ctrl+B)' },
  { type: 'command', command: 'italic', label: 'Italic', icon: 'I', title: 'Italic (Ctrl+I)' },
  { type: 'command', command: 'underline', label: 'Underline', icon: 'U', title: 'Underline (Ctrl+U)' },
  sep,
  { type: 'command', command: 'heading', label: 'Heading', icon: 'H1', title: 'Heading 1' },
  { type: 'command', command: 'paragraph', label: 'Paragraph', icon: 'P', title: 'Paragraph' },
  sep,
  { type: 'command', command: 'bullet-list', label: 'Bullet list', icon: '• List', title: 'Bullet list' },
  { type: 'command', command: 'ordered-list', label: 'Ordered list', icon: '1. List', title: 'Ordered list' },
  sep,
  { type: 'command', command: 'insert-code-block', label: 'Code block', icon: '</>', title: 'Insert code block' },
];

/** Core static-toolbar trailing group (history). */
export const coreHistoryItems: readonly ToolbarItem[] = [
  sep,
  { type: 'command', command: 'undo', label: 'Undo', icon: '↶', title: 'Undo (Ctrl+Z)' },
  { type: 'command', command: 'redo', label: 'Redo', icon: '↷', title: 'Redo (Ctrl+Y)' },
];

/** Core selection-toolbar items (inline formatting + block type). */
export const coreSelectionItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold', icon: 'B', title: 'Bold' },
  { type: 'command', command: 'italic', label: 'Italic', icon: 'I', title: 'Italic' },
  { type: 'command', command: 'underline', label: 'Underline', icon: 'U', title: 'Underline' },
  sep,
  { type: 'command', command: 'heading', label: 'Heading', icon: 'H1', title: 'Heading 1' },
  { type: 'command', command: 'paragraph', label: 'Paragraph', icon: 'P', title: 'Paragraph' },
];

/** Core context-menu items (leading). */
export const coreMenuItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold' },
  { type: 'command', command: 'italic', label: 'Italic' },
  { type: 'command', command: 'underline', label: 'Underline' },
];

/** Core context-menu trailing group (history). */
export const coreMenuHistoryItems: readonly ToolbarItem[] = [
  sep,
  { type: 'command', command: 'undo', label: 'Undo' },
  { type: 'command', command: 'redo', label: 'Redo' },
];

// ── Tool groups (the zone-toolbar unit) ──────────────────────────────────────

/**
 * A named cluster of command items — the unit a zone toolbar lays out as one
 * contiguous button group (groups are divider-separated and wrap as a whole),
 * and the unit future drag-and-drop reorders. `label` is metadata for a
 * customization UI / accessibility, not necessarily rendered.
 */
export interface ToolGroup {
  id: string;
  label?: string;
  items: readonly CommandItem[];
}

const cmd = (command: string, label: string, icon: string, title?: string): CommandItem => ({
  type: 'command',
  command,
  label,
  icon,
  title: title ?? label,
});

/** Core tool groups (leading). Plugin groups slot in after these. */
export const coreToolbarGroups: readonly ToolGroup[] = [
  {
    id: 'format',
    label: 'Format',
    items: [
      cmd('bold', 'Bold', 'B', 'Bold (Ctrl+B)'),
      cmd('italic', 'Italic', 'I', 'Italic (Ctrl+I)'),
      cmd('underline', 'Underline', 'U', 'Underline (Ctrl+U)'),
    ],
  },
  { id: 'block', label: 'Block', items: [cmd('heading', 'Heading', 'H1', 'Heading 1'), cmd('paragraph', 'Paragraph', 'P')] },
  {
    id: 'list',
    label: 'Lists',
    items: [cmd('bullet-list', 'Bullet list', '• List'), cmd('ordered-list', 'Ordered list', '1. List')],
  },
  { id: 'insert', label: 'Insert', items: [cmd('insert-code-block', 'Code block', '</>', 'Insert code block')] },
];

/** Core tool groups (trailing — history sits after plugin groups). */
export const coreHistoryGroups: readonly ToolGroup[] = [
  { id: 'history', label: 'History', items: [cmd('undo', 'Undo', '↶', 'Undo (Ctrl+Z)'), cmd('redo', 'Redo', '↷', 'Redo (Ctrl+Y)')] },
];

// ── Status items (the dedicated status-bar unit) ─────────────────────────────

/**
 * A live state indicator for the status bar. `render` is called with the current
 * editor state on every change; it returns text or a node. Status items are not
 * commands and are never draggable.
 */
export interface StatusItem {
  id: string;
  render: (state: EditorState) => string | Node;
  /** Which end of the status bar to dock to. Default `'start'`. */
  align?: 'start' | 'end';
  /**
   * Which strip to render in when the status bar is `'both'`. Default `'bottom'`.
   * Ignored for single-edge status bars (`'top'`/`'bottom'`), which show every item.
   */
  bar?: 'top' | 'bottom';
  title?: string;
}

function wordCount(state: EditorState): number {
  const text = state.doc.textBetween(0, state.doc.content.size, ' ', ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Core status items — a word count and a character count (docked end). They're
 * placed on different edges (`bar`), so `statusbar="both"` shows a populated strip
 * on each; single-edge status bars (`top`/`bottom`) show every item regardless.
 */
export const coreStatusItems: readonly StatusItem[] = [
  { id: 'words', align: 'end', bar: 'bottom', render: (s) => `Words: ${wordCount(s)}` },
  { id: 'chars', align: 'end', bar: 'top', render: (s) => `Chars: ${s.doc.textContent.length}` },
];

/** The default static toolbar — the full editing command set. */
export const defaultToolbarItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold', icon: 'B', title: 'Bold (Ctrl+B)' },
  { type: 'command', command: 'italic', label: 'Italic', icon: 'I', title: 'Italic (Ctrl+I)' },
  { type: 'command', command: 'underline', label: 'Underline', icon: 'U', title: 'Underline (Ctrl+U)' },
  sep,
  { type: 'command', command: 'heading', label: 'Heading', icon: 'H1', title: 'Heading 1' },
  { type: 'command', command: 'paragraph', label: 'Paragraph', icon: 'P', title: 'Paragraph' },
  sep,
  { type: 'command', command: 'bullet-list', label: 'Bullet list', icon: '• List', title: 'Bullet list' },
  { type: 'command', command: 'ordered-list', label: 'Ordered list', icon: '1. List', title: 'Ordered list' },
  sep,
  { type: 'command', command: 'insert-link', label: 'Link', icon: '🔗', title: 'Insert link (select text first)' },
  { type: 'command', command: 'insert-image', label: 'Image', icon: '🖼', title: 'Insert image' },
  { type: 'command', command: 'insert-code-block', label: 'Code block', icon: '</>', title: 'Insert code block' },
  { type: 'command', command: 'insert-table', label: 'Table', icon: '⊞', title: 'Insert table' },
  sep,
  { type: 'command', command: 'undo', label: 'Undo', icon: '↶', title: 'Undo (Ctrl+Z)' },
  { type: 'command', command: 'redo', label: 'Redo', icon: '↷', title: 'Redo (Ctrl+Y)' },
];

/** Compact inline-formatting bar shown over a non-empty text selection. */
export const defaultSelectionItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold', icon: 'B', title: 'Bold' },
  { type: 'command', command: 'italic', label: 'Italic', icon: 'I', title: 'Italic' },
  { type: 'command', command: 'underline', label: 'Underline', icon: 'U', title: 'Underline' },
  sep,
  { type: 'command', command: 'insert-link', label: 'Link', icon: '🔗', title: 'Insert link' },
  sep,
  { type: 'command', command: 'heading', label: 'Heading', icon: 'H1', title: 'Heading 1' },
  { type: 'command', command: 'paragraph', label: 'Paragraph', icon: 'P', title: 'Paragraph' },
];

/** Right-click editing menu (labelled, vertical). */
export const defaultContextMenuItems: readonly ToolbarItem[] = [
  { type: 'command', command: 'bold', label: 'Bold' },
  { type: 'command', command: 'italic', label: 'Italic' },
  { type: 'command', command: 'underline', label: 'Underline' },
  sep,
  { type: 'command', command: 'insert-link', label: 'Insert link' },
  { type: 'command', command: 'insert-image', label: 'Insert image' },
  { type: 'command', command: 'insert-code-block', label: 'Insert code block' },
  { type: 'command', command: 'insert-table', label: 'Insert table' },
  sep,
  { type: 'command', command: 'undo', label: 'Undo' },
  { type: 'command', command: 'redo', label: 'Redo' },
];
