import type { ComponentChildren, Ref } from "preact";
import { useRef, useState } from "preact/hooks";
import type { PinSpot } from "../../shared/quiz-constants.ts";

// Pin questions: an image with labelled spots. Players drag a pin onto a spot (it snaps to the
// nearest one when dropped close enough) and press Submit; the answer is the spot's option index.

/** How far (px) a drop may land from a spot and still snap onto it; grows with big images. */
const SNAP_MIN_PX = 44;
const SNAP_FRACTION = 0.12;
/** The dragged pin floats this far above the finger so the finger doesn't hide its tip. */
const LIFT_PX = 36;

/**
 * The image with its spots. The frame takes the image's own aspect ratio, so spot positions
 * (fractions of the image) line up exactly however large the image is drawn.
 */
export function PinBoard({
  image,
  spots,
  labels,
  pinAt = null,
  hot = null,
  correct,
  wrong = null,
  counts,
  onSpotClick,
  onImageClick,
  boardRef,
  children,
}: {
  image: string;
  spots: PinSpot[];
  labels: string[];
  /** Spot the pin sits on. */
  pinAt?: number | null;
  /** Spot the dragged pin would snap to. */
  hot?: number | null;
  /** Revealed correct spots (green). */
  correct?: number[];
  /** A wrong pick to mark red. */
  wrong?: number | null;
  /** How many players picked each spot (host reveal). */
  counts?: number[];
  onSpotClick?: (index: number) => void;
  /** Click on the image itself, with the position as fractions of the image. */
  onImageClick?: (x: number, y: number) => void;
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
          correct?.includes(i) ? "is-correct" : "",
          wrong === i ? "is-wrong" : "",
          hot === i ? "is-hot" : "",
          pinAt === i ? "has-pin" : "",
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
            {counts && <span class="pin-count">{counts[i] ?? 0}</span>}
          </button>
        );
      })}
      {pinAt !== null && spots[pinAt] && <PinIcon class="pin-placed" style={{ left: `${spots[pinAt]!.x * 100}%`, top: `${spots[pinAt]!.y * 100}%` }} />}
      {children}
    </div>
  );
}

/** Projector, under a pin question's image: how to answer while open, the right spot on the reveal. */
export function PinNote({ open, labels }: { open: boolean; labels: string[] }) {
  return (
    <div class={`pin-note ${open ? "" : "right"}`}>
      {open ? "📍 Drag the pin onto the right label on your phone" : `✓ Spot ${labels.join(" / ")}`}
    </div>
  );
}

export function PinIcon({ class: cls = "", style }: { class?: string; style?: Record<string, string> }) {
  return (
    <svg class={`pin-icon ${cls}`} style={style} viewBox="0 0 32 44" aria-hidden="true">
      <path d="M16 43C16 43 3 26 3 16a13 13 0 0 1 26 0c0 10-13 27-13 27z" fill="#e0344a" stroke="#fff" stroke-width="2.5" />
      <circle cx="16" cy="16" r="5" fill="#fff" />
    </svg>
  );
}

/** The nearest spot to a point (client px) within snapping range of the board, or null. */
function nearestSpot(board: HTMLElement, spots: PinSpot[], clientX: number, clientY: number): number | null {
  const rect = board.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const range = Math.max(SNAP_MIN_PX, SNAP_FRACTION * Math.min(rect.width, rect.height));
  let best: number | null = null;
  let bestDist = range;
  spots.forEach((s, i) => {
    const d = Math.hypot(rect.left + s.x * rect.width - clientX, rect.top + s.y * rect.height - clientY);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/**
 * The phone's pin question: drag the pin from the tray (or from the spot it sits on) onto the
 * image. Dropped near a spot it snaps there; dropped elsewhere it goes back to the tray. Tapping a
 * spot also puts the pin there. Submit sends the spot's index.
 */
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
  const [drag, setDrag] = useState<{ x: number; y: number; hot: number | null } | null>(null);
  const dragging = useRef(false);

  const tip = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY - LIFT_PX });
  const hotAt = (x: number, y: number) => (board.current ? nearestSpot(board.current, spots, x, y) : null);

  const onDown = (e: PointerEvent) => {
    if (disabled || !(e.target as Element).closest?.(".pin-grab")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    const t = tip(e);
    setDrag({ ...t, hot: hotAt(t.x, t.y) });
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    const t = tip(e);
    setDrag({ ...t, hot: hotAt(t.x, t.y) });
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const t = tip(e);
    const hit = hotAt(t.x, t.y);
    setPlaced(hit);
    if (hit !== null) navigator.vibrate?.(25);
    setDrag(null);
  };
  const onCancel = () => {
    dragging.current = false;
    setDrag(null);
  };

  const pinAt = drag ? null : placed;
  return (
    <div class="pin-dragger" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onLostPointerCapture={onCancel}>
      <div class="pin-stage">
        <PinBoard
          image={image}
          spots={spots}
          labels={labels}
          boardRef={board}
          pinAt={pinAt}
          hot={drag?.hot ?? null}
          onSpotClick={disabled ? undefined : (i) => setPlaced(i)}
        >
          {pinAt !== null && spots[pinAt] && (
            <div class="pin-grab pin-grab-placed" style={{ left: `${spots[pinAt]!.x * 100}%`, top: `${spots[pinAt]!.y * 100}%` }} />
          )}
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
      {drag && <PinIcon class="pin-floating" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} />}
    </div>
  );
}
