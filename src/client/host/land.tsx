import { useEffect, useRef, useState } from "preact/hooks";
import type { HostLandTeam, HostView } from "../../shared/protocol.ts";
import { HexBoard } from "../shared/land-art.tsx";
import { play } from "../shared/sounds.ts";
import { useEventFlash } from "../shared/tower-art.tsx";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type LandView = Extract<HostView, { kind: "land" }>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Projector screen for Land Grab: countdown → the land → podium. */
export function LandStage({ view, send }: { view: LandView; send: Send }) {
  const secs = useCountdown(view.remainingMs, view.phase);
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (view.phase === prevPhase.current) return;
    prevPhase.current = view.phase;
    if (view.phase === "playing") play("start");
    if (view.phase === "podium") play("fanfare");
  }, [view.phase]);

  const placed = useEventFlash(view.lastPlace, view.lastPlace?.seq, 600);
  const capture = useEventFlash(view.lastCapture, view.lastCapture?.seq, 4000);
  useEffect(() => void (placed && play("plant")), [placed?.seq]);
  useEffect(() => void (capture && play(capture.knockedOut.length ? "conquer" : "capture")), [capture?.seq]);

  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "playing" || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 10) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const teamName = (i: number) => `Team ${view.teams[i]?.name ?? "?"}`;
  const alive = view.teams.filter((t) => !t.out);
  let banner: string | null = null;
  if (view.phase === "conquered" && alive[0]) banner = `👑 ${teamName(alive[0].index)} rules the whole land!`;
  else if (capture?.knockedOut.length) banner = `💥 ${teamName(capture.team)} surrounded ${capture.knockedOut.map(teamName).join(" and ")}! Their players switch sides`;
  else if (capture) banner = `🚩 ${capture.nickname} closed the ring: ${teamName(capture.team)} takes ${plural(capture.tiles.length, "tile")}`;

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🚩 Land Grab</div>
        <div class="spacer" />
        {view.phase === "playing" && <div class={`tower-clock ${secs <= 30 ? "urgent" : ""}`}>{formatClock(secs)}</div>}
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <LandPodium view={view} send={send} />
      ) : (
        <main class="land-wrap">
          <div class="land-board">
            <HexBoard board={view.board} placed={placed} capture={capture} />
          </div>
          <aside class="land-side">
            {view.teams.map((t) => (
              <TeamCard key={t.index} team={t} leading={!t.out && t.rank === 1 && t.tiles > 1} by={t.conqueredBy === null ? null : teamName(t.conqueredBy)} />
            ))}
          </aside>
          {banner && (
            <div class={`monster-banner land-banner ${capture?.knockedOut.length || view.phase === "conquered" ? "attack" : ""}`} key={banner}>
              {banner}
            </div>
          )}
          {view.phase === "countdown" && (
            <div class="countdown-overlay">
              <div class="countdown-label">Answer questions on your phone to earn tiles. Surround land to capture it!</div>
              <div class="countdown-num" key={secs}>
                {Math.max(1, secs)}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function TeamCard({ team, leading, by }: { team: HostLandTeam; leading: boolean; by: string | null }) {
  return (
    <section class={`land-team ${team.out ? "out" : ""}`} style={{ "--team": team.color }}>
      <header>
        <span class="land-team-name">
          {leading && <span aria-label="Leading">👑 </span>}
          Team {team.name}
        </span>
        {team.out ? (
          <span class="land-team-out">joined {by}</span>
        ) : (
          <span class="land-team-tiles">
            <b>{team.tiles}</b> tile{team.tiles === 1 ? "" : "s"}
          </span>
        )}
      </header>
      {!team.out && (
        <ul class="tower-members">
          {team.members.map((m) => (
            <li key={m.id} class={`${m.connected ? "" : "offline"} ${m.claiming ? "building" : ""}`}>
              {m.claiming && <span aria-label="placing tiles">🚩</span>}
              {m.nickname}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LandPodium({ view, send }: { view: LandView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const ranked = [...view.teams].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const places = [
    { team: ranked[1], cls: "second" },
    { team: ranked[0], cls: "first" },
    { team: ranked[2], cls: "third" },
  ];
  const score = (t: HostLandTeam) => (t.out ? `surrounded by Team ${view.teams[t.conqueredBy ?? 0]?.name}` : plural(t.tiles, "tile"));
  const a = view.awards;
  return (
    <main class="podium tower-podium land-podium">
      <div class="podium-bg" aria-hidden="true">
        <HexBoard board={view.board} />
      </div>
      <h1>🏆 Land Grab</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="podium-blocks">
            {places.map(({ team, cls }) =>
              team ? (
                <div key={cls} class={`place ${cls}`} style={{ "--team": team.color }}>
                  <div class="place-name">Team {team.name}</div>
                  <div class="place-score">{score(team)}</div>
                  <div class="place-block team-block">{ordinal(team.rank)}</div>
                </div>
              ) : (
                <div key={cls} class={`place ${cls} empty`} />
              ),
            )}
          </div>
          {ranked.length > 3 && (
            <ol class="rest">
              {ranked.slice(3).map((t) => (
                <li key={t.index}>
                  <span>
                    {ordinal(t.rank)} Team {t.name}
                  </span>
                  <span>{score(t)}</span>
                </li>
              ))}
            </ol>
          )}
          <div class="awards">
            <Award icon="🎯" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="🚩" title="Top settler" award={a?.topSettler ?? null} unit="tiles placed" />
            <Award icon="🪢" title="Master surrounder" award={a?.topSurrounder ?? null} unit="tiles surrounded" />
          </div>
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
