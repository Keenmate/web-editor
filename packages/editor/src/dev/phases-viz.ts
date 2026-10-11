/**
 * PHASES + CONFIG-CELL PROTOTYPE — visual driver (dev-only; examples-phases.html).
 *
 * Exercises `phases-proto.ts` against the four use cases from PIPELINES.md so we
 * can see the assembly actually resolve: the config cell (one crop plugin, two
 * pipelines → two behaviours), phase ordering of independent plugins (compress
 * before base64, watermark after compress — automatic), the owner override + soft
 * anchor, and the throw cases. Nothing here touches the shipped engine.
 */
import {
  assemblePhased,
  runAssembled,
  type AssembledPipeline,
  type OwnerPipelineConfig,
  type PhasedStage,
  type ProtoPlugin,
} from './phases-proto';

// ── tiny DOM helper ─────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

/** A demo stage that just narrates itself (and the config it received). */
function demoStage(id: string, phase: string, opts: Partial<PhasedStage> = {}): PhasedStage {
  return {
    id,
    phase,
    run: (_c, rt) => {
      const cfg = Object.keys(rt.config).length ? ` · cfg=${JSON.stringify(rt.config)}` : '';
      rt.log(`▶ ${id} (${phase})${cfg}`);
      return { action: 'resolve', patch: { [`${id}-done`]: true } };
    },
    ...opts,
  };
}

// ── rendering of an assembled pipeline ──────────────────────────────────────────

function renderAssembly(asm: AssembledPipeline): HTMLElement {
  const wrap = el('div', { class: 'ph-asm' });

  // Order, grouped by phase, in vocabulary order.
  const lane = el('div', { class: 'ph-lane' });
  asm.phases.forEach((phase, i) => {
    const inPhase = asm.stages.filter((s) => asm.phaseOf[s.id] === phase);
    const group = el('div', { class: 'ph-group' }, [el('div', { class: 'ph-phase' }, [phase])]);
    const chips = el('div', { class: 'ph-chips' });
    if (inPhase.length === 0) chips.append(el('span', { class: 'ph-empty' }, ['∅']));
    inPhase.forEach((s) => chips.append(el('span', { class: 'ph-chip' }, [s.id])));
    group.append(chips);
    lane.append(group);
    if (i < asm.phases.length - 1) lane.append(el('span', { class: 'ph-arrow' }, ['›']));
  });
  wrap.append(lane);

  // Resolved config per stage (the ladder, merged).
  const haveCfg = asm.stages.filter((s) => Object.keys(asm.configByStage[s.id] ?? {}).length);
  if (haveCfg.length) {
    const tbl = el('table', { class: 'reference-table ph-cfg' });
    tbl.append(el('tr', {}, [el('th', {}, ['stage']), el('th', {}, ['resolved config (rt.config)'])]));
    for (const s of haveCfg) {
      tbl.append(
        el('tr', {}, [
          el('td', {}, [s.id]),
          el('td', {}, [el('code', {}, [JSON.stringify(asm.configByStage[s.id])])]),
        ])
      );
    }
    wrap.append(tbl);
  }

  // Run button + log — proves rt.config reaches run().
  const log = el('pre', { class: 'log-panel ph-log' });
  const run = el('button', {
    onclick: async () => {
      log.textContent = '';
      await runAssembled(asm, { extra: {} }, (line) => {
        log.textContent += line + '\n';
      });
    },
  }, ['▶ run — narrate order + config']);
  wrap.append(run, log);
  return wrap;
}

/** Render a scenario card; `build` returns either an assembly or a thrown error. */
function card(title: string, desc: string, body: HTMLElement): HTMLElement {
  return el('section', { class: 'example-section' }, [
    el('h2', {}, [title]),
    el('p', { class: 'description', html: desc }),
    body,
  ]);
}

function safeAssembly(plugins: readonly ProtoPlugin[], name: string, owner?: OwnerPipelineConfig): HTMLElement {
  try {
    return renderAssembly(assemblePhased(plugins, name, owner));
  } catch (err) {
    return el('pre', { class: 'ph-err' }, [`THROWS → ${(err as Error).message}`]);
  }
}

// ── shared demo plugins ──────────────────────────────────────────────────────────

const PHASES_FULL = ['acquire', 'geometry', 'optimize', 'annotate', 'encode', 'insert'];

