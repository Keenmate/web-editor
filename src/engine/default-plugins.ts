/**
 * The default first-party plugin set — reproduces the full built-in editor
 * (links, images, tables, code highlighting) on top of the core schema. The
 * engine uses this when no `editorPlugins` option is given; a consumer can pass
 * their own set (these plus custom plugins, or a trimmed subset) instead.
 *
 * Order matters: it drives schema/command/plugin assembly order and the toolbar
 * item order (link → image → table).
 */
import type { EditorPlugin } from './plugin';
import { linkPlugin } from '../plugins/link';
import { imagePlugin } from '../plugins/image';
import { tablePlugin } from '../plugins/tables';
import { codeHighlightPlugin } from '../plugins/code-highlight';

export function defaultPlugins(): EditorPlugin[] {
  return [linkPlugin, imagePlugin, tablePlugin, codeHighlightPlugin];
}
