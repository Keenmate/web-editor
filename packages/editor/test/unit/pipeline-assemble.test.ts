/**
 * Pipeline ASSEMBLY tests (Phase 7; PIPELINES.md — "commands ARE pipelines").
 * Covers the three assembly layers (`assemblePipelines`): command auto-wrapping,
 * declared-pipeline override, and anchored stage contribution (before / after /
 * replace / remove, with the missing-anchor + unknown-pipeline throws). Plus the
 * engine-level integration: a command fires through its pipeline, a plugin hooks
 * a stage into another's pipeline, and a deferred locking pipeline writes to the
 * doc then unlocks.
 */
import { describe, it, expect, vi } from 'vitest';
import { assemblePipelines, wrapCommandAsPipeline } from '../../src/engine/pipeline/assemble';
import { runStagesSync } from '../../src/engine/pipeline/runner';
import type { CommandSpec } from '../../src/engine/command-registry';
import { definePlugin, type EditorPlugin } from '../../src/engine/plugin';
import { defaultPlugins } from '../../src/engine/default-plugins';
import { imageBrowserPlugin } from '../../src/plugins/image-browser';
import { EditorEngine } from '../../src/engine/editor-engine';
import type { InteractionHost, Pipeline } from '../../src/engine/pipeline/types';

const ctx = (extra: Record<string, unknown> = {}) => ({ doc: null, extra });
const skip = () => ({ action: 'skip' as const });
const stage = (id: string, extra: Record<string, unknown> = {}) => ({ id, run: skip, ...extra });
const specs: CommandSpec[] = [
  { id: 'bold', run: () => true },
  { id: 'italic', run: () => true },
];

describe('wrapCommandAsPipeline', () => {
  it('wraps a command into a one-stage sync pipeline that runs it via runCommand', () => {
    const run = vi.fn(() => true);
    const p = wrapCommandAsPipeline({ id: 'bold', run });
    expect(p.name).toBe('bold');
    expect(p.timing).toBe('sync');
    expect(p.stages).toHaveLength(1);
    const res = runStagesSync(p, ctx(), undefined, { runCommand: (cmd) => cmd(null, null, null) });
    expect(run).toHaveBeenCalled();
    expect(res.halted).toBe(false);
  });

  it('halts when the command is not applicable (keymap fall-through)', () => {
    const res = runStagesSync(wrapCommandAsPipeline({ id: 'x', run: () => false }), ctx(), undefined, {
      runCommand: (cmd) => cmd(null, null, null),
    });
    expect(res.halted).toBe(true);
  });
});

