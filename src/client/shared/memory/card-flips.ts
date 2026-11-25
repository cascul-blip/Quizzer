import { useEffect, useRef, useState } from "preact/hooks";
import type { MemoryCardView } from "../../../shared/modes/memory.ts";
import "./card-flips.css";

/** How long a card takes to turn over; keep in step with card-flips.css. */
export const MEMORY_FLIP_MS = 400;

export type CardFlip = "memory-flip-up" | "memory-flip-down" | null;

/**
 * Which cards on a Memory board are turning over. A card flips up when it turns face up between two boards,
 * and every face-up card flips back down in the last MEMORY_FLIP_MS before `flipBackInMs` runs out.
 * Pass null to keep the cards up, and a new `resetKey` for each turn or phase.
 */
export function useCardFlips(board: MemoryCardView[], flipBackInMs: number | null, resetKey: string): (position: number) => CardFlip {
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

  const closeKey = flipBackInMs === null ? null : resetKey;
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => {
    if (closeKey === null || flipBackInMs === null) return;
    const timer = setTimeout(() => setClosed(closeKey), Math.max(0, flipBackInMs - MEMORY_FLIP_MS));
    return () => clearTimeout(timer);
  }, [closeKey]);
  const closing = closeKey !== null && closed === closeKey;

  return (position) => {
    if (board[position]?.state !== "up") return null;
    if (closing) return "memory-flip-down";
    return flipped.has(position) ? "memory-flip-up" : null;
  };
}
