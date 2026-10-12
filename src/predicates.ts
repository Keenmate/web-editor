/**
 * Selection-state predicates shared by command metadata (`isActive` /
 * `isEnabled`) across the core commands and the first-party plugins.
 */
import type { EditorState } from 'prosemirror-state';
import type { MarkType, NodeType } from 'prosemirror-model';

/** Whether `type` is active on the selection (stored mark when empty). */
export function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** Whether the selection's block is exactly `type` (optionally matching attrs). */
export function blockActive(
  state: EditorState,
  type: NodeType,
  attrs?: Record<string, any>
): boolean {
  const { $from, to } = state.selection;
  const node = $from.node($from.depth);
  if (to > $from.end()) return false;
  if (!node || node.type !== type) return false;
  if (!attrs) return true;
  return Object.keys(attrs).every((k) => node.attrs[k] === attrs[k]);
}

/** Whether any ancestor of the selection is of `type` (list highlight, etc.). */
export function ancestorActive(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === type) return true;
  }
  return false;
}

/** Whether the selection sits inside a code block. */
export function inCodeBlock(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'code_block') return true;
  }
  return false;
}
