import type { ComponentChildren, Ref } from "preact";
import { useRef, useState } from "preact/hooks";
import type { PinSpot } from "../../shared/quiz-constants.ts";

const SNAP_MIN_PX = 44;
const SNAP_FRACTION_OF_SHORT_SIDE = 0.12;
/** why: lifted above the finger so the finger doesn't hide the pin's tip. */
const PIN_TIP_LIFT_PX = 36;

/** why: the frame takes the image's aspect ratio, so fractional spot positions line up at any size. */
export function PinBoard({
  image,
  spots,
  labels,
  placedSpotIndex = null,
  snapTargetIndex = null,
  correctSpotIndexes,
  wrongSpotIndex = null,
  revealPickCountsBySpot,
  onSpotClick,
  onImageClick,
  boardRef,
  children,
}: {
  image: string;
  spots: PinSpot[];
  labels: string[];
  placedSpotIndex?: number | null;
  snapTargetIndex?: number | null;
  correctSpotIndexes?: number[];
  wrongSpotIndex?: number | null;
  revealPickCountsBySpot?: number[];
  onSpotClick?: (index: number) => void;
  onImageClick?: (xFraction: number, yFraction: number) => void;
  boardRef?: Ref<HTMLDivElement>;
  children?: ComponentChildren;
}) {
  const [loaded, setLoaded] = useState<{ image: string; ratio: number } | null>(null);
  const ratio = loaded?.image === image ? loaded.ratio : null;
  const imageClick = (e: MouseEvent) => {
    if (!onImageClick) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
    onImageClick(clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height));
  };
  const placedSpot = placedSpotIndex === null ? undefined : spots[placedSpotIndex];
  return (
    <div
      class={`pin-board ${ratio ? "" : "loading"}`}
      ref={boardRef}
      style={ratio ? { aspectRatio: String(ratio), width: `min(100%, calc(var(--pin-max-h) * ${ratio}))` } : undefined}
    >
      <img
        class="pin-img"
        src={`/${image}`}
        alt=""
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.naturalWidth && img.naturalHeight) setLoaded({ image, ratio: img.naturalWidth / img.naturalHeight });
        }}
        onClick={onImageClick ? imageClick : undefined}
      />
      {spots.map((s, i) => {
        const cls = [
          "pin-spot",
          correctSpotIndexes?.includes(i) ? "is-correct" : "",
          wrongSpotIndex === i ? "is-wrong" : "",
          snapTargetIndex === i ? "is-hot" : "",
          placedSpotIndex === i ? "has-pin" : "",
          onSpotClick ? "clickable" : "",
        ].join(" ");
        return (
          <button
            key={i}
            type="button"
            class={cls}
            data-spot={i}
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
            tabIndex={onSpotClick ? 0 : -1}
            aria-label={`Spot ${labels[i] ?? i + 1}`}
            onClick={onSpotClick ? () => onSpotClick(i) : undefined}
          >
            {labels[i]}
            {revealPickCountsBySpot && <span class="pin-count">{revealPickCountsBySpot[i] ?? 0}</span>}
          </button>
        );
      })}
      {placedSpot && <PinIcon class="pin-placed" style={{ left: `${placedSpot.x * 100}%`, top: `${placedSpot.y * 100}%` }} />}
      {children}
    </div>
  );
}

export function ProjectorPinNote({ open, labels }: { open: boolean; labels: string[] }) {
  return <div class={`pin-note ${open ? "" : "right"}`}>{open ? "📍 Drag the pin onto the right label on your phone" : `✓ Spot ${labels.join(" / ")}`}</div>;
}

export function PinIcon({ class: cls = "", style }: { class?: string; style?: Record<string, string> }) {
  return (
    <svg class={`pin-icon ${cls}`} style={style} viewBox="0 0 32 44" aria-hidden="true">
      <path d="M16 43C16 43 3 26 3 16a13 13 0 0 1 26 0c0 10-13 27-13 27z" fill="#e0344a" stroke="#fff" stroke-width="2.5" />
      <circle cx="16" cy="16" r="5" fill="#fff" />
    </svg>
  );
}

