import { useEffect, useRef } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { Pacing, QuestionView } from "../../shared/mode-views.ts";
import type { JoinInfo } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { PinBoard, PinNote } from "../shared/pin.tsx";
import { play } from "../shared/sounds.ts";
import { Tex } from "../shared/tex.tsx";
import { optionColor, Shape, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ScreenControls, toggleFullscreen } from "./common.tsx";
import { everyoneAnswered } from "./reveal-cue.ts";

export function usePacedShortcuts(
  { advance, canSkip, ignoreButtons = false }: { advance: "send" | "prevent-default" | "ignore"; canSkip: boolean; ignoreButtons?: boolean },
  send: Send,
) {
  useEffect(() => {
    const controlSelector = ignoreButtons ? "input, select, textarea, button" : "input, select, textarea";
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target && (!ignoreButtons || target instanceof HTMLElement) && "closest" in target && typeof target.closest === "function") {
        if (target.closest(controlSelector)) return;
      }
      if (event.key === " " || event.key === "ArrowRight") {
        if (advance === "ignore") return;
        event.preventDefault();
        if (advance === "send") send({ type: "host.next" });
      } else if (event.key === "s" || event.key === "S") {
        if (canSkip) send({ type: "host.skip" });
      } else if (event.key === "f" || event.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, canSkip, ignoreButtons, send]);
}

export function PacedStageHeader({
  title,
  questionLabel,
  connectedCount,
  totalPlayerCount,
  join,
  gameControls,
  send,
}: {
  title: string;
  questionLabel?: string;
  connectedCount: number;
  totalPlayerCount?: number;
  join: JoinInfo;
  gameControls?: { pacing: Pacing; autoAdvanceTitle: string };
  send: Send;
}) {
  return (
    <header class="topbar">
      <div class="title">{title}</div>
      {questionLabel && <div class="pill">{questionLabel}</div>}
      <div class="spacer" />
      {gameControls && (
        <label class="pacing-toggle" title={gameControls.autoAdvanceTitle}>
          <input
            type="checkbox"
            checked={gameControls.pacing === "auto"}
            onChange={(event) => send({ type: "host.setPacing", pacing: event.currentTarget.checked ? "auto" : "manual" })}
          />
          Auto-advance
        </label>
      )}
      <div class="pill">
        👥 {connectedCount}
        {totalPlayerCount !== undefined && connectedCount < totalPlayerCount && <span class="dim"> / {totalPlayerCount}</span>}
      </div>
      <ScreenControls join={join} />
      {gameControls && (
        <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
          End game
        </button>
      )}
    </header>
  );
}

export function PacedQuestionIntro({ question: q, send }: { question: QuestionView; send: Send }) {
  return (
    <main class="intro" onClick={() => send({ type: "host.skip" })}>
      <div class="intro-num">Question {q.index + 1}</div>
      <h1 class="intro-text">
        <Tex text={q.text} />
      </h1>
      <div class="intro-bar">
        <div class="intro-fill" style={{ animationDuration: `${q.remainingMs}ms` }} key={q.index} />
      </div>
    </main>
  );
}

type PacedQuestionState = {
  answeredCount: number;
  answerCounts: number[] | null;
  correct: number[] | null;
  pacing: Pacing;
  phase: string;
  players: { connected: boolean }[];
  answerAvatars?: AvatarChoice[][] | null;
};

