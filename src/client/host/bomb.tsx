import { useEffect, useRef, useState } from "preact/hooks";
import type { BombPhase, BombSettings, HostBombSquad, HostView } from "../../shared/protocol.ts";
import { BombRoom, Casing, Confetti, type BayModule } from "../shared/bomb-art.tsx";
import { play } from "../shared/sounds.ts";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type BombView = Extract<HostView, { kind: "bomb" }>;

/** Projector screen: one shared casing in Together, one smaller casing per squad in Race. */
export function BombStage({ view, send }: { view: BombView; send: Send }) {
  const [shake, setShake] = useState(false);
  const count = useCountdown(view.phase === "countdown" ? view.phaseRemainingMs : 0, `bomb-count-${view.phase}`);
  const tick = useCountdown(view.phase === "defuse" ? view.remainingMs : 0, `bomb-tick-${view.timerRev}`);
  useBombSounds(view);

  useEffect(() => {
    if (view.phase !== "exploded") return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 600);
    return () => clearTimeout(t);
  }, [view.phase]);

  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "defuse" || tick === lastTick.current) return;
    lastTick.current = tick;
    if (tick > 0 && tick <= 10) play(tick <= 3 ? "tickHigh" : "tick");
  }, [tick, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="stage bomb-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">💣 Bomb Squad</div>
        <div class="pill">{view.settings.game === "race" ? "Race" : "Together"}</div>
        <div class="spacer" />
        <div class="pill">
          {view.modulesCleared} / {view.modulesTotal} modules
        </div>
        <div class="spacer" />
        <div class="pill">
          👥 {view.connectedCount}
          {view.connectedCount < view.playerCount && <span class="dim"> / {view.playerCount}</span>}
        </div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <BombPodium view={view} send={send} />
      ) : (
        <main class="bomb-room-wrap">
          <BombRoom exploded={view.phase === "exploded"} shake={shake}>
            {view.settings.game === "race" ? <RaceField view={view} /> : <TogetherBomb view={view} />}
          </BombRoom>
          {view.phase === "countdown" && count > 0 && <div class="bw-count">{count}</div>}
          {view.phase === "exploded" && <div class="bw-boom-text">BOOM! The bomb exploded.</div>}
          {view.phase === "defused" && (
            <>
              <Confetti />
              <div class="bw-boom-text good">{view.headline}</div>
            </>
          )}
        </main>
      )}
    </div>
  );
}

/** Empty bomb in the lobby, so the host can see the casing before anyone joins. */
export function BombLobbyPreview({ settings }: { settings: BombSettings }) {
  const mods = Array.from({ length: settings.modules }, () => ({
    lights: 0,
    total: settings.wires,
    cleared: false,
    active: false,
    panel: "wire" as const,
  }));
  const clock = `${settings.minutes}:00`;
  const race = settings.game === "race";
  const shown = race ? Math.min(3, Math.max(2, settings.squads)) : 1;
  return (
    <div class="bomb-lobby-preview" aria-hidden="true">
      <BombRoom exploded={false} shake={false}>
        {race ? (
          <div class={`bw-race rows-1`}>
            <div class={`bw-race-row n${shown}`}>
              {Array.from({ length: shown }, (_, i) => (
                <Casing key={i} modules={mods.map((mod) => ({ mod }))} clock={clock} name={["Red", "Blue", "Yellow"][i]} />
              ))}
            </div>
          </div>
        ) : (
          <Casing modules={mods.map((mod) => ({ mod }))} clock={clock} />
        )}
      </BombRoom>
    </div>
  );
}

function useBombFace(opts: { remainingMs: number; timerRev: number; ticking: boolean; frozenMs: number | null; exploded: boolean; minutes: number; phase: BombPhase }): { text: string; urgent: boolean } {
  const secs = useCountdown(opts.ticking ? opts.remainingMs : opts.minutes * 60_000, opts.ticking ? `live-${opts.timerRev}` : `hold-${opts.phase}`);
  if (opts.exploded) return { text: "0:00", urgent: false };
  if (!opts.ticking && opts.frozenMs !== null) return { text: formatClock(Math.max(0, Math.round(opts.frozenMs / 1000))), urgent: false };
  if (!opts.ticking) return { text: formatClock(opts.minutes * 60), urgent: false };
  return { text: formatClock(secs), urgent: secs > 0 && secs <= 30 };
}

