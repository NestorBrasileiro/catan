// Where a hex sits on the screen, so cards can fly out of it. The 2D board tags its hexes in the
// page; the 3D board has no page elements, so it registers a function that projects them instead.

type Point = { x: number; y: number };

let projector: ((hexKey: string) => Point | null) | null = null;

export function setHexProjector(fn: ((hexKey: string) => Point | null) | null) {
  projector = fn;
}

export function hexScreenPoint(hexKey: string): Point | null {
  if (projector) return projector(hexKey);
  const el = document.querySelector(`[data-hex="${hexKey}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
