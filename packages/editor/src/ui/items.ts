/**
 * Toolbar / menu item model (Phase 4).
 *
 * ONE command-driven item list is consumed by all three presenters — the static
 * toolbar, the selection floating toolbar, and the context menu. An item either
 * references a command id (whose `isActive` / `isEnabled` the presenter reflects)
 * or is a separator. Display metadata (icon / label / title) lives on the item,
 * not the command, so the same command reads as a compact icon in a toolbar and
 * as a full label in a menu.
 */

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
