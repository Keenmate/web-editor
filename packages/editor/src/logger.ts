/**
 * Categorized loggers for @keenmate/web-editor — a thin shim over the core
 * logging module (`@keenmate/web-components-core`), mirroring the rest of the
 * KeenMate component line (see web-multiselect's logger.ts).
 *
 * Categories (`EDITOR:*`):
 * - INIT        — element/engine construction and configuration
 * - CONTENT     — content load / serialization / set-value operations
 * - UI          — toolbars, menus, overlay chrome (grows in Phases 3–4)
 *
 * Enable from the console (or `window.components['km-editor'].logging`):
 *
 * ```js
 * import { enableLogging, setLogLevel, setCategoryLevel } from '@keenmate/web-editor';
 * enableLogging();                     // all categories → debug
 * setLogLevel('info');                 // all categories → info
 * setCategoryLevel('CONTENT', 'debug');
 * ```
 */
import { createLoggers, type Logger, type LogLevelDesc } from '@keenmate/web-components-core';

const CATEGORIES = ['INIT', 'CONTENT', 'UI'] as const;
type Category = (typeof CATEGORIES)[number];

/** The single core logger bundle for this component (consumed by registerComponent). */
export const logging = createLoggers('EDITOR', CATEGORIES);

export const initLogger: Logger = logging.loggers.INIT;
export const contentLogger: Logger = logging.loggers.CONTENT;
export const uiLogger: Logger = logging.loggers.UI;

/** Full (namespaced) category names, for the global API. */
export const LOGGING_CATEGORIES = CATEGORIES.map((c) => `EDITOR:${c}`);

/** Enable all logging (debug level). */
export function enableLogging(): void {
  logging.enableLogging();
}

/** Disable all logging (silent). */
export function disableLogging(): void {
  logging.disableLogging();
}

/** Set the same level on every category. */
export function setLogLevel(level: LogLevelDesc): void {
  logging.setLogLevel(level);
}

/** Set the level of one category (accepts `EDITOR:UI` or the bare `UI`). */
export function setCategoryLevel(category: string, level: LogLevelDesc): void {
  const bare = (category.includes(':') ? category.split(':').pop()! : category) as Category;
  logging.setCategoryLevel(bare, level);
}
