import { useEffect, useRef } from "preact/hooks";

const MAX_ZOOM = 4;
const OPEN_ZOOM = 1.5;
const ZOOM_STEP = 1.5;

interface PanZoomOptions {
  focus?: (inner: HTMLDivElement) => Element[];
  onTap?: (event: PointerEvent) => void;
}

/** Keep the viewport fixed and transform its inner surface. A focus opens the surface zoomed in. */
export function usePanZoom({ focus, onTap }: PanZoomOptions = {}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, travel: 0 });

  const apply = () => {
    const el = box.current;
    const position = transform.current;
    if (!el || !inner.current) return;
    position.x = Math.min(0, Math.max(el.clientWidth * (1 - position.scale), position.x));
    position.y = Math.min(0, Math.max(el.clientHeight * (1 - position.scale), position.y));
    inner.current.style.transform = position.scale === 1 ? "" : `translate(${position.x}px, ${position.y}px) scale(${position.scale})`;
  };
  /** Zoom by `factor`, keeping the point (cx, cy) of the box under the fingers. */
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const position = transform.current;
    const scale = Math.min(MAX_ZOOM, Math.max(1, position.scale * factor));
    position.x = cx - ((cx - position.x) * scale) / position.scale;
    position.y = cy - ((cy - position.y) * scale) / position.scale;
    position.scale = scale;
    apply();
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...activePointers.current.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } : null;
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // Centre the focus tiles, measured on the unzoomed board.
    const centres = inner.current
      ? (focus?.(inner.current) ?? []).map((target) => {
          const r = target.getBoundingClientRect();
          return local({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
        })
      : [];
    if (centres.length) {
      const cx = centres.reduce((a, c) => a + c.x, 0) / centres.length;
      const cy = centres.reduce((a, c) => a + c.y, 0) / centres.length;
      transform.current = { scale: OPEN_ZOOM, x: el.clientWidth / 2 - cx * OPEN_ZOOM, y: el.clientHeight / 2 - cy * OPEN_ZOOM };
      apply();
    }
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, []);

  const onDown = (e: PointerEvent) => {
    activePointers.current.set(e.pointerId, local(e));
    if (activePointers.current.size === 1) gesture.current = { moved: false, travel: 0 };
    else gesture.current.moved = true;
  };
  const onMove = (e: PointerEvent) => {
    const prev = activePointers.current.get(e.pointerId);
    if (!prev) return;
    const before = spread();
    const now = local(e);
    activePointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (activePointers.current.size === 1) {
      g.travel += Math.hypot(now.x - prev.x, now.y - prev.y);
      if (g.travel > 8) g.moved = true;
      if (!g.moved) return;
      transform.current.x += now.x - prev.x;
      transform.current.y += now.y - prev.y;
      apply();
    } else {
      const after = spread();
      if (!before || !after || before.d === 0) return;
      transform.current.x += after.cx - before.cx;
      transform.current.y += after.cy - before.cy;
      zoomAt(after.cx, after.cy, after.d / before.d);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!activePointers.current.delete(e.pointerId)) return;
    if (e.type !== "pointerup") gesture.current.moved = true;
    if (activePointers.current.size === 0 && !gesture.current.moved) onTap?.(e);
  };
  const zoomFromCentre = (factor: number) => {
    const el = box.current!;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
  };

  return {
    box,
    inner,
    zoomIn: () => zoomFromCentre(ZOOM_STEP),
    zoomOut: () => zoomFromCentre(1 / ZOOM_STEP),
    pointerHandlers: {
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
      onPointerLeave: onUp,
    },
    // Keyboard and assistive technology clicks have no pointer gesture.
    isTap: (event: MouseEvent) => event.detail === 0 || !gesture.current.moved,
  };
}
