import { useEffect, useRef, useState } from "preact/hooks";
import type { MemoryCardView } from "../../../shared/modes/memory.ts";
import { MEMORY_FLIP_MS, MEMORY_SLIDE_HOLD_MS, MEMORY_SLIDE_MS } from "../../../shared/modes/memory.ts";
import "./card-flips.css";

export const MEMORY_FLIP_UP = "memory-flip-up";
export const MEMORY_FLIP_DOWN = "memory-flip-down";
export const MEMORY_SLIDE_OFF = "memory-slide-off";

/** The class a face-up card animates with. */
export type CardMotion = typeof MEMORY_FLIP_UP | typeof MEMORY_FLIP_DOWN | typeof MEMORY_SLIDE_OFF;

/** How one card on a Memory board is moving, and what it shows while it does. */
export interface CardMotionView {
  motion: CardMotion | null;
  /** False while the card turns back down, so it reads as face down. */
  showsFace: boolean;
  /** Whether the card needs a turned-away back child for its flip. */
  hasFlipBack: boolean;
}

/** The CSS custom properties that time card-flips.css from the shared Memory timings. */
export const memoryMotionStyle = {
  "--memory-flip-ms": `${MEMORY_FLIP_MS}ms`,
  "--memory-slide-ms": `${MEMORY_SLIDE_MS}ms`,
};

/**
 * How each card on a Memory board moves. A card flips up when it turns face up between two boards,
 * every face-up card flips back down in the last MEMORY_FLIP_MS before `flipBackInMs` runs out (null keeps them up),
 * and when `matched` the face-up pair slides off once the second card's flip and the hold after it are over.
 * Pass a new `resetKey` for each turn or phase.
 */
export function useCardMotion({
  board,
  flipBackInMs,
  matched,
  resetKey,
}: {
  board: MemoryCardView[];
  flipBackInMs: number | null;
  matched: boolean;
  resetKey: string;
}): (position: number) => CardMotionView {
  const flipped = useFlippedUp(board);
  const closing = useAfter(flipBackInMs === null ? null : Math.max(0, flipBackInMs - MEMORY_FLIP_MS), resetKey);
  const sliding = useAfter(matched ? MEMORY_FLIP_MS + MEMORY_SLIDE_HOLD_MS : null, resetKey);
  return (position) => {
    const motion =
      board[position]?.state !== "up" ? null : sliding ? MEMORY_SLIDE_OFF : closing ? MEMORY_FLIP_DOWN : flipped.has(position) ? MEMORY_FLIP_UP : null;
    return { motion, showsFace: motion !== MEMORY_FLIP_DOWN, hasFlipBack: motion === MEMORY_FLIP_UP || motion === MEMORY_FLIP_DOWN };
  };
}

/**
 * The positions that turned face up since the previous board, kept while the same board renders again.
 * It compares with the last board rendered, so it records that board during render: rendering the same board twice
 * gives the same answer.
 */
function useFlippedUp(board: MemoryCardView[]): Set<number> {
  const seen = useRef<{ board: MemoryCardView[]; flipped: Set<number> } | null>(null);
  const previous = seen.current;
  let flipped = previous?.flipped ?? new Set<number>();
  if (previous && previous.board !== board) {
    flipped = new Set();
    board.forEach((card, position) => {
      const before = previous.board[position]?.state;
      if (card.state === "up" && (before === "down" || (before === "up" && previous.flipped.has(position)))) flipped.add(position);
    });
  }
  seen.current = { board, flipped };
  return flipped;
}

/** True once `delayMs` has passed under `resetKey`; a new delay under the same key reschedules. Null never fires. */
function useAfter(delayMs: number | null, resetKey: string): boolean {
  const key = delayMs === null ? null : resetKey;
  const [fired, setFired] = useState<string | null>(null);
  useEffect(() => {
    if (key === null || delayMs === null) return;
    const timer = setTimeout(() => setFired(key), delayMs);
    return () => clearTimeout(timer);
  }, [key, delayMs]);
  return key !== null && fired === key;
}
