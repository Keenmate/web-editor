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
import { isBuiltInLabel, labelKey, type LabelResolver } from '../labels';
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
  /**
   * The element the surfaces belong to (`<km-editor>`; absent for a bare engine) — the `host` of every item
   * icon's core `renderIcon`, so the element's own `renderIconCallback` is asked (SPEC §12.33).
   */
  readonly element?: HTMLElement | null;
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
  /** The hosting element (`<km-editor>`): item icons render with it as core `renderIcon`'s `host`. */
  element?: HTMLElement | null;
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
    element: opts.element ?? null,
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
 * (`<name>` = camel-cased command id; the text key by `surface`: `menuItems.<name>` in a menu, in a toolbar
 * `ariaLabels.<name>` for an icon button / `buttons.<name>` for a text one; `tooltips.<name>`; the spec's
 * text / tooltip is the English default) — `isDisabled` from its predicates and
 * — only for a toggle command (one with `getIsToggledCallback`) — `isToggled`. An unknown command (its plugin isn't loaded) is disabled. A
 * custom item has no defaults.
 */
export function commandDefaults(
  registry: CommandRegistry,
  item: EditorActionItem,
  label: LabelResolver,
  surface: 'toolbar' | 'menu'
): Partial<ResolvedActionItem<EditorAction>> | undefined {
  const name = item.action;
  if (!name || name === 'custom') return undefined;
  const spec = registry.get(name);
  const key = labelKey(name);
  // Where the text is shown picks its element type: a menu entry, an icon button's accessible name, or a
  // text button's caption.
  const icon = item.icon !== undefined ? item.icon : spec?.icon;
  const textKey = surface === 'menu' ? `menuItems.${key}` : icon ? `ariaLabels.${key}` : `buttons.${key}`;
  if (!spec) return { text: label(textKey, undefined, name), isDisabled: true };
  const shortcut = registry.shortcut(name);
  const tooltipKey = `tooltips.${key}`;
  // The text twins with the tooltip (same `<name>`): an unset `ariaLabels.x` takes a customized `tooltips.x` —
  // the customized tooltip (`''` = none) is the text's fallback, ahead of the command's English text. A built-in
  // tooltip key already twins through core `/locale`. The tooltip resolves on its own — without one, it is the
  // text (already translated) + the shortcut.
  const customTooltip = isBuiltInLabel(tooltipKey) ? '' : label(tooltipKey, undefined, '');
  const text = label(textKey, undefined, customTooltip || spec.text || name);
  const shown = item.text ?? text;
  const tooltip = label(tooltipKey, undefined, spec.tooltip ?? '');
  return {
    text,
    icon: spec.icon,
    shortcut,
    tooltip: tooltip || (shortcut ? `${shown} (${shortcut})` : shown),
    isDisabled: !registry.isEnabled(name),
    ...(spec.getIsToggledCallback ? { isToggled: registry.isToggled(name) } : {}),
  };
}