export function PacedQuestionScreen({
  question: q,
  view,
  send,
  nextLabel,
}: {
  question: QuestionView;
  view: PacedQuestionState;
  send: Send;
  nextLabel: string;
}) {
  const open = view.phase === "open";
  const secs = useCountdown(q.remainingMs, `${view.phase}:${q.index}`);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!open || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 5) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, open]);

  const correct = new Set(view.correct ?? []);
  const counts = view.answerCounts ?? [];
  const maxCount = Math.max(1, ...counts);
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;

  return (
    <main class={`question ${open ? "is-open" : "is-reveal"} ${pin ? "is-pin" : ""}`}>
      <h1 class="q-title">
        <Tex text={q.text} />
      </h1>
      <div class="q-middle">
        <div class="side">
          {open ? (
            <div class={`countdown ${secs <= 5 ? "urgent" : ""}`} style={{ "--p": String(secs / q.timeLimitSec) }}>
              <span>{secs}</span>
            </div>
          ) : (
            <div class="side-label">{everyoneAnswered(view.answeredCount, view.players) ? "Everyone answered!" : "Time's up"}</div>
          )}
        </div>
        <div class="center-media">
          {pin ? (
            <PinBoard
              image={pin.image}
              spots={pin.spots}
              labels={q.options}
              correct={open ? undefined : [...correct]}
              pickCountsBySpot={open ? undefined : counts}
            />
          ) : !open && q.type !== "text" ? (
            <div class="bars" role="img" aria-label="Answer distribution">
              {q.options.map((_, i) => {
                const c = optionColor(q.type, i);
                return (
                  <div class="bar-col" key={i}>
                    <PickerAvatars avatars={view.answerAvatars?.[i] ?? []} dim={!correct.has(i)} />
                    <div class="bar-count">
                      {correct.has(i) && "✓ "}
                      {counts[i] ?? 0}
                    </div>
                    <div class={`bar opt-${c} ${correct.has(i) ? "" : "dim"}`} style={{ height: `${6 + ((counts[i] ?? 0) / maxCount) * 50}%` }} />
                    <div class={`bar-base opt-${c}`}>
                      <Shape index={c} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : q.image ? (
            <img class="q-image" src={`/${q.image}`} alt="" />
          ) : (
            <div class="no-image" />
          )}
        </div>
        <div class="side">
          <div class="answered">
            <div class="answered-n">{view.answeredCount}</div>
            <div class="answered-l">answer{view.answeredCount === 1 ? "" : "s"}</div>
          </div>
        </div>
      </div>
      {q.type === "text" && open && <p class="typing-note">Type your answer on your phone</p>}
      {pin ? (
        <PinNote open={open} labels={[...correct].map((i) => q.options[i]!)} />
      ) : (
        <div class={`tiles n${q.options.length}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            const state = open ? "" : correct.has(i) ? "right" : "wrong";
            return (
              <div key={i} class={`tile opt-${c} ${state}`}>
                <Shape index={c} />
                <span class="tile-text">
                  <Tex text={text} />
                </span>
                {state === "right" && <span class="tick">✓</span>}
              </div>
            );
          })}
        </div>
      )}
      <footer class="controls">
        {open ? (
          <button class="btn ghost" onClick={() => send({ type: "host.skip" })}>
            Skip (S)
          </button>
        ) : (
          <NextButton pacing={view.pacing} send={send} label={nextLabel} />
        )}
      </footer>
    </main>
  );
}

export function NextButton({ pacing, send, label }: { pacing: Pacing; send: Send; label: string }) {
  return (
    <button class="btn primary next" onClick={() => send({ type: "host.next" })}>
      {label} {pacing === "auto" ? <span class="auto-note">(auto)</span> : "→"}
    </button>
  );
}

/** Avatars shown above each answer's bar (no names), in answer order; shrink as they crowd, overflow as "+N". */
const MAX_PICKER_AVATARS = 24;

function PickerAvatars({ avatars, dim }: { avatars: AvatarChoice[]; dim: boolean }) {
  if (avatars.length === 0) return <div class="pickers" />;
  const shown = avatars.slice(0, MAX_PICKER_AVATARS);
  const extra = avatars.length - shown.length;
  const size = avatars.length <= 4 ? "lg" : avatars.length <= 10 ? "md" : "sm";
  return (
    <div class={`pickers ${size} ${dim ? "dim" : ""}`}>
      {shown.map((a, k) => (
        <Avatar key={k} choice={a} class="picker" />
      ))}
      {extra > 0 && <span class="picker-more">+{extra}</span>}
    </div>
  );
}
