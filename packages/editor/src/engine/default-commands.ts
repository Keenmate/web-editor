/**
 * Registers the built-in commands into a CommandRegistry.
 *
 * The `run` implementations are reused from `../commands` (the ported POC
 * command map); here we attach the metadata — keybindings and `isActive`
 * predicates — that the toolbar/menu presenters (Phase 4) will consume.
 */
import type { EditorState } from 'prosemirror-state';
import type { Schema, MarkType, NodeType } from 'prosemirror-model';
import { commands as commandMap } from '../commands';
import type { CommandRegistry } from './command-registry';

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

function blockActive(state: EditorState, type: NodeType, attrs?: Record<string, any>): boolean {
  const { $from, to } = state.selection;
  const node = $from.node($from.depth);
  if (to > $from.end()) return false;
  if (!node || node.type !== type) return false;
  if (!attrs) return true;
  return Object.keys(attrs).every((k) => node.attrs[k] === attrs[k]);
}

export function registerDefaultCommands(registry: CommandRegistry, schema: Schema): void {
  // First pass: register every ported command with no metadata so all toolbar
  // ids (including the table ops) resolve.
  for (const [id, run] of Object.entries(commandMap)) {
    registry.register({ id, run });
  }

  // Second pass: enrich the common ones with keybindings + active state.
  registry.register({
    id: 'bold',
    run: commandMap.bold,
    keys: ['Mod-b'],
    isActive: (s) => markActive(s, schema.marks.bold),
  });
  registry.register({
    id: 'italic',
    run: commandMap.italic,
    keys: ['Mod-i'],
    isActive: (s) => markActive(s, schema.marks.italic),
  });
  registry.register({
    id: 'underline',
    run: commandMap.underline,
    keys: ['Mod-u'],
    isActive: (s) => markActive(s, schema.marks.underline),
  });
  registry.register({
    id: 'insert-link',
    run: commandMap['insert-link'],
    keys: ['Mod-k'],
    isActive: (s) => markActive(s, schema.marks.link),
  });
  registry.register({
    id: 'heading',
    run: commandMap.heading,
    isActive: (s) => blockActive(s, schema.nodes.heading, { level: 1 }),
  });
  registry.register({
    id: 'paragraph',
    run: commandMap.paragraph,
    isActive: (s) => blockActive(s, schema.nodes.paragraph),
  });
  registry.register({ id: 'undo', run: commandMap.undo, keys: ['Mod-z'] });
  registry.register({ id: 'redo', run: commandMap.redo, keys: ['Mod-y', 'Mod-Shift-z'] });
}