const pick = demoStage('pick', 'acquire');
const insert = demoStage('insert', 'insert');
const toBase64 = demoStage('to-base64', 'encode');
const compress = demoStage('compress', 'optimize');
const watermark = demoStage('watermark', 'annotate');

/** The browser plugin declares the pipeline + the structural pick/insert stages. */
function browserPlugin(name: string, phases: string[]): ProtoPlugin {
  return {
    name: 'image-browser',
    pipelines: [{ name, phases }],
    stages: { [name]: [{ stage: pick }, { stage: insert }] },
  };
}

// ── scenario 1 — the config cell (one crop plugin, two pipelines) ────────────────

function scenarioConfigCell(): HTMLElement {
  const crop = demoStage('crop', 'geometry', { defaultConfig: { aspect: 'free' } });
  const plugins: ProtoPlugin[] = [
    {
      name: 'image-browser',
      pipelines: [
        { name: 'image:portrait:pick', phases: ['acquire', 'geometry', 'encode', 'insert'] },
        { name: 'image:gallery:pick', phases: ['acquire', 'geometry', 'encode', 'insert'] },
      ],
      stages: {
        'image:portrait:pick': [{ stage: pick }, { stage: toBase64 }, { stage: insert }],
        'image:gallery:pick': [{ stage: pick }, { stage: toBase64 }, { stage: insert }],
      },
    },
    { name: 'image-crop', dependencies: ['image-browser'], stages: { 'image:portrait:pick': [{ stage: crop }], 'image:gallery:pick': [{ stage: crop }] } },
  ];

  const grid = el('div', { class: 'grid-2' });
  grid.append(
    el('div', {}, [
      el('h3', {}, ['image:portrait:pick']),
      el('p', { class: 'ph-sub' }, ['config: { crop: { aspect: "3:4" } }']),
      safeAssembly(plugins, 'image:portrait:pick', { config: { crop: { aspect: '3:4', defaultAspect: '3:4' } } }),
    ]),
    el('div', {}, [
      el('h3', {}, ['image:gallery:pick']),
      el('p', { class: 'ph-sub' }, ['config: { crop: { aspect: "1:1", min: [256,256] } }']),
      safeAssembly(plugins, 'image:gallery:pick', { config: { crop: { aspect: '1:1', min: [256, 256] } } }),
    ])
  );
  return card(
    '1 · The config cell — one crop plugin, two behaviours',
    'The <b>same</b> <code>cropPlugin</code> in two pipelines. Config is a property of the <b>(stage × pipeline)</b> cell, not the plugin — run each side and watch <code>crop</code> report a different <code>aspect</code> from <code>rt.config</code>.',
    grid
  );
}

// ── scenario 2 — phase ordering of independent plugins ──────────────────────────

function scenarioPhaseOrder(): HTMLElement {
  const crop = demoStage('crop', 'geometry');
  const body = el('div', {});
  const out = el('div', {});
  let withWatermark = true;
  let withBase64 = true;

  const rerender = () => {
    const plugins: ProtoPlugin[] = [
      browserPlugin('image:browser:pick', PHASES_FULL),
      { name: 'image-crop', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: crop }] } },
      { name: 'image-compress', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: compress }] } },
    ];
    if (withWatermark)
      plugins.push({ name: 'image-watermark', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: watermark }] } });
    if (withBase64)
      plugins.push({ name: 'image-base64', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: toBase64 }] } });
    out.replaceChildren(safeAssembly(plugins, 'image:browser:pick'));
  };

  const toggle = (label: string, initial: boolean, set: (v: boolean) => void) => {
    const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = initial;
    cb.addEventListener('change', () => {
      set(cb.checked);
      rerender();
    });
    return el('label', { class: 'ph-toggle' }, [cb, ` ${label}`]);
  };

  body.append(
    el('div', { class: 'controls' }, [
      toggle('watermark plugin (annotate)', withWatermark, (v) => (withWatermark = v)),
      toggle('base64 plugin (encode)', withBase64, (v) => (withBase64 = v)),
    ]),
    out
  );
  rerender();

  return card(
    '2 · Phase ordering — independent plugins, zero cross-imports',
    'Five plugins, none importing another, each declaring a <code>phase</code>. Because <code>optimize</code> precedes <code>annotate</code> precedes <code>encode</code>, <b>compress runs before base64</b> and <b>watermark lands on the compressed image</b> — automatically. Toggle plugins in/out; the order recomputes, the others never change.',
    body
  );
}

