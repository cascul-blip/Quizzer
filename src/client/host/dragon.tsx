import { useEffect, useRef, useState } from "preact/hooks";
import type { HostDragonTeam, HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { CaveBackdrop, Dragon, FireBreath, Hoard, JackpotPile, LootIcon, RuneShield, TeamBanner, TeamPile } from "../shared/dragon-art.tsx";
import { PinBoard } from "../shared/pin.tsx";
import { play } from "../shared/sounds.ts";
import { Shape, formatClock, optionColor, ordinal, teamVars, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type DragonView = Extract<HostView, { kind: "dragon" }>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Dragon slain in 3:42!" or "The dragon escaped!" */
function dragonVerdict(slain: boolean, slainMs: number | null): string {
  return slain && slainMs !== null ? `Dragon slain in ${formatClock(Math.round(slainMs / 1000))}!` : "The dragon escaped!";
}

/** Projector screen for Dragon's Hoard: countdown → battle (with fire breath) → transition → scramble → podium. */
export function DragonStage({ view, send }: { view: DragonView; send: Send }) {
  const act1 = view.phase === "countdown" || view.phase === "battle" || view.phase === "fire";
  // The battle clock keeps running through fire breath, so it only resets per act.
  const clock = useCountdown(view.remainingMs, act1 && view.phase !== "countdown" ? "battle" : view.phase);
  useDragonSounds(view);

  const lastTick = useRef(-1);
  useEffect(() => {
    if ((view.phase !== "battle" && view.phase !== "scramble") || clock === lastTick.current) return;
    lastTick.current = clock;
    if (clock > 0 && clock <= 10) play(clock <= 3 ? "tickHigh" : "tick");
  }, [clock, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const timed = view.phase === "battle" || view.phase === "fire" || view.phase === "scramble";
  return (
    <div class="stage dragon-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🐉 Dragon's Hoard</div>
        {act1 ? <div class="pill">⚔️ Slay the dragon</div> : view.phase !== "podium" && <div class="pill">💰 Hoard scramble</div>}
        <div class="spacer" />
        {timed && <div class={`tower-clock ${clock <= 30 ? "urgent" : ""}`}>{formatClock(clock)}</div>}
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
        <DragonPodium view={view} send={send} />
      ) : (
        <main class={`dragon-wrap phase-${view.phase}`}>
          <CaveBackdrop scattered={view.phase === "scramble"} escaped={view.escaped && view.phase === "transition"} />
          {act1 && <Battle view={view} />}
          {view.phase === "transition" && <Transition view={view} />}
          {view.phase === "scramble" && <Scramble view={view} />}
        </main>
      )}
    </div>
  );
}

function useDragonSounds(view: DragonView) {
  const prev = useRef<DragonView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if ((view.hits.at(-1)?.seq ?? 0) > (p.hits.at(-1)?.seq ?? 0)) play("sword");
    if (view.maxStage > p.maxStage) play("dragonRoar");
    const f = view.fire;
    if (f && (f.seq !== p.fire?.seq || f.step !== p.fire?.step)) {
      if (f.step === "warning") play("rumble");
      if (f.step === "reveal") {
        play("fireWhoosh");
        if (f.held) setTimeout(() => play("shieldClang"), 250);
      }
    }
    if (view.phase !== p.phase) {
      if (view.phase === "battle" && p.phase === "countdown") play("start");
      if (view.phase === "transition") {
        play(view.slain ? "dragonRoar" : "fireWhoosh");
        setTimeout(() => play("coins"), 900);
      }
      if (view.phase === "scramble") play("start");
      if (view.phase === "podium") play("fanfare");
    }
    const lastSeq = p.events.at(-1)?.seq ?? 0;
    const fresh = view.events.filter((e) => e.seq > lastSeq);
    const e = fresh.at(-1);
    if (e) play(e.kind === "jackpot" ? "jackpot" : e.kind === "trap" ? "trapHiss" : e.kind === "blocked" ? "shieldClang" : "coins");
  }, [view]);
}

// ---------- Act 1 ----------

