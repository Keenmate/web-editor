/**
 * The action layer shared by every editor surface (zone toolbar, selection
 * toolbar, context menu): built-in defaults from the command registry, and
 * activation through core `runAction` (`beforeActionCallback` → item `onClick`
 * → the built-in command → `action` event).
 *
 * Keyboard shortcuts are NOT routed through here: they are ProseMirror keymaps
 * bound to the command pipelines (see `EditorEngine`), so a keypress runs the
 * command directly — no `action` event, no `beforeActionCallback`.
 */
import {
  readActionDataset,
  runAction,
  type ResolvedActionItem,
} from '@keenmate/web-components-core/actions';
import type { CommandRegistry } from '../engine/command-registry';
import { labelKey, type LabelResolver } from '../labels';
import type { EditorEngine } from '../engine/editor-engine';
import type {
  EditorAction,
  EditorActionContext,
  EditorActionEventDetail,
  EditorActionItem,
  EditorActionSource,
} from '../interaction';

/** What a presenter needs to resolve and activate its items. */
export interface ActionSurfaceHost {
  readonly registry: CommandRegistry;
  /** The engine's label resolver (the element's `labels` → English). */
  readonly label: LabelResolver;
  /** The surface ctx (current state + component context) for render-time callbacks. */
  context(): EditorActionContext;
  /** Activate an item (core `runAction`). Resolves `false` when vetoed or busy. */
  activate(
    item: EditorActionItem,
    source: EditorActionSource,
    event: Event | undefined,
    trigger: HTMLElement | undefined
  ): Promise<boolean>;
}

export interface ActionHostOptions {
  engine: EditorEngine;
  /** The element's `beforeActionCallback` (read per activation). */
  getBeforeActionCallback?: () => ((detail: EditorActionEventDetail) => unknown) | null | undefined;
  /** Fire the `action` event + `onAction` twin (the element's `emit`). */
  emitAction?: (detail: EditorActionEventDetail) => void;
}

/** Bind the action layer to an engine (and, inside `<km-editor>`, to the element's hook + event). */
export function createActionHost(opts: ActionHostOptions): ActionSurfaceHost {
  const { engine } = opts;
  return {
    registry: engine.commands,
    label: engine.label,
    context: () => engine.createContext({ state: engine.view.state }),
    activate(item, source, event, trigger) {
      const detail = engine.createContext({
        state: engine.view.state,
        action: item.action ?? 'custom',
        ...(item.id !== undefined ? { id: item.id } : {}),
        item,
        source,
        sourceEvent: event,
        triggerElement: trigger,
        dataset: readActionDataset(trigger),
      }) as EditorActionEventDetail;
      return runAction<EditorActionContext, EditorAction>({
        detail,
        beforeActionCallback: opts.getBeforeActionCallback?.(),
        emitAction: (d) => opts.emitAction?.(d),
        runBuiltIn: (d) => {
          if (d.action !== 'custom') engine.commands.run(d.action);
        },
      });
    },
  };
}

/**
 * The built-in defaults of an item naming a registered command: text / icon /
 * tooltip / shortcut from the `CommandSpec` — text and tooltip through `labels`
 * (key = camel-cased command id, `<key>Tooltip`; the spec's text is the English default) — `isDisabled` from its predicates and
 * — only for a toggle command (one with `getIsToggledCallback`) — `isToggled`. An unknown command (its plugin isn't loaded) is disabled. A
 * custom item has no defaults.
 */
export function commandDefaults(
  registry: CommandRegistry,
  item: EditorActionItem,
  label: LabelResolver
): Partial<ResolvedActionItem<EditorAction>> | undefined {
  const name = item.action;
  if (!name || name === 'custom') return undefined;
  const spec = registry.get(name);
  const key = labelKey(name);
  if (!spec) return { text: label(key, undefined, name), isDisabled: true };
  const shortcut = registry.shortcut(name);
  const text = label(key, undefined, spec.text ?? name);
  const shown = item.text ?? text;
  const tooltip = label(`${key}Tooltip`, undefined, spec.tooltip ?? '');
  return {
    text,
    icon: spec.icon,
    shortcut,
    tooltip: tooltip || (shortcut ? `${shown} (${shortcut})` : shown),
    isDisabled: !registry.isEnabled(name),
    ...(spec.getIsToggledCallback ? { isToggled: registry.isToggled(name) } : {}),
  };
}
