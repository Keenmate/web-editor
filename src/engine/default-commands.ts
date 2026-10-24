/**
 * Registers the CORE commands (formatting, block types, lists, code block,
 * history) into a CommandRegistry, built directly from the engine's schema.
 *
 * Feature commands — link, image, table ops — are contributed by their
 * first-party plugins (`src/plugins/*`), not here. Each command carries the
 * metadata the toolbar/menu presenters consume: keybindings, display defaults
 * (`text` / `icon` / `tooltip`), `getIsActiveCallback`, and (for prompt-driven
 * commands) an explicit `getIsEnabledCallback` so a toolbar refresh never
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
    text: 'Bold',
    icon: 'B',
    getIsActiveCallback: ({ state }) => markActive(state, schema.marks.bold),
  });
  registry.register({
    id: 'italic',
    run: toggleMark(schema.marks.italic),
    keys: ['Mod-i'],
    text: 'Italic',
    icon: 'I',
    getIsActiveCallback: ({ state }) => markActive(state, schema.marks.italic),
  });
  registry.register({
    id: 'underline',
    run: toggleMark(schema.marks.underline),
    keys: ['Mod-u'],
    text: 'Underline',
    icon: 'U',
    getIsActiveCallback: ({ state }) => markActive(state, schema.marks.underline),
  });
  registry.register({
    id: 'heading',
    run: setBlockType(schema.nodes.heading, { level: 1 }),
    text: 'Heading',
    icon: 'H1',
    tooltip: 'Heading 1',
    getIsActiveCallback: ({ state }) => blockActive(state, schema.nodes.heading, { level: 1 }),
  });
  registry.register({
    id: 'paragraph',
    run: setBlockType(schema.nodes.paragraph),
    text: 'Paragraph',
    icon: 'P',
    getIsActiveCallback: ({ state }) => blockActive(state, schema.nodes.paragraph),
  });
  registry.register({
    id: 'bullet-list',
    run: wrapInList(schema.nodes.bullet_list),
    text: 'Bullet list',
    icon: '• List',
    getIsActiveCallback: ({ state }) => ancestorActive(state, schema.nodes.bullet_list),
  });
  registry.register({
    id: 'ordered-list',
    run: wrapInList(schema.nodes.ordered_list),
    text: 'Ordered list',
    icon: '1. List',
    getIsActiveCallback: ({ state }) => ancestorActive(state, schema.nodes.ordered_list),
  });
  registry.register({
    id: 'insert-code-block',
    run: promptForCodeBlock,
    text: 'Code block',
    icon: '</>',
    tooltip: 'Insert code block',
    getIsEnabledCallback: () => true,
  });
  registry.register({
    id: 'change-code-language',
    run: changeCodeBlockLanguage,
    text: 'Change code language',
    getIsEnabledCallback: ({ state }) => inCodeBlock(state),
  });
  registry.register({ id: 'undo', run: undo, keys: ['Mod-z'], text: 'Undo', icon: '↶' });
  registry.register({ id: 'redo', run: redo, keys: ['Mod-y', 'Mod-Shift-z'], text: 'Redo', icon: '↷' });
}
