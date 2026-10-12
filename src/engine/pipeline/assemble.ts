/**
 * Pipeline assembly (Phase 7; see PIPELINES.md — "commands ARE pipelines").
 *
 * Builds the engine's pipeline map from the plugin set + the assembled command
 * specs. Three layers, mirroring the chrome's `layerById`:
 *
 *   1. Every `CommandSpec` auto-wraps into a one-stage `sync` pipeline named by
 *      its id — so a toolbar button / keybinding / `engine.run(id)` all fire the
 *      same named pipeline, and anything hookable is hookable the same way.
 *   2. Plugin-declared `pipelines` are added (and override a wrapper of the same
 *      name — last plugin wins, as groups do).
 *   3. Plugin `stages` contributions are folded in by anchor (before / after /
 *      replace-in-place / remove), in plugin order.
 *
 * A contribution to an unknown pipeline, or an anchor naming a missing stage,
 * throws here — the same load-bearing strictness as the Markdown serializer
 * contract (a silent no-op would hide a broken hook).
 */
import type { CommandSpec } from '../command-registry';
import type { EditorPlugin } from '../plugin';
import type { Pipeline, PipelineStage, StageContribution } from './types';

/** Wrap a command as a trivial single-stage sync pipeline. The stage runs the PM
 * command via the engine-provided `runCommand`; a `false` return (command not
 * applicable) halts, so a keymap binding falls through correctly. */
export function wrapCommandAsPipeline(spec: CommandSpec): Pipeline {
  return {
    name: spec.id,
    timing: 'sync',
    stages: [
      {
        id: spec.id,
        run: (_ctx, rt) =>
          rt.runCommand?.(spec.run) ? { action: 'resolve' } : { action: 'halt', reason: 'not applicable' },
      },
    ],
  };
}

/** Clone a declared pipeline so folding contributions never mutates the plugin's
 * singleton object (plugins are module-level and reused across engine rebuilds). */
function clonePipeline(p: Pipeline): Pipeline {
  return { ...p, stages: [...p.stages] };
}

function applyContributions(
  pipe: Pipeline,
  contribs: readonly StageContribution[],
  pluginName: string
): void {
  for (const c of contribs) {
    if ('remove' in c) {
      const idx = pipe.stages.findIndex((s) => s.id === c.remove);
      if (idx === -1) {
        throw new Error(
          `Plugin "${pluginName}": cannot remove stage "${c.remove}" — not found in pipeline "${pipe.name}".`
        );
      }
      pipe.stages.splice(idx, 1);
      continue;
    }

    const stage = c.stage as PipelineStage;
    if ('before' in c || 'after' in c) {
      const anchor = 'before' in c ? c.before : c.after;
      const idx = pipe.stages.findIndex((s) => s.id === anchor);
      if (idx === -1) {
        throw new Error(
          `Plugin "${pluginName}": anchor stage "${anchor}" not found in pipeline "${pipe.name}".`
        );
      }
      pipe.stages.splice('before' in c ? idx : idx + 1, 0, stage);
    } else {
      // Bare stage: replace-in-place if the id exists, else append (last wins).
      const idx = pipe.stages.findIndex((s) => s.id === stage.id);
      if (idx === -1) pipe.stages.push(stage);
      else pipe.stages[idx] = stage;
    }
  }
}

/**
 * Assemble the named pipeline map for an ordered plugin set and the engine's
 * assembled command specs.
 */
export function assemblePipelines(
  plugins: readonly EditorPlugin[],
  commands: readonly CommandSpec[]
): Map<string, Pipeline> {
  const map = new Map<string, Pipeline>();

  // 1. command wrappers
  for (const spec of commands) map.set(spec.id, wrapCommandAsPipeline(spec));

  // 2. declared pipelines (plugin order; a matching name overrides a wrapper)
  for (const plugin of plugins) {
    for (const p of plugin.pipelines ?? []) map.set(p.name, clonePipeline(p));
  }

  // 3. anchored stage contributions (plugin order)
  for (const plugin of plugins) {
    for (const [name, contribs] of Object.entries(plugin.stages ?? {})) {
      const pipe = map.get(name);
      if (!pipe) {
        throw new Error(
          `Plugin "${plugin.name}" contributes stages to unknown pipeline "${name}".`
        );
      }
      applyContributions(pipe, contribs, plugin.name);
    }
  }

  return map;
}
