/**
 * Minimal typed event bus. Modules communicate through the engine's emitter
 * rather than calling each other directly.
 */
export type Handler<T> = (payload: T) => void;

export class EventEmitter<Events extends Record<string, any>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.forEach((h) => h(payload));
  }

  clear(): void {
    this.handlers = {};
  }
}