function nearestSpotWithinSnapRange(board: HTMLElement, spots: PinSpot[], clientXPx: number, clientYPx: number): number | null {
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const snapRangePx = Math.max(SNAP_MIN_PX, SNAP_FRACTION_OF_SHORT_SIDE * Math.min(rect.width, rect.height));
  let nearestIndex: number | null = null;
  let bestDistancePx = snapRangePx;
  spots.forEach((s, i) => {
    const distancePx = Math.hypot(rect.left + s.x * rect.width - clientXPx, rect.top + s.y * rect.height - clientYPx);
    if (distancePx <= bestDistancePx) {
      nearestIndex = i;
      bestDistancePx = distancePx;
    }
  });
  return nearestIndex;
}

export function PinDragger({
  image,
  spots,
  labels,
  disabled = false,
  onSubmit,
}: {
  image: string;
  spots: PinSpot[];
  labels: string[];
  disabled?: boolean;
  onSubmit: (index: number) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ xPx: number; yPx: number; snapTargetIndex: number | null } | null>(null);
  const dragging = useRef(false);

  const pinTipPx = (e: PointerEvent) => ({ xPx: e.clientX, yPx: e.clientY - PIN_TIP_LIFT_PX });
  const snapTargetAtPx = (xPx: number, yPx: number) => (board.current ? nearestSpotWithinSnapRange(board.current, spots, xPx, yPx) : null);

  const onDown = (e: PointerEvent) => {
    if (disabled || !(e.target as Element).closest?.(".pin-grab")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    const tipPx = pinTipPx(e);
    setDrag({ ...tipPx, snapTargetIndex: snapTargetAtPx(tipPx.xPx, tipPx.yPx) });
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const tipPx = pinTipPx(e);
    setDrag({ ...tipPx, snapTargetIndex: snapTargetAtPx(tipPx.xPx, tipPx.yPx) });
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const tipPx = pinTipPx(e);
    const hit = snapTargetAtPx(tipPx.xPx, tipPx.yPx);
    setPlaced(hit);
    if (hit !== null) navigator.vibrate?.(25);
    setDrag(null);
  };
  const onCancel = () => {
    dragging.current = false;
    setDrag(null);
  };

  const placedSpotIndex = drag ? null : placed;
  const placedSpot = placedSpotIndex === null ? undefined : spots[placedSpotIndex];
  return (
    <div class="pin-dragger" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onLostPointerCapture={onCancel}>
      <div class="pin-stage">
        <PinBoard
          image={image}
          spots={spots}
          labels={labels}
          boardRef={board}
          placedSpotIndex={placedSpotIndex}
          snapTargetIndex={drag?.snapTargetIndex ?? null}
          onSpotClick={disabled ? undefined : (i) => setPlaced(i)}
        >
          {placedSpot && <div class="pin-grab pin-grab-placed" style={{ left: `${placedSpot.x * 100}%`, top: `${placedSpot.y * 100}%` }} />}
        </PinBoard>
      </div>
      <div class="pin-tray">
        <div class={`pin-home ${placed === null && !drag ? "" : "empty"}`}>
          {placed === null && !drag ? (
            <div class="pin-grab pin-grab-home" aria-label="Pin: drag it onto the picture">
              <PinIcon />
            </div>
          ) : (
            <span class="pin-picked">{drag ? "Drop it on a label" : `Spot ${labels[placed!]}`}</span>
          )}
        </div>
        <button type="button" class="pin-submit" disabled={disabled || placed === null || !!drag} onClick={() => placed !== null && onSubmit(placed)}>
          Submit
        </button>
      </div>
      {placed === null && !drag && <p class="pin-hint">Drag the pin onto the right label</p>}
      {drag && <PinIcon class="pin-floating" style={{ left: `${drag.xPx}px`, top: `${drag.yPx}px` }} />}
    </div>
  );
}