// ── scenario 3 — owner override + soft anchor ────────────────────────────────────

function scenarioOverride(): HTMLElement {
  const orient = demoStage('orient', 'geometry');
  const crop = demoStage('crop', 'geometry');
  // resize declares a SOFT anchor: after crop if crop is present.
  const resize = demoStage('resize', 'geometry', { afterIfPresent: 'crop' });

  const plugins: ProtoPlugin[] = [
    browserPlugin('image:browser:pick', PHASES_FULL),
    // Declared order here is intentionally "wrong" (resize, orient, crop) to show
    // the soft anchor + owner override correcting it.
    { name: 'image-geo', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: resize }, { stage: orient }, { stage: crop }] } },
  ];

  const grid = el('div', { class: 'grid-2' });
  grid.append(
    el('div', {}, [
      el('h3', {}, ['default (declared order + soft anchor)']),
      el('p', { class: 'ph-sub' }, ['declared: resize, orient, crop · resize.afterIfPresent = "crop"']),
      safeAssembly(plugins, 'image:browser:pick'),
    ]),
    el('div', {}, [
      el('h3', {}, ['owner pins geometry order']),
      el('p', { class: 'ph-sub' }, ['order: { geometry: ["orient","crop","resize"] }']),
      safeAssembly(plugins, 'image:browser:pick', { order: { geometry: ['orient', 'crop', 'resize'] } }),
    ])
  );
  return card(
    '3 · Propose / dispose — soft anchor &amp; owner override',
    'Plugins propose; the owner disposes. Left: the <code>resize.afterIfPresent="crop"</code> soft anchor keeps resize after crop even though it was declared first. Right: the owner <code>order</code> pins the exact geometry sequence — surgically, without touching any plugin.',
    grid
  );
}

// ── scenario 4 — the throw cases ─────────────────────────────────────────────────

function scenarioErrors(): HTMLElement {
  const crop = demoStage('crop', 'geometry');
  const base = (extra: ProtoPlugin[] = []): ProtoPlugin[] => [
    browserPlugin('image:browser:pick', PHASES_FULL),
    { name: 'image-crop', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: crop }] } },
    ...extra,
  ];

  const cases: Array<[string, () => void]> = [
    [
      'unknown phase (stage declares phase "bogus")',
      () => {
        const bad = demoStage('sharpen', 'bogus');
        assemblePhased(base([{ name: 'p', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: bad }] } }]), 'image:browser:pick');
      },
    ],
    [
      'owner.order lists a stage in the wrong phase (needs assign)',
      () => assemblePhased(base(), 'image:browser:pick', { order: { optimize: ['crop'] } }),
    ],
    [
      'owner.order names a stage that does not exist',
      () => assemblePhased(base(), 'image:browser:pick', { order: { geometry: ['nope'] } }),
    ],
    [
      'ordering cycle (a after b, b after a)',
      () => {
        const a = demoStage('a', 'geometry', { afterIfPresent: 'b' });
        const b = demoStage('b', 'geometry', { afterIfPresent: 'a' });
        assemblePhased(base([{ name: 'p', dependencies: ['image-browser'], stages: { 'image:browser:pick': [{ stage: a }, { stage: b }] } }]), 'image:browser:pick');
      },
    ],
  ];

  const list = el('div', {});
  for (const [label, fn] of cases) {
    let msg = '(did NOT throw — bug!)';
    try {
      fn();
    } catch (err) {
      msg = (err as Error).message;
    }
    list.append(el('div', { class: 'ph-errrow' }, [el('b', {}, [label]), el('pre', { class: 'ph-err' }, [`THROWS → ${msg}`])]));
  }
  return card(
    '4 · Load-bearing strictness — what throws at assembly',
    'A broken hook must fail loudly, like the serializer contract. Unknown phase, an <code>order</code> naming the wrong phase or a missing stage, and ordering cycles all throw during assembly — never silently misbehave.',
    list
  );
}

// ── boot ─────────────────────────────────────────────────────────────────────────

const root = document.getElementById('ph-root');
if (root) {
  root.append(scenarioConfigCell(), scenarioPhaseOrder(), scenarioOverride(), scenarioErrors());
}
