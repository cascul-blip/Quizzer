import type { ComponentChildren } from "preact";
import { Component } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { STREAK_MIN, TEAMS } from "../../shared/protocol.ts";
import { PinIcon } from "./pin.tsx";
import { Tex } from "./tex.tsx";

/** why: white text is unreadable on the bright yellow team, so that one gets dark ink. */
export const teamInk = (color: string | undefined): string => (color?.toLowerCase() === TEAMS[2].color ? "#2b2100" : "#fff");

export const teamVars = (color: string | undefined) => ({ "--team": color, "--team-ink": teamInk(color) });

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

export function StreakBadge({ streak }: { streak: number }) {
  if (streak < STREAK_MIN) return null;
  return (
    <span class="streak" title={`${streak} correct answers in a row`} aria-label={`${streak} answer streak`}>
      <span aria-hidden="true">🔥</span>x{streak}
    </span>
  );
}

/** why: true/false uses blue for True and red for False, as Kahoot does. */
export function optionColor(type: string, index: number): number {
  return type === "true_false" ? (index === 0 ? 1 : 0) : index;
}

export function LockedChoice({ type, index, label }: { type: string; index: number; label: string }) {
  if (type === "pin") {
    return (
      <div class="locked pin-locked">
        <PinIcon />
        <span>Spot {label}</span>
      </div>
    );
  }
  const c = optionColor(type, index);
  return (
    <div class={`locked opt-${c}`}>
      <Shape index={c} />
      <span>
        <Tex text={label} />
      </span>
    </div>
  );
}

/** why: `remainingMs` is relative to when the message arrived, so client/server clock skew doesn't matter. */
export function useCountdown(remainingMs: number, key: string): number {
  // why: reset only when the phase/question key changes, not on every snapshot.
  const ref = useRef<{ key: string; deadline: number } | null>(null);
  if (!ref.current || ref.current.key !== key) ref.current = { key, deadline: performance.now() + remainingMs };
  const [, force] = useState(0);
  useEffect(() => {
    if (remainingMs <= 0) return;
    let id: ReturnType<typeof setTimeout>;
    // why: re-render only when the shown second changes, stopping at 0: the caller is usually a
    // whole stage, so every render redraws its art.
    const wake = () => {
      const left = ref.current!.deadline - performance.now();
      if (left > 0) id = setTimeout(tick, nextSecondIn(left));
    };
    const tick = () => {
      force((n) => n + 1);
      wake();
    };
    wake();
    return () => clearTimeout(id);
  }, [key]);
  return Math.max(0, Math.ceil((ref.current.deadline - performance.now()) / 1000));
}

export function nextSecondIn(leftMs: number, slackMs = 5): number {
  return leftMs - (Math.ceil(leftMs / 1000) - 1) * 1000 + slackMs;
}

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

/** why: a render failure (e.g. a page from an older version) reloads once; a repeat soon after shows a button instead of freezing. */
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
      // why: storage unavailable: fall through to the manual button
    }
    this.setState({ failed: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        class="center"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>Something went wrong</h1>
        <button class="btn primary" onClick={() => location.reload()}>
          Tap to reload
        </button>
      </main>
    );
  }
}

export function TextAnswer({ onSubmit, disabled = false }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const ready = text.trim() !== "" && !disabled;
  const send = () => ready && onSubmit(text.trim());
  return (
    <form
      class="text-answer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input
        type="text"
        value={text}
        maxLength={100}
        autoFocus
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellcheck={false}
        enterkeyhint="send"
        placeholder="Type your answer"
        aria-label="Your answer"
        disabled={disabled}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <button class="btn primary" type="submit" disabled={!ready}>
        Send
      </button>
    </form>
  );
}
