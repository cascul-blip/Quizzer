import { Component, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { STREAK_MIN } from "../../shared/protocol.ts";

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

/** 🔥 x4: shown next to a name once a player has STREAK_MIN+ correct answers in a row. */
export function StreakBadge({ streak }: { streak: number }) {
  if (streak < STREAK_MIN) return null;
  return (
    <span class="streak" title={`${streak} correct answers in a row`} aria-label={`${streak} answer streak`}>
      <span aria-hidden="true">🔥</span>x{streak}
    </span>
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

/** 125 → "2:05" */
export function formatClock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
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

const RELOAD_KEY = "quizzer.autoReloadAt";

/**
 * If a screen fails to render (e.g. a page left open from an older version),
 * reload once automatically; if it happens again soon after, offer a button
 * instead of freezing on the last good screen.
 */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };

  componentDidCatch(error: unknown) {
    console.error(error);
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        location.reload();
        return;
      }
    } catch {
      // storage unavailable: fall through to the manual button
    }
    this.setState({ failed: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main class="center" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px", textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>Something went wrong</h1>
        <button class="btn primary" onClick={() => location.reload()}>
          Tap to reload
        </button>
      </main>
    );
  }
}
