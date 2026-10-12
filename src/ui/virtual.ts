/**
 * A plain `DOMRect`-shaped object for a `@floating-ui/dom` virtual reference.
 * Built by hand (rather than `new DOMRect`) so it works identically in the
 * browser and in happy-dom, and so a caller can recompute it per frame (the
 * selection rect / cursor point the floating presenters anchor to).
 */
export function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return this;
    },
  } as DOMRect;
}