describe('assemblePipelines', () => {
  it('auto-wraps every command into a sync pipeline', () => {
    const map = assemblePipelines([], specs);
    expect(map.has('bold')).toBe(true);
    expect(map.get('bold')!.timing).toBe('sync');
  });

  it('a declared pipeline overrides a command wrapper of the same name', () => {
    const custom: Pipeline = { name: 'bold', timing: 'deferred', stages: [stage('z')] };
    const map = assemblePipelines([{ name: 'p', pipelines: [custom] }], specs);
    expect(map.get('bold')!.timing).toBe('deferred');
  });

  it('inserts a contributed stage before an anchor', () => {
    const owner: EditorPlugin = { name: 'owner', pipelines: [{ name: 'flow', timing: 'deferred', stages: [stage('a'), stage('insert')] }] };
    const hook: EditorPlugin = { name: 'hook', stages: { flow: [{ before: 'insert', stage: stage('mid') }] } };
    const map = assemblePipelines([owner, hook], specs);
    expect(map.get('flow')!.stages.map((s) => s.id)).toEqual(['a', 'mid', 'insert']);
  });

  it('inserts after, replaces in place, and removes', () => {
    const owner: EditorPlugin = { name: 'owner', pipelines: [{ name: 'flow', timing: 'deferred', stages: [stage('a'), stage('b')] }] };
    const after: EditorPlugin = { name: 'af', stages: { flow: [{ after: 'a', stage: stage('a2') }] } };
    const replace: EditorPlugin = { name: 'rp', stages: { flow: [{ stage: stage('b', { interactive: true }) }] } };
    const remove: EditorPlugin = { name: 'rm', stages: { flow: [{ remove: 'a' }] } };
    const flow = assemblePipelines([owner, after, replace, remove], specs).get('flow')!;
    expect(flow.stages.map((s) => s.id)).toEqual(['a2', 'b']);
    expect(flow.stages.find((s) => s.id === 'b')!.interactive).toBe(true);
  });

  it('throws on a stage contribution to an unknown pipeline', () => {
    const bad: EditorPlugin = { name: 'bad', stages: { nope: [{ stage: stage('x') }] } };
    expect(() => assemblePipelines([bad], specs)).toThrow(/unknown pipeline/);
  });

  it('throws on a missing before/after anchor', () => {
    const owner: EditorPlugin = { name: 'owner', pipelines: [{ name: 'flow', timing: 'deferred', stages: [stage('a')] }] };
    const bad: EditorPlugin = { name: 'bad', stages: { flow: [{ before: 'ghost', stage: stage('x') }] } };
    expect(() => assemblePipelines([owner, bad], specs)).toThrow(/anchor stage "ghost"/);
  });

  it('throws on removing a missing stage', () => {
    const owner: EditorPlugin = { name: 'owner', pipelines: [{ name: 'flow', timing: 'deferred', stages: [stage('a')] }] };
    const bad: EditorPlugin = { name: 'bad', stages: { flow: [{ remove: 'ghost' }] } };
    expect(() => assemblePipelines([owner, bad], specs)).toThrow(/cannot remove stage "ghost"/);
  });

  it('clones declared pipelines — assembly never mutates the plugin singleton', () => {
    const base: Pipeline = { name: 'flow', timing: 'deferred', stages: [stage('insert')] };
    const owner: EditorPlugin = { name: 'owner', pipelines: [base] };
    const hook: EditorPlugin = { name: 'hook', stages: { flow: [{ before: 'insert', stage: stage('mid') }] } };
    assemblePipelines([owner, hook], specs);
    assemblePipelines([owner, hook], specs);
    expect(base.stages.map((s) => s.id)).toEqual(['insert']); // original untouched
  });
});

describe('EditorEngine pipeline integration', () => {
  const mount = (): HTMLElement => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };

  it('exposes every command as a pipeline and registers plugin pipelines', () => {
    const engine = new EditorEngine({ mount: mount(), markdown: 'hi', editorPlugins: [...defaultPlugins(), imageBrowserPlugin()] });
    expect(engine.pipelines.has('bold')).toBe(true); // command → pipeline
    expect(engine.pipelines.get('bold')!.timing).toBe('sync');
    expect(engine.pipelines.has('image:browser:pick')).toBe(true); // declared pipeline
    expect(engine.commands.has('image:browser:pick')).toBe(true); // surfaced as a command for the chrome
    engine.destroy();
  });

  it('a plugin can hook a stage into a command pipeline (runs on run())', () => {
    const spy = vi.fn();
    const hook = definePlugin({
      name: 'bold-hook',
      stages: { bold: [{ before: 'bold', stage: { id: 'pre', run: () => { spy(); return { action: 'skip' }; } } }] },
    });
    const engine = new EditorEngine({ mount: mount(), markdown: 'hi', editorPlugins: [...defaultPlugins(), hook] });
    engine.run('bold');
    expect(spy).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it('runs a deferred locking pipeline: pick → upload → insert an image, unlocking after', async () => {
    const host: InteractionHost = {
      request: async () => ({ cancelled: false, value: { url: 'data:image/png;base64,AAAA', name: 'x' } }),
    };
    const engine = new EditorEngine({
      mount: mount(),
      markdown: 'hi',
      editorPlugins: [...defaultPlugins(), imageBrowserPlugin({ upload: async (a) => a.url })],
      interactionHost: host,
    });
    const locks: boolean[] = [];
    engine.events.on('lock', (e) => locks.push(e.locked));
    const result = new Promise<void>((res) => {
      engine.pipelines.on('image:browser:pick', (e) => { if (e.type === 'result') res(); });
    });
    engine.run('image:browser:pick');
    await result;
    await new Promise((r) => setTimeout(r, 0)); // let the finally (unlock) settle
    expect(engine.getHTML()).toContain('<img');
    expect(locks).toEqual([true, false]); // locked for the run, unlocked after
    expect(engine.isEditable()).toBe(true);
    engine.destroy();
  });
});
