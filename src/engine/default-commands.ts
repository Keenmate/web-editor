/**
 * Registers the CORE commands (formatting, block types, lists, code block,
 * history) into a CommandRegistry, built directly from the engine's schema.
 *
 * Feature commands — link, image, table ops — are contributed by their
 * first-party plugins (`src/plugins/*`), not here. Each command carries the
 * metadata the toolbar/menu presenters consume: keybindings, display defaults
 * (`text` / `icon` / `tooltip`), `getIsToggledCallback`, and (for prompt-driven
 * commands) an explicit `getIsEnabledCallback` so a toolbar refresh never
 * dry-runs them into a `prompt()`.
 */
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import type { Schema } from 'prosemirror-model';
import type { CommandRegistry } from './command-registry';
import type { LabelResolver } from '../labels';
import type { EditorViewMode } from '../web-component';
import { markActive, blockActive, ancestorActive, inCodeBlock } from '../predicates';
import { promptForCodeBlock, changeCodeBlockLanguage } from '../commands';

/**
 * `text` / `tooltip` are the English defaults; an element's `labels` override them
 * per command (key = camel-cased id, `<key>Tooltip`). `label` resolves the prompts.
 */
export function registerCoreCommands(registry: CommandRegistry, schema: Schema, label?: LabelResolver): void {
  registry.register({
    id: 'bold',
    run: toggleMark(schema.marks.bold),
    keys: ['Mod-b'],
    text: 'Bold',
    icon: 'B',
    getIsToggledCallback: ({ state }) => markActive(state, schema.marks.bold),
  });
  registry.register({
    id: 'italic',
    run: toggleMark(schema.marks.italic),
    keys: ['Mod-i'],
    text: 'Italic',
    icon: 'I',
    getIsToggledCallback: ({ state }) => markActive(state, schema.marks.italic),
  });
  registry.register({
    id: 'underline',
    run: toggleMark(schema.marks.underline),
    keys: ['Mod-u'],
    text: 'Underline',
    icon: 'U',
    getIsToggledCallback: ({ state }) => markActive(state, schema.marks.underline),
  });
  registry.register({
    id: 'heading',
    run: setBlockType(schema.nodes.heading, { level: 1 }),
    text: 'Heading',
    icon: 'H1',
    tooltip: 'Heading 1',
    getIsToggledCallback: ({ state }) => blockActive(state, schema.nodes.heading, { level: 1 }),
  });
  registry.register({
    id: 'paragraph',
    run: setBlockType(schema.nodes.paragraph),
    text: 'Paragraph',
    icon: 'P',
    getIsToggledCallback: ({ state }) => blockActive(state, schema.nodes.paragraph),
  });
  registry.register({
    id: 'bullet-list',
    run: wrapInList(schema.nodes.bullet_list),
    text: 'Bullet list',
    icon: '• List',
    getIsToggledCallback: ({ state }) => ancestorActive(state, schema.nodes.bullet_list),
  });
  registry.register({
    id: 'ordered-list',
    run: wrapInList(schema.nodes.ordered_list),
    text: 'Ordered list',
    icon: '1. List',
    getIsToggledCallback: ({ state }) => ancestorActive(state, schema.nodes.ordered_list),
  });
  registry.register({
    id: 'insert-code-block',
    run: promptForCodeBlock(label),
    text: 'Insert code block',
    icon: '</>',
    getIsEnabledCallback: () => true,
  });
  registry.register({
    id: 'change-code-language',
    run: changeCodeBlockLanguage(label),
    text: 'Change code language',
    getIsEnabledCallback: ({ state }) => inCodeBlock(state),
  });
  registry.register({
    id: 'hard-break',
    // Shift-Enter: a line break inside the current block (ED-8). Inline-content
    // blocks only — in a code block (`code: true`) it returns false, so the key
    // keeps its previous behaviour there.
    run: (state, dispatch) => {
      const br = schema.nodes.hard_break;
      const { $from } = state.selection;
      if (!br || !$from.parent.inlineContent || $from.parent.type.spec.code) return false;
      if (dispatch) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
      return true;
    },
    keys: ['Shift-Enter'],
    text: 'Line break',
  });
  registry.register({ id: 'undo', run: undo, keys: ['Mod-z'], text: 'Undo', icon: '↶' });
  registry.register({ id: 'redo', run: redo, keys: ['Mod-y', 'Mod-Shift-z'], text: 'Redo', icon: '↷' });
}

/** The view-mode port the view-mode commands drive (the hosting `<km-editor>`). */
export interface ViewModePort {
  /** The active view mode. */
  getViewMode(): EditorViewMode;
  /** Switch the view mode on behalf of a command run (the element reports `source: 'user'`, or `'api'` for `controller.runCommand()`). */
  setViewMode(mode: EditorViewMode): void;
}

/** The view-mode commands: id → mode + English text. Labels: `viewEdit` / `viewSplit` / `viewPreview`. */
export const VIEW_MODE_COMMANDS = [
  { id: 'view-edit', mode: 'edit', text: 'Edit' },
  { id: 'view-split', mode: 'split', text: 'Split' },
  { id: 'view-preview', mode: 'preview', text: 'Preview' },
] as const satisfies readonly { id: string; mode: EditorViewMode; text: string }[];

/**
 * Register the view-mode commands (`view-edit` / `view-split` / `view-preview`) — a
 * radio group: each is toggled while its mode is active (`aria-pressed`) and switches
 * to it when run. Only a hosted engine has a view mode, so `<km-editor>` registers them.
 */
export function registerViewModeCommands(registry: CommandRegistry, port: ViewModePort): void {
  for (const { id, mode, text } of VIEW_MODE_COMMANDS) {
    registry.register({
      id,
      run: (_state, dispatch) => {
        if (dispatch) port.setViewMode(mode);
        return true;
      },
      text,
      // Always available — switching the presentation never edits the document
      // (stays usable in `preview` / read-only, where the editing commands are off).
      getIsEnabledCallback: () => true,
      getIsToggledCallback: () => port.getViewMode() === mode,
    });
  }
}
