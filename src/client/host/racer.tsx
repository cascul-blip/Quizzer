import { useEffect, useRef, useState } from "preact/hooks";
import type { RacerTurn } from "../../shared/modes/racer.ts";
import { racerShared } from "../../shared/modes/racer.ts";
import type { HostView } from "../../shared/protocol.ts";
import { RACER_CONFIDENCE, RACER_CONFIDENCE_LEVELS, RACER_REPAIR_MPH } from "../../shared/racer-rules.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, themedLabel, themedTrack } from "../../shared/themed-modes.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { PinBoard, ProjectorPinNote } from "../shared/pin.tsx";
import { RacerScene } from "../shared/racer-art.tsx";
import type { Rev } from "../shared/sounds.ts";
import { onMuteChange, play, startRev } from "../shared/sounds.ts";
import { Tex, visibleLength } from "../shared/tex.tsx";
import { optionColor, Shape, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import type { LobbyModeEntry, LobbySettingsProps } from "./lobby-modes.tsx";
import { Award } from "./tower.tsx";

type RacerView = Extract<HostView, { kind: "racer" }>;

const ENGINE_MAX_REV_SHARE = 0.5;
const SPEED_FOR_MAX_ENGINE_HUM_MPH = 150;
const ENGINE_REV_VOLUME_SCALE = 0.5;
const SPEED_COUNT_MS = 1000;

export function RacerStage({ view, send }: { view: RacerView; send: Send }) {
  const q = view.question;
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}:${q?.index ?? -1}`);
  const prev = useRef<RacerView | null>(null);
  const connected = view.players.filter((p) => p.connected).length;
  const shownSpeed = useCountUp(view.car.speedMph, SPEED_COUNT_MS);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || view.phase === p.phase) return;
    if (view.phase === "intro" || view.phase === "confidence") play("start");
    if (view.phase === "podium") play("fanfare");
    if (view.phase === "reveal") {
      const t = view.lastTurn;
      if (t && t.gainMph > 0) play("gearUp");
      else if (t?.crashed) play("crash");
      else if (t && t.fails > 0) play("skid");
      else if (t?.repaired) play("repair");
      else play(p.phase === "open" && view.answeredCount < connected ? "timeUp" : "reveal");
    }
  }, [view]);

  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "open" || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 5) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, view.phase]);

  useEngineHum(view.phase !== "podium" && !view.car.crashed && shownSpeed > 0, Math.min(1, shownSpeed / SPEED_FOR_MAX_ENGINE_HUM_MPH) * ENGINE_MAX_REV_SHARE);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (view.phase !== "podium") send({ type: "host.next" });
      } else if (e.key === "s" || e.key === "S") {
        if (view.phase === "intro" || view.phase === "confidence" || view.phase === "open") send({ type: "host.skip" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase]);

  const podium = view.phase === "podium";
  const lever = view.phase === "confidence" ? view.lever : view.confidence;

  return (
    <div class="stage racer-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">{themedLabel("racer", view.theme)}</div>
        {q && !podium && (
          <div class="pill">
            Question {q.index + 1} / {q.total}
          </div>
        )}
        <div class="spacer" />
        {view.phase === "open" && (
          <>
            <div class="pill">
              {view.answeredCount} / {connected} answered
            </div>
            <Countdown secs={secs} totalMs={view.phaseDurationMs} />
          </>
        )}
        {!podium && (
          <label class="pacing-toggle" title="Auto-advance after the reveal">
            <input
              type="checkbox"
              checked={view.pacing === "auto"}
              onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.checked ? "auto" : "manual" })}
            />
            Auto-advance
          </label>
        )}
        <div class="pill">
          👥 {connected}
          {connected < view.players.length && <span class="dim"> / {view.players.length}</span>}
        </div>
        <ScreenControls join={view.join} />
        {!podium && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {podium ? (
        <RacerPodium view={view} send={send} />
      ) : (
        <>
          <main class="racer-upper">{q && <Turn view={view} send={send} secs={secs} />}</main>
          <section class="racer-lower">
            <RacerScene
              theme={view.theme}
              speed={view.car.speedMph}
              crashed={view.car.crashed}
              onLand={() => play("land")}
              ejected={
                view.phase === "reveal" && view.lastTurn && view.ejected?.length
                  ? { key: view.lastTurn.index, riders: view.ejected.map((e) => ({ avatar: e.avatar, name: e.nickname })) }
                  : undefined
              }
            />
            {/* Bottom left, driver over speed, leaving the right of the scene clear for whoever falls out. */}
            <div class="racer-huds">
              <div class="racer-hud">
                {view.driver ? (
                  <>
                    <div class="racer-hud-line">Driver: {view.driver.nickname}</div>
                    {lever && <div class="racer-hud-level">{RACER_CONFIDENCE[lever].label}</div>}
                  </>
                ) : (
                  <div class="racer-hud-line">No driver</div>
                )}
              </div>
              <div class="racer-hud">
                {view.car.crashed ? <div class="racer-hud-speed crashed">CRASHED</div> : <div class="racer-hud-speed">{Math.round(shownSpeed)} mph</div>}
                <div class="racer-hud-line">{view.car.distanceMiles.toFixed(1)} miles driven</div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function useCountUp(target: number, ms: number): number {
  const [shown, setShown] = useState(target);
  const at = useRef(target);
  useEffect(() => {
    const from = at.current;
    if (from === target) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      at.current = from + (target - from) * (1 - (1 - k) ** 3);
      setShown(at.current);
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function useEngineHum(on: boolean, revShare: number) {
  const rev = useRef<Rev | null>(null);
  const [muteSeq, setMuteSeq] = useState(0);
  useEffect(
    () =>
      onMuteChange(() => {
        rev.current?.stop();
        rev.current = null;
        setMuteSeq((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!on) {
      rev.current?.stop();
      rev.current = null;
      return;
    }
    // why: audio may be unavailable until the browser receives a user gesture, so leave failed starts retryable.
    rev.current ??= startRev(ENGINE_REV_VOLUME_SCALE);
    rev.current?.set(revShare);
  }, [on, revShare, muteSeq]);
  useEffect(
    () => () => {
      rev.current?.stop();
      rev.current = null;
    },
    [],
  );
}

function Countdown({ secs, totalMs }: { secs: number; totalMs: number }) {
  return (
    <div class={`countdown racer-countdown ${secs <= 5 ? "urgent" : ""}`} style={{ "--p": String(totalMs > 0 ? Math.min(1, (secs * 1000) / totalMs) : 0) }}>
      <span>{secs}</span>
    </div>
  );
}

function Turn({ view, send, secs }: { view: RacerView; send: Send; secs: number }) {
  const q = view.question!;
  const reveal = view.phase === "reveal";
  const correct = new Set(view.correct ?? []);
  const counts = view.answerCounts ?? [];
  const longest = Math.max(0, ...q.options.map(visibleLength));
  const turn = reveal && view.lastTurn?.index === q.index ? view.lastTurn : null;
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <>
      <div class={`racer-question ${visibleLength(q.text) > 160 ? "long" : visibleLength(q.text) > 80 ? "medium" : ""} ${pin ? "is-pin" : ""}`}>
        <h1>
          <Tex text={q.text} />
        </h1>
        {pin ? (
          <PinBoard
            image={pin.image}
            spots={pin.spots}
            labels={q.options}
            correctSpotIndexes={reveal ? [...correct] : undefined}
            revealPickCountsBySpot={reveal ? counts : undefined}
          />
        ) : (
          q.image && <img src={`/${q.image}`} alt="" />
        )}
      </div>
      {view.phase === "intro" && <p class="racer-intro">The car has crashed. Get at least half right to repair it.</p>}
      {view.phase === "confidence" && view.driver && (
        <div class="racer-confidence">
          <div class="racer-driver">
            <Avatar choice={view.driver.avatar} />
            <div>
              <div class="racer-driver-name">{view.driver.nickname} is driving</div>
              <div class="racer-driver-ask">How confident are they in the class?</div>
            </div>
          </div>
          <Lever level={view.lever} />
          <Countdown secs={secs} totalMs={view.phaseDurationMs} />
        </div>
      )}
      {view.phase === "open" && q.type === "text" && <p class="typing-note">Type your answer on your phone</p>}
      {(view.phase === "open" || reveal) && pin && <ProjectorPinNote open={!reveal} labels={[...correct].map((i) => q.options[i]!)} />}
      {(view.phase === "open" || reveal) && !pin && (
        <div class={`tiles racer-tiles n${q.options.length} ${longest > 60 ? "long" : longest > 30 ? "medium" : ""}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            const state = reveal ? (correct.has(i) ? "right" : "wrong") : "";
            return (
              <div key={i} class={`tile opt-${c} ${state}`}>
                <Shape index={c} />
                <span class="tile-text">
                  <Tex text={text} />
                </span>
                {state === "right" && <span class="tick">✓</span>}
                {reveal && q.type !== "text" && <span class="racer-count">{counts[i] ?? 0}</span>}
              </div>
            );
          })}
        </div>
      )}
      {reveal && (
        <div class="racer-result">
          {turn && <ResultBanner turn={turn} stillCrashed={view.car.crashed} />}
          {view.pacing === "manual" && (
            <button class="btn primary next" onClick={() => send({ type: "host.next" })}>
              Next →
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Lever({ level }: { level: RacerView["lever"] }) {
  const stops = [...RACER_CONFIDENCE_LEVELS].reverse();
  const at = level ? stops.indexOf(level) : stops.length - 1;
  return (
    <div class="racer-lever" role="img" aria-label={level ? `Lever: ${RACER_CONFIDENCE[level].label}` : "Lever"}>
      <div class="racer-lever-track">
        <div class="racer-lever-handle" style={{ top: `${((at + 0.5) / stops.length) * 100}%` }} />
      </div>
      <ol class="racer-lever-stops">
        {stops.map((s) => (
          <li key={s} class={s === level ? "on" : ""}>
            <b>{RACER_CONFIDENCE[s].label}</b>
            <span>{RACER_CONFIDENCE[s].needs}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ResultBanner({ turn, stillCrashed }: { turn: RacerTurn; stillCrashed: boolean }) {
  const label = turn.confidence ? RACER_CONFIDENCE[turn.confidence].label : null;
  const pct = turn.total > 0 ? Math.round((turn.correct / turn.total) * 100) : 0;
  const fails = `${turn.fails} fail point${turn.fails === 1 ? "" : "s"}`;
  const withLabel = (text: string) => (label ? `${label}: ${text}` : text);
  let kind = "held";
  let line: string;
  if (turn.gainMph > 0) {
    kind = "gain";
    line = withLabel(`+${turn.gainMph} mph`);
  } else if (turn.crashed) {
    kind = "crash";
    line = withLabel(`${fails} · Crashed!`);
  } else if (turn.fails > 0) {
    kind = "fail";
    line = withLabel(`${fails} · ${Math.round(turn.speedBefore)} → ${Math.round(turn.speedAfter)} mph`);
  } else if (turn.repaired) {
    kind = "gain";
    line = `Repaired · back on the road at ${RACER_REPAIR_MPH} mph`;
  } else if (stillCrashed) {
    kind = "crash";
    line = "Still broken down";
  } else {
    line = label ? `${label}: speed held` : "Speed held";
  }
  return (
    <div class={`racer-banner ${kind}`} role="status">
      <div class="racer-banner-score">
        {turn.correct} of {turn.total} correct ({pct}%)
      </div>
      <div class="racer-banner-outcome">{line}</div>
    </div>
  );
}

function RacerPodium({ view, send }: { view: RacerView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const r = view.result;
  const a = view.awards;
  const players = [...view.players].sort((x, y) => y.correct - x.correct || y.turnsDriven - x.turnsDriven || x.nickname.localeCompare(y.nickname));
  return (
    <main class="podium tower-podium racer-podium">
      <h1>🏁 {(r?.distanceMiles ?? view.car.distanceMiles).toFixed(1)} miles</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="racer-stats">
            Top speed {Math.round(r?.topSpeedMph ?? view.car.topSpeedMph)} mph · Crashes {r?.crashes ?? view.car.crashes} · Questions {r?.turns ?? 0}
          </div>
          <div class="awards">
            <Award icon="✅" title={racerShared.awards.mostCorrect} award={a?.mostCorrect ?? null} unit="correct" />
            {/* As Award, but the value reads "+40 mph". */}
            <div class="award">
              <div class="award-icon" aria-hidden="true">
                🏎
              </div>
              <div>
                <div class="award-title">{racerShared.awards.mostMphGained}</div>
                <div class="award-who">{a?.mostMphGained ? a.mostMphGained.nicknames.join(", ") : "—"}</div>
                {a?.mostMphGained && <div class="award-value">+{a.mostMphGained.value} mph</div>}
              </div>
            </div>
          </div>
          <ul class="racer-players">
            {players.map((p) => (
              <li key={p.id}>
                <Avatar choice={p.avatar} />
                <span class="n">{p.nickname}</span>
                <span class="s">
                  {p.correct} correct · drove {p.turnsDriven}×
                </span>
              </li>
            ))}
          </ul>
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
      <div class="racer-podium-strip">
        <RacerScene theme={view.theme} speed={0} crashed={view.car.crashed} />
      </div>
    </main>
  );
}

function RacerSettings({ settings, send, children }: LobbySettingsProps<"racer">) {
  return (
    <>
      <label class="opt">
        Theme
        <select
          aria-label="Racer theme"
          value={modeTheme("racer", settings?.theme)}
          // checked: the select only offers the season themes, and the server refuses any other (pickTheme)
          onChange={(e) => send({ type: "host.setModeSettings", mode: "racer", settings: { theme: e.currentTarget.value as SeasonTheme } })}
        >
          <option value="christmas">🎄 Neon Noel</option>
          <option value="classic">🏎 Normal</option>
        </select>
      </label>
      {children}
      <span class="opt mode-hint">One car for the whole class. Each turn a driver bets on how well everyone will answer.</span>
    </>
  );
}

export function racerCue(view: RacerView): MusicCue {
  if (view.phase === "podium") return { track: themedTrack("racer", view.theme, "results") };
  const { speedMph, crashed } = view.car;
  return { track: themedTrack("racer", view.theme, "play"), intensity: crashed ? 0.03 : Math.max(0.1, Math.min(1, speedMph / 150)) };
}

export const racerLobby: LobbyModeEntry<"racer"> = {
  label: (settings) => themedLabel("racer", settings?.theme),
  Settings: RacerSettings,
  lobbyTrack: (settings) => themedTrack("racer", settings.theme, "lobby"),
};
