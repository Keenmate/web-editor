/**
 * Markdown I/O assembly — folds the core Markdown maps together with each
 * plugin's {@link MarkdownContribution} into one serializer + parser, and
 * ENFORCES the Phase 5 serializer contract: every schema node (except `doc`) and
 * every mark must have a Markdown serializer. A plugin that adds a node/mark
 * without declaring its Markdown form fails loudly here, at engine assembly —
 * rather than silently dropping content on export the way tui.editor's outputs
 * drifted.
 */
import type { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import type { Schema } from 'prosemirror-model';
import {
  coreMarkdownNodes,
  coreMarkdownMarks,
  coreMarkdownParse,
  buildMarkdownSerializer,
  buildMarkdownParser,
} from './serialization/markdown';
import type { EditorPlugin } from './plugin';

export interface MergedMarkdown {
  nodes: Record<string, (state: any, node: any, parent: any, index: number) => void>;
  marks: Record<string, any>;
  parse: Record<string, any>;
  enableRules: string[];
}

/** Merge the core Markdown maps with every plugin's contribution (plugins win on conflict). */
export function mergeMarkdown(plugins: readonly EditorPlugin[]): MergedMarkdown {
  const merged: MergedMarkdown = {
    nodes: { ...coreMarkdownNodes },
    marks: { ...coreMarkdownMarks },
    parse: { ...coreMarkdownParse },
    enableRules: [],
  };
  for (const plugin of plugins) {
    const md = plugin.markdown;
    if (!md) continue;
    Object.assign(merged.nodes, md.nodes);
    Object.assign(merged.marks, md.marks);
    Object.assign(merged.parse, md.parse);
    if (md.enableRules) merged.enableRules.push(...md.enableRules);
  }
  return merged;
}

export interface MarkdownIO {
  serializer: MarkdownSerializer;
  parser: MarkdownParser;
}

/**
 * Build the Markdown serializer + parser for `schema` from `plugins`, after
 * checking the serializer contract. Throws with an actionable message if a
 * node/mark in the schema has no Markdown serializer.
 */
export function buildMarkdownIO(schema: Schema, plugins: readonly EditorPlugin[]): MarkdownIO {
  const merged = mergeMarkdown(plugins);

  for (const name of Object.keys(schema.nodes)) {
    if (name === 'doc') continue;
    if (!merged.nodes[name]) {
      throw new Error(
        `Serializer contract: node "${name}" has no Markdown serializer. ` +
          `The plugin that adds it must declare markdown.nodes["${name}"].`
      );
    }
  }
  for (const name of Object.keys(schema.marks)) {
    if (!merged.marks[name]) {
      throw new Error(
        `Serializer contract: mark "${name}" has no Markdown serializer. ` +
          `The plugin that adds it must declare markdown.marks["${name}"].`
      );
    }
  }

  return {
    serializer: buildMarkdownSerializer(merged.nodes, merged.marks),
    parser: buildMarkdownParser(schema, merged.parse, merged.enableRules),
  };
}
