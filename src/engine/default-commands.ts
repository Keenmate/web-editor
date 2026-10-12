/**
 * Registers the CORE commands (formatting, block types, lists, code block,
 * history) into a CommandRegistry, built directly from the engine's schema.
 *
 * Feature commands — link, image, table ops — are contributed by their
 * first-party plugins (`src/plugins/*`), not here. Each command carries the
 * metadata the toolbar/menu presenters consume: keybindings, `isActive`, and
 * (for prompt-driven commands) an explicit `isEnabled` so a toolbar refresh never
 * dry-runs them into a `prompt()`.
 */
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import type { Schema } from 'prosemirror-model';
import type { CommandRegistry } from './command-registry';
import { markActive, blockActive, ancestorActive, inCodeBlock } from '../predicates';
import { promptForCodeBlock, changeCodeBlockLanguage } from '../commands';

export function registerCoreCommands(registry: CommandRegistry, schema: Schema): void {
  registry.register({
    id: 'bold',
    run: toggleMark(schema.marks.bold),
    keys: ['Mod-b'],
    isActive: (s) => markActive(s, schema.marks.bold),
  });
  registry.register({
    id: 'italic',
    run: toggleMark(schema.marks.italic),
    keys: ['Mod-i'],
    isActive: (s) => markActive(s, schema.marks.italic),
  });
  registry.register({
    id: 'underline',
    run: toggleMark(schema.marks.underline),
    keys: ['Mod-u'],
    isActive: (s) => markActive(s, schema.marks.underline),
  });
  registry.register({
    id: 'heading',
    run: setBlockType(schema.nodes.heading, { level: 1 }),
    isActive: (s) => blockActive(s, schema.nodes.heading, { level: 1 }),
  });
  registry.register({
    id: 'paragraph',
    run: setBlockType(schema.nodes.paragraph),
    isActive: (s) => blockActive(s, schema.nodes.paragraph),
  });
  registry.register({
    id: 'bullet-list',
    run: wrapInList(schema.nodes.bullet_list),
    isActive: (s) => ancestorActive(s, schema.nodes.bullet_list),
  });
  registry.register({
    id: 'ordered-list',
    run: wrapInList(schema.nodes.ordered_list),
    isActive: (s) => ancestorActive(s, schema.nodes.ordered_list),
  });
  registry.register({
    id: 'insert-code-block',
    run: promptForCodeBlock,
    isEnabled: () => true,
  });
  registry.register({
    id: 'change-code-language',
    run: changeCodeBlockLanguage,
    isEnabled: inCodeBlock,
  });
  registry.register({ id: 'undo', run: undo, keys: ['Mod-z'] });
  registry.register({ id: 'redo', run: redo, keys: ['Mod-y', 'Mod-Shift-z'] });
}
