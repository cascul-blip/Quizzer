import { useEffect, useRef, useState } from "preact/hooks";

/** Kahoot-style option shapes: triangle, diamond, circle, square. */
export function Shape({ index }: { index: number }) {
  const paths = [
    <polygon points="50,8 94,88 6,88" />,
    <polygon points="50,4 96,50 50,96 4,50" />,
    <circle cx="50" cy="50" r="44" />,
    <rect x="10" y="10" width="80" height="80" rx="4" />,
  ];
  return (
    <svg class="shape" viewBox="0 0 100 100" aria-hidden="true">
      {paths[index % 4]}
    </svg>
  );
}

/** For true/false, use blue for True and red for False, as Kahoot does. */
export function optionColor(type: string, index: number): number {
  return type === "true_false" ? (index === 0 ? 1 : 0) : index;
}

/**
 * Seconds left in a server countdown. `remainingMs` is relative to when the
 * message arrived, so client/server clock differences don't matter.
 */
export function useCountdown(remainingMs: number, key: string): number {
  // Only reset when the phase/question (key) changes, not on every snapshot.
  const ref = useRef<{ key: string; deadline: number } | null>(null);
  if (!ref.current || ref.current.key !== key) ref.current = { key, deadline: performance.now() + remainingMs };
  const [, force] = useState(0);
  useEffect(() => {
    if (remainingMs <= 0) return;
    const id = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [key]);
  return Math.max(0, Math.ceil((ref.current.deadline - performance.now()) / 1000));
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [message]);
  return message ? (
    <div class="toast" role="alert">
      {message}
    </div>
  ) : null;
}

export function ConnBanner({ status }: { status: string }) {
  return status === "open" ? null : <div class="conn-banner">{status === "connecting" ? "Connecting…" : "Connection lost, reconnecting…"}</div>;
}
