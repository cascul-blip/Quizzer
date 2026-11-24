import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { PinBoard, PinNote } from "../shared/pin.tsx";
import { play } from "../shared/sounds.ts";
import { Tex } from "../shared/tex.tsx";
import { optionColor, ordinal, Shape, StreakBadge, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import { everyoneAnswered, revealCue } from "./reveal-cue.ts";

type GameView = Extract<HostView, { kind: "classic" }>;

export function classicCue(view: GameView): MusicCue {
  if (view.phase === "podium") return { track: "classic-results" };
  if (view.phase === "reveal" || view.phase === "leaderboard") return { track: "classic-leaderboard" };
  // Questions: tension builds over the time limit.
  const q = view.question;
  if (view.phase === "open" && q) {
    return { track: "classic-question", intensity: 0.2, rampTo: 1, rampMs: q.remainingMs, key: `q${q.index}-open` };
  }
  return { track: "classic-question", intensity: 0.1, key: `q${q?.index ?? 0}-intro` };
}

export function ClassicStage({ view, send, enteredFromLobby }: { view: GameView; send: Send; enteredFromLobby: boolean }) {
  const prev = useRef<GameView | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (view.phase === "intro" && (p ? p.phase !== "intro" : enteredFromLobby)) play("start");
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "reveal") play(revealCue(p.phase === "open", view.answeredCount, view.players));
      if (view.phase === "podium") play("fanfare");
    }
  }, [view, enteredFromLobby]);

  // Keyboard: Space / → = next, S = skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (view.phase !== "podium") send({ type: "host.next" });
      } else if (e.key === "s" || e.key === "S") {
        if (view.phase === "open" || view.phase === "intro") send({ type: "host.skip" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase, send]);

  const inGame = view.phase !== "podium";

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        {view.question && inGame && (
          <div class="pill">
            Question {view.question.index + 1} / {view.question.total}
          </div>
        )}
        <div class="spacer" />
        {inGame && (
          <label class="pacing-toggle" title="Auto-advance after the reveal and leaderboard">
            <input
              type="checkbox"
              checked={view.pacing === "auto"}
              onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.checked ? "auto" : "manual" })}
            />
            Auto-advance
          </label>
        )}
        <div class="pill">
          👥 {view.players.filter((p) => p.connected).length}
          {view.players.some((p) => !p.connected) && <span class="dim"> / {view.players.length}</span>}
        </div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      <PhaseView view={view} send={send} />
    </div>
  );
}

function PhaseView({ view, send }: { view: GameView; send: Send }) {
  switch (view.phase) {
    case "intro":
      return <Intro view={view} send={send} />;
    case "open":
    case "reveal":
      return <QuestionScreen view={view} send={send} />;
    case "leaderboard":
      return <Leaderboard view={view} send={send} />;
    case "podium":
      return <Podium view={view} send={send} />;
  }
}

function Intro({ view, send }: { view: GameView; send: Send }) {
  const q = view.question!;
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

function QuestionScreen({ view, send }: { view: GameView; send: Send }) {
  const q = view.question!;
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
            <PinBoard image={pin.image} spots={pin.spots} labels={q.options} correct={open ? undefined : [...correct]} counts={open ? undefined : counts} />
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
          <NextButton view={view} send={send} label={q.index + 1 >= q.total ? "Final results" : "Leaderboard"} />
        )}
      </footer>
    </main>
  );
}

function NextButton({ view, send, label }: { view: GameView; send: Send; label: string }) {
  return (
    <button class="btn primary next" onClick={() => send({ type: "host.next" })}>
      {label} {view.pacing === "auto" ? <span class="auto-note">(auto)</span> : "→"}
    </button>
  );
}

function Leaderboard({ view, send }: { view: GameView; send: Send }) {
  const top = view.leaderboard.slice(0, 5);
  return (
    <main class="leaderboard">
      <h1>Leaderboard</h1>
      <ol class="lb-list">
        {top.map((p, i) => (
          <li key={p.id} class="lb-row" style={{ animationDelay: `${i * 80}ms` }}>
            <span class="lb-rank">{p.rank}</span>
            <Avatar choice={p.avatar} class="lb-avatar" />
            <span class="lb-name">
              {p.nickname}
              <StreakBadge streak={p.streak} />
            </span>
            {p.delta > 0 && <span class="lb-delta">+{p.delta}</span>}
            <span class="lb-score">{p.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      <footer class="controls">
        <NextButton view={view} send={send} label="Next question" />
      </footer>
    </main>
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

function Podium({ view, send }: { view: GameView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const lb = view.leaderboard;
  const byPlace = (rankIdx: number) => lb[rankIdx];
  const places = [
    { entry: byPlace(1), cls: "second" },
    { entry: byPlace(0), cls: "first" },
    { entry: byPlace(2), cls: "third" },
  ];
  return (
    <main class="podium">
      <h1>🏆 Final results</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="podium-blocks">
            {places.map(({ entry, cls }) =>
              entry ? (
                <div key={cls} class={`place ${cls}`}>
                  <div class="place-avatar">
                    <Avatar choice={entry.avatar} title={entry.nickname} />
                  </div>
                  <div class="place-name">
                    {entry.nickname}
                    <StreakBadge streak={entry.streak} />
                  </div>
                  <div class="place-score">{entry.score.toLocaleString()}</div>
                  <div class="place-block">{ordinal(entry.rank)}</div>
                </div>
              ) : (
                <div key={cls} class={`place ${cls} empty`} />
              ),
            )}
          </div>
          {lb.length > 3 && (
            <ol class="rest" start={4}>
              {lb.slice(3).map((p) => (
                <li key={p.id}>
                  <span class="rest-who">
                    {ordinal(p.rank)} <Avatar choice={p.avatar} class="rest-avatar" /> {p.nickname}
                    <StreakBadge streak={p.streak} />
                  </span>
                  <span>{p.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <footer class="controls">
        <ErrorsButton shown={showErrors} onToggle={() => setShowErrors(!showErrors)} />
        <button class="btn ghost" onClick={() => send({ type: "host.open", quizId: view.quiz.id })}>
          ↻ Play again
        </button>
        <button class="btn primary" onClick={() => send({ type: "host.close" })}>
          Done
        </button>
      </footer>
    </main>
  );
}
