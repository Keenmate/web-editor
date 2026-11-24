/**
 * Minimal typed event bus. Modules communicate through the engine's emitter
 * rather than calling each other directly.
 *
 * Delivery is core `notifyListeners`: a throwing handler is logged (the hosting
 * element's `UI` logger; core's `ELEMENT` logger without one) and skipped, so one
 * bad subscriber can't keep the others from hearing the event; a handler may
 * unsubscribe itself (or another) while being notified.
 */
import { notifyListeners } from '@keenmate/web-components-core';

export type Handler<T> = (payload: T) => void;

export class EventEmitter<Events extends Record<string, any>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  /**
   * @param getLogSource The element a handler's throw is logged against (its instance logger), read per
   * dispatch; absent / `null` → core's own logger.
   */
  constructor(private readonly getLogSource?: () => unknown) {}

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  dispatch<K extends keyof Events>(event: K, payload: Events[K]): void {
    const handlers = this.handlers[event];
    if (!handlers?.size) return;
    notifyListeners(handlers, payload, {
      source: this.getLogSource?.() ?? null,
      category: 'UI',
      coreCategory: 'ELEMENT',
      message: `engine "${String(event)}" handler threw`,
    });
  }

  clear(): void {
    this.handlers = {};
  }
}