function HealthBar({ view }: { view: DragonView }) {
  const pct = view.maxHealth > 0 ? (view.health / view.maxHealth) * 100 : 0;
  return (
    <div class={`dragon-health stage-${view.stage}`}>
      <div class="dragon-health-fill" style={{ width: `${pct}%` }} />
      <div class="dragon-health-label">
        🐉 {view.health} / {view.maxHealth}
      </div>
    </div>
  );
}

function Battle({ view }: { view: DragonView }) {
  const f = view.fire;
  const fireSecs = useCountdown(view.nextFireMs ?? 0, `fire-in-${view.phase}-${view.maxStage}`);
  const countdown = useCountdown(view.phaseRemainingMs, `step-${view.phase}`);
  const rearing = f && f.step !== "reveal";
  const dragonCls = [
    view.phase === "countdown" ? "asleep" : "",
    rearing ? "rearing" : "",
    f?.step === "reveal" ? (f.held ? "flinch" : "glow") : "",
  ].join(" ");
  return (
    <>
      {view.phase !== "countdown" && <HealthBar view={view} />}
      {view.phase === "battle" && view.nextFireMs !== null && fireSecs <= 10 && <div class="dragon-next-fire">🔥 Fire breath in {fireSecs}s</div>}
      <div class="lair">
        <Dragon stage={view.stage} asleep={view.phase === "countdown"} mouth={rearing ? (f.step === "question" ? 1 : 0.6) : 0} class={dragonCls}>
          {rearing ? <div class="fire-building" /> : f?.step === "reveal" ? <FireBreath class={f.held ? "bounced" : "through"} /> : null}
        </Dragon>
      </div>
      {f && f.step !== "warning" && <RuneShield class={f.step === "reveal" ? (f.held ? "held" : "broken") : "raised"} />}
      <HitStrip view={view} />
      {f && <FireOverlay view={view} />}
      {view.phase === "countdown" && (
        <div class="countdown-overlay dragon-countdown">
          <div class="countdown-label">
            A dragon sleeps on a mountain of gold. Wake it and fight it together!
            <br />
            Every right answer is a hit. When it breathes fire, everyone answers the same question to raise the Shield of Faith.
          </div>
          <div class="countdown-num" key={countdown}>
            {Math.max(1, countdown)}
          </div>
        </div>
      )}
    </>
  );
}

/** Avatars flash in at the bottom with a sword slash, one per hit (only the most recent few). */
function HitStrip({ view }: { view: DragonView }) {
  // Only hits that arrive while this screen is up flash; a reload shows the strip as it is.
  const seen = useRef<number | null>(null);
  const first = seen.current === null;
  if (first) seen.current = view.hits.at(-1)?.seq ?? 0;
  return (
    <ul class="dragon-hits" aria-label="Latest hits">
      {view.hits.map((h) => (
        <li key={h.seq} class={!first && h.seq > (seen.current ?? 0) ? "fresh" : ""}>
          <Avatar choice={h.avatar} />
          <span class="slash" aria-hidden="true" />
          <span class="hit-name">{h.nickname}</span>
        </li>
      ))}
    </ul>
  );
}