function useFlashFx(flash: HostBombSquad["flash"]) {
  const [on, setOn] = useState<HostBombSquad["flash"]>(null);
  const seq = flash?.seq ?? 0;
  useEffect(() => {
    if (!flash) return;
    setOn(flash);
    const t = setTimeout(() => setOn(null), 700);
    return () => clearTimeout(t);
  }, [seq]);
  return on;
}

function popText(flash: HostBombSquad["flash"]): string | null {
  if (!flash) return null;
  if (flash.kind === "wrong") return `−${flash.penaltySec ?? 0} s`;
  if (flash.kind === "module") return "Module clear!";
  return "Snip!";
}

type Flash = NonNullable<HostBombSquad["flash"]>;

/**
 * Each squad's newest flash, for 700ms. flashSeq counts per squad, so seqs are only compared within a squad.
 * The map's last entry is the most recent flash. Flashes already on screen when the projector opens are skipped.
 */
function useSquadFlashes(squads: HostBombSquad[]): Map<number, Flash> {
  const seen = useRef<Map<number, number> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [on, setOn] = useState(() => new Map<number, Flash>());
  const key = squads.map((s) => `${s.index}:${s.flash?.seq ?? 0}`).join(",");
  useEffect(() => {
    const first = seen.current === null;
    const last = (seen.current ??= new Map());
    const fresh: [number, Flash][] = [];
    for (const s of squads) {
      const seq = s.flash?.seq ?? 0;
      if (!first && s.flash && seq !== last.get(s.index)) fresh.push([s.index, s.flash]);
      last.set(s.index, seq);
    }
    if (fresh.length === 0) return;
    setOn((prev) => {
      const next = new Map(prev);
      for (const [i, f] of fresh) {
        next.delete(i);
        next.set(i, f);
      }
      return next;
    });
    const t = setTimeout(() => {
      timers.current.delete(t);
      setOn((prev) => {
        const next = new Map(prev);
        for (const [i, f] of fresh) if (next.get(i) === f) next.delete(i);
        return next;
      });
    }, 700);
    timers.current.add(t);
  }, [key]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return on;
}

function TogetherBomb({ view }: { view: BombView }) {
  const squad = view.squads[0];
  const face = useBombFace({
    remainingMs: squad?.remainingMs ?? view.remainingMs,
    timerRev: squad?.timerRev ?? view.timerRev,
    ticking: view.phase === "defuse",
    frozenMs: view.phase === "defused" ? view.timeLeftMs : null,
    exploded: view.phase === "exploded",
    minutes: view.settings.minutes,
    phase: view.phase,
  });
  const flashes = useSquadFlashes(view.squads);
  const fx = [...flashes.values()].pop() ?? null;
  const single = view.squads.length === 1 ? view.squads[0] : undefined;
  const modules: BayModule[] = view.squads.flatMap((s) =>
    s.modules.map((mod) => ({
      mod,
      color: view.squads.length > 1 ? s.color : undefined,
      image: single && mod.active && mod.panel === "picture" ? single.question?.image : undefined,
      spark: mod.active && !!flashes.get(s.index) && flashes.get(s.index)!.kind !== "wrong",
      redLed: mod.active && flashes.get(s.index)?.kind === "wrong",
    })),
  );
  const q = single?.question;
  const picture = modules.some((m) => m.image);
  return (
    <>
      <Casing modules={modules} clock={face.text} urgent={face.urgent} pop={popText(fx)} />
      {view.squads.length > 1 && (
        <div class="bw-legend">
          {view.squads.map((s) => (
            <span key={s.index} style={{ color: s.color }}>
              {s.name}
              {s.finished ? " ✓" : ""}
            </span>
          ))}
        </div>
      )}
      {q && (
        <div class="bw-question">
          {q.image && !picture && <img src={`/${q.image}`} alt="" />}
          <p>{q.text}</p>
          {q.reveal && <p class="bw-reveal">Answer: {q.reveal.join(", ")}</p>}
        </div>
      )}
    </>
  );
}

function raceRows(squads: HostBombSquad[]): HostBombSquad[][] {
  const per = squads.length === 4 ? 2 : 3;
  const rows: HostBombSquad[][] = [];
  for (let i = 0; i < squads.length; i += per) rows.push(squads.slice(i, i + per));
  return rows;
}

function RaceField({ view }: { view: BombView }) {
  const rows = raceRows(view.squads);
  return (
    <div class={`bw-race rows-${rows.length}`}>
      {rows.map((row, i) => (
        <div key={i} class={`bw-race-row n${row.length}`}>
          {row.map((s) => (
            <RaceBomb key={s.index} squad={s} view={view} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RaceBomb({ squad, view }: { squad: HostBombSquad; view: BombView }) {
  const face = useBombFace({
    remainingMs: squad.remainingMs,
    timerRev: squad.timerRev,
    ticking: view.phase === "defuse" && !squad.finished && !squad.exploded,
    frozenMs: squad.finished ? squad.remainingMs : null,
    exploded: squad.exploded || view.phase === "exploded",
    minutes: view.settings.minutes,
    phase: view.phase,
  });
  const fx = useFlashFx(squad.flash);
  const modules: BayModule[] = squad.modules.map((mod) => ({
    mod,
    spark: !!fx && fx.kind !== "wrong" && mod.active,
    redLed: !!fx && fx.kind === "wrong" && mod.active,
  }));
  return <Casing modules={modules} clock={face.text} urgent={face.urgent} pop={popText(fx)} name={squad.name} />;
}

function useBombSounds(view: BombView) {
  const prev = useRef<BombView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "defuse" && p.phase === "countdown") play("start");
      if (view.phase === "defused") play("defuse");
      if (view.phase === "exploded") play("explosion");
      // The explosion already played on the exploded screen; only a defused bomb gets the fanfare.
      if (view.phase === "podium" && view.outcome === "defused") play("fanfare");
    }
    for (const s of view.squads) {
      const was = p.squads.find((o) => o.index === s.index)?.flash?.seq ?? 0;
      const seq = s.flash?.seq ?? 0;
      if (seq > was && s.flash) {
        if (s.flash.kind === "wrong") play("wrongWire");
        else if (s.flash.kind === "module") play("moduleChime");
        else {
          play("snip");
          play("spark");
        }
      }
    }
  }, [view]);
}

function BombPodium({ view, send }: { view: BombView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const awards = view.awards;
  const race = view.settings.game === "race";
  const ranked = [...view.squads].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.index - b.index);
  return (
    <main class={`podium bomb-podium ${view.outcome === "defused" ? "good" : "bad"}`}>
      <h1>{view.headline}</h1>
      {race && (
        <ol class="bw-places">
          {ranked.map((s) => (
            <li key={s.index} style={{ "--team": s.color }}>
              <span>{s.rank ? ordinal(s.rank) : ""}</span>
              <b>{s.name}</b>
              <span>{s.finished ? `defused · ${formatClock(Math.round(s.remainingMs / 1000))} left` : "exploded"}</span>
              <span>
                {s.modulesCleared}/{view.settings.modules} modules
              </span>
            </li>
          ))}
        </ol>
      )}
      <div class="awards">
        <Award icon="✂️" title="Steady Hands" award={awards?.steadyHands ?? null} unit="right cuts" />
        <Award icon="🧤" title="Careful Cutter" award={awards?.carefulCutter ?? null} unit="wrong cuts" />
        <Award icon="🤝" title="Team Player" award={awards?.teamPlayer ?? null} unit="first-try wires" />
      </div>
      {showErrors && <ErrorsTable errors={view.errors ?? []} />}
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