function FireOverlay({ view }: { view: DragonView }) {
  const f = view.fire!;
  const secs = useCountdown(view.phaseRemainingMs, `fire${f.seq}-${f.step}`);
  if (f.step === "warning") {
    return (
      <div class="dragon-warning" role="alert">
        <div class="dragon-warning-icon">🔥</div>
        <div>The dragon is about to breathe fire!</div>
        <div class="dragon-warning-sub">Raise the Shield of Faith!</div>
      </div>
    );
  }
  const q = f.question!;
  const reveal = f.step === "reveal";
  const correct = new Set(f.correct ?? []);
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <div class={`rune-panel ${reveal ? "reveal" : ""}`}>
      <div class="rune-head">
        <span class="rune-tag">Shield of Faith</span>
        {reveal ? (
          <span class={`rune-verdict ${f.held ? "good" : "bad"}`}>
            {f.held ? `🛡 Shield held! ${f.right} got it right, ${f.needed} needed. −${f.amount} health` : `🔥 The fire got through! ${f.right} got it right, ${f.needed} needed. The dragon heals +${f.amount}`}
          </span>
        ) : (
          <span class="rune-count">
            {f.answered} / {f.total} answered · <b class={secs <= 5 ? "urgent" : ""}>{secs}s</b>
          </span>
        )}
      </div>
      <h1 class="rune-text">{q.text}</h1>
      {pin ? (
        <div class="rune-pin">
          <PinBoard image={pin.image} spots={pin.spots} labels={q.options} correct={reveal ? [...correct] : undefined} counts={reveal ? (f.answerCounts ?? undefined) : undefined} />
        </div>
      ) : q.type === "text" ? (
        <p class="typing-note">{reveal ? `Answer: ${q.options.join(" / ")}` : "Type your answer on your phone"}</p>
      ) : (
        <div class={`tiles n${q.options.length}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            const state = reveal ? (correct.has(i) ? "right" : "wrong") : "";
            return (
              <div key={i} class={`tile opt-${c} ${state}`}>
                <Shape index={c} />
                <span class="tile-text">{text}</span>
                {reveal && <span class="tile-count">{f.answerCounts?.[i] ?? 0}</span>}
                {state === "right" && <span class="tick">✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- transition ----------

function Transition({ view }: { view: DragonView }) {
  return (
    <>
      <div class="lair">
        {/* The slain dragon lies on its own gold; an escaping one leaves half the hoard behind. */}
        {!view.slain && <Hoard size="half" />}
        <Dragon stage={view.stage} slain={view.slain} class={view.slain ? "crash" : "fly-away"} />
        <div class="coin-burst" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} style={{ "--a": `${(i / 24) * 360}deg`, "--d": `${(i % 6) * 60}ms` }} />
          ))}
        </div>
      </div>
      <div class="transition-text">
        <h1>{view.slain ? `⚔️ ${dragonVerdict(true, view.result?.slainMs ?? null)}` : "🐉 The dragon woke up and flew away with half its hoard!"}</h1>
        <p>{view.teams.length > 1 ? "The hoard spills across the cave. Grab as much as your team can!" : "The hoard spills across the cave. Grab as much as you can!"}</p>
      </div>
      <div class="banner-drop">
        {view.teams.map((t, i) => (
          <div key={t.index} class="banner-drop-team" style={{ animationDelay: `${600 + i * 250}ms` }}>
            <TeamBanner color={t.color} name={`Team ${t.name}`} />
            <ul>
              {t.members.map((m) => (
                <li key={m.id}>{m.nickname}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Act 2 ----------

function Scramble({ view }: { view: DragonView }) {
  const leader = [...view.teams].sort((a, b) => a.rank - b.rank)[0];
  return (
    <>
      <div class="scramble-teams">
        {view.teams.map((t) => (
          <TeamColumn key={t.index} team={t} leading={view.teams.length > 1 && t.rank === 1 && t.gold > 0 && leader?.index === t.index} />
        ))}
      </div>
      <div class="jackpot">
        <JackpotPile />
        <div class="jackpot-label">
          <b>💎 Jackpot</b> {view.jackpot} gold
          {view.jackpotLocked && <span class="jackpot-lock">🔒 opens after the first minute</span>}
        </div>
      </div>
      {view.escaped && <div class="dragon-half-note">The dragon escaped: Coins and Big pile pay half</div>}
      <ul class="dragon-events">
        {view.events.map((e) => (
          <li key={e.seq} class={`dragon-event ${e.kind}`} style={teamVars(view.teams[e.team]?.color ?? "#888")}>
            <LootIcon kind={e.kind === "jackpot" ? "jackpot" : e.kind === "trap" ? "trap" : e.kind === "blocked" ? "scale" : "grab10"} />
            {eventText(view, e)}
          </li>
        ))}
      </ul>
    </>
  );
}

function eventText(view: DragonView, e: DragonView["events"][number]): string {
  const team = (i: number | null) => `Team ${view.teams[i ?? -1]?.name ?? "?"}`;
  switch (e.kind) {
    case "grab":
      return `${e.nickname} grabbed ${e.gold} gold from ${team(e.target)}!`;
    case "blocked":
      return `${e.nickname} tried to grab from ${team(e.target)}: blocked by a dragon scale!`;
    case "trap":
      return `The dragon's last breath! ${team(e.team)} lost ${e.gold} gold to the Jackpot`;
    case "jackpot":
      return `JACKPOT for ${team(e.team)}! +${e.gold} gold (${e.nickname})`;
  }
}

function TeamColumn({ team, leading }: { team: HostDragonTeam; leading: boolean }) {
  return (
    <section class="scramble-team" style={teamVars(team.color)}>
      <TeamBanner color={team.color} name={`${leading ? "👑 " : ""}Team ${team.name}`} />
      <div class="scramble-gold">
        <b>{team.gold}</b> gold
      </div>
      <div class="scramble-pile">
        <TeamPile color={team.color} gold={team.gold} />
        {team.scales > 0 && (
          <span class="pile-shield" title="Dragon scale: blocks the next grab">
            🛡{team.scales > 1 ? ` ×${team.scales}` : ""}
          </span>
        )}
        {team.protectedMs > 0 && <span class="pile-cooldown" title="Just grabbed from: safe for a moment" />}
      </div>
      <ul class="tower-members">
        {team.members.map((m) => (
          <li key={m.id} class={m.connected ? "" : "offline"}>
            {m.nickname}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- podium ----------

function DragonPodium({ view, send }: { view: DragonView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const ranked = [...view.teams].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const winners = ranked.filter((t) => t.rank === 1);
  const r = view.result;
  const solo = view.teams.length === 1;
  const title = solo
    ? `💰 ${ranked[0]!.gold} gold collected!`
    : winners.length === 1
      ? `🏆 Team ${winners[0]!.name} wins!`
      : `🏆 ${winners.map((t) => `Team ${t.name}`).join(" & ")} share the win!`;
  const places = [
    { team: ranked[1], cls: "second" },
    { team: ranked[0], cls: "first" },
    { team: ranked[2], cls: "third" },
  ];
  const a = view.awards;
  return (
    <main class="podium tower-podium dragon-podium">
      <div class="podium-bg" aria-hidden="true">
        <CaveBackdrop scattered />
      </div>
      <h1>{title}</h1>
      <p class={`dragon-verdict ${r?.slain ? "good" : "bad"}`}>
        {r?.slain ? `⚔️ ${dragonVerdict(true, r.slainMs)}` : `🐉 ${dragonVerdict(false, null)}`}
        {r && (r.runeHeld > 0 || r.runeFailed > 0) && (
          <span class="dim">
            {" "}
            · Shield of Faith held {plural(r.runeHeld, "time")}, failed {plural(r.runeFailed, "time")}
          </span>
        )}
      </p>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          {!solo && (
            <div class="podium-blocks">
              {places.map(({ team, cls }) =>
                team ? (
                  <div key={cls} class={`place ${cls}`} style={teamVars(team.color)}>
                    <div class="place-name">Team {team.name}</div>
                    <div class="place-score">{team.gold} gold</div>
                    <div class="place-block team-block">{ordinal(team.rank)}</div>
                  </div>
                ) : (
                  <div key={cls} class={`place ${cls} empty`} />
                ),
              )}
            </div>
          )}
          {ranked.length > 3 && (
            <ol class="rest">
              {ranked.slice(3).map((t) => (
                <li key={t.index}>
                  <span>
                    {ordinal(t.rank)} Team {t.name}
                  </span>
                  <span>{t.gold} gold</span>
                </li>
              ))}
            </ol>
          )}
          <div class="awards dragon-awards">
            <Award icon="⚔️" title="Dragon slayer" award={a?.dragonSlayer ?? null} unit="" valueText={(n) => plural(n, "hit")} />
            <Award icon="🛡" title="Faithful Defender" award={a?.runeMaster ?? null} unit="" valueText={(n) => `${n} Shield of Faith right`} />
            <Award icon="🖐️" title="Master thief" award={a?.masterThief ?? null} unit="gold grabbed" />
            <Award icon="🎯" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
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
