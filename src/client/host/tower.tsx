import { useEffect, useRef } from "preact/hooks";
import { EGG_LEVELS_ABOVE, MONSTER_DAMAGE, type HostTowerTeam, type HostView, type MonsterAttack, type MonsterEggs } from "../../shared/protocol.ts";
import { play } from "../shared/sounds.ts";
import {
  BuildingBlock,
  Crane,
  EggCell,
  MonsterSvg,
  useEventFlash,
  DustPuff,
  FloorSparkle,
  METERS_PER_FLOOR,
  RoofFlag,
  SKY_STAGES,
  SkylineSvg,
  Tree,
  hash01,
  skyStage,
  useFreshKeys,
  useNewFloor,
} from "../shared/tower-art.tsx";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";
import { ScreenControls, toggleFullscreen, type Send } from "./common.tsx";

type TowerView = Extract<HostView, { kind: "tower" }>;

/** Projector screen for Tallest Tower: countdown → live towers → podium. */
export function TowerStage({ view, send }: { view: TowerView; send: Send }) {
  const secs = useCountdown(view.remainingMs, view.phase);
  const prev = useRef<TowerView | null>(null);
  const totalFloors = view.teams.reduce((n, t) => n + t.floors, 0);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "playing") play("start");
      if (view.phase === "podium") play("fanfare");
      return;
    }
    const pFloors = p.teams.reduce((n, t) => n + t.floors, 0);
    if (totalFloors > pFloors) play("floor");
    else if (view.dropCount > p.dropCount) play("thud");
  }, [view]);

  // Monster: replay each new attack once (~3.4 s), announce new eggs.
  const attack = useEventFlash(view.lastAttack, view.lastAttack?.seq, 3600);
  const eggNews = useEventFlash(view.egg, view.egg?.seq, 4000);
  useEffect(() => void (attack && play("roar")), [attack?.seq]);
  useEffect(() => void (eggNews && play("rumble")), [eggNews?.seq]);
  const monsterSecs = useCountdown(view.nextMonsterMs ?? 0, `m${Math.round((performance.now() + (view.nextMonsterMs ?? 0)) / 2000)}`);
  const teamName = (i: number) => `Team ${view.teams[i]?.name ?? "?"}`;
  let banner: string | null = null;
  if (attack) banner = `🐣 ${teamName(attack.byTeam)} hatched the monster! It smashed ${teamName(attack.target)} (−${MONSTER_DAMAGE} floors)`;
  else if (eggNews) banner = `👾 Monster eggs appeared, ${EGG_LEVELS_ABOVE} levels above each tower! First team to land a block on its egg hatches the monster`;

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

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🏗 Tallest Tower</div>
        <div class="spacer" />
        {view.phase === "playing" && <div class={`tower-clock ${secs <= 30 ? "urgent" : ""}`}>{formatClock(secs)}</div>}
        {view.phase === "playing" && view.egg && <div class="pill monster-pill">🥚 Egg is out!</div>}
        {view.phase === "playing" && !view.egg && view.nextMonsterMs !== null && (
          <div class="pill monster-pill" title="Next monster egg">
            👾 {formatClock(monsterSecs)}
          </div>
        )}
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
        <TowerPodium view={view} send={send} />
      ) : (
        <main class={`towers-wrap scene scene-drop ${attack ? "shake" : ""}`}>
          <Scene teams={view.teams} phase={view.phase} egg={view.egg} attack={attack} />
          {banner && (
            <div class={`monster-banner ${attack ? "attack" : ""}`} key={banner}>
              {banner}
            </div>
          )}
          {view.phase === "countdown" && (
            <div class="countdown-overlay">
              <div class="countdown-label">Answer questions on your phone to earn blocks!</div>
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

const UNIT = 10;
/** Margin beside each tower for trees and the height scale. */
const SIDE = 9;

interface MonsterProps {
  egg?: MonsterEggs | null;
  attack?: MonsterAttack | null;
}

function Scene({ teams, phase, egg, attack }: { teams: HostTowerTeam[]; phase: TowerView["phase"] } & MonsterProps) {
  const tallest = Math.max(0, ...teams.map((t) => t.floors));
  return (
    <>
      <Sky stage={skyStage(tallest)} />
      <div class="scene-main">
        <Towers teams={teams} phase={phase} egg={egg} attack={attack} />
        <div class="street" aria-hidden="true" />
        <div class="members-row">
          {teams.map((t) => (
            <ul key={t.index} class="tower-members" style={{ "--team": t.color }}>
              {t.members.map((m) => (
                <li key={m.id} class={`${m.connected ? "" : "offline"} ${m.building ? "building" : ""}`}>
                  {m.building && <span aria-label="building">🔨</span>}
                  {m.nickname}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </>
  );
}

function Sky({ stage }: { stage: number }) {
  return (
    <div class="sky" aria-hidden="true">
      {SKY_STAGES.map((st, i) => (
        <div key={st.name} class={`sky-layer ${i === stage ? "on" : ""}`} style={{ background: `linear-gradient(${st.top}, ${st.bottom})` }} />
      ))}
      <svg class={`stars ${stage >= 3 ? "on" : ""} ${stage >= 4 ? "bright" : ""}`} viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 70 }, (_, i) => (
          <circle key={i} cx={hash01(i, 11) * 1000} cy={hash01(i, 12) * 420} r={0.8 + hash01(i, 13) * 1.6} class={i % 3 === 0 ? "twinkle" : ""} style={{ animationDelay: `${hash01(i, 14) * 3}s` }} />
        ))}
      </svg>
      <div class={`clouds ${stage <= 2 ? "on" : ""}`}>
        {[0, 1, 2].map((i) => (
          <svg key={i} class={`cloud c${i}`} viewBox="0 0 120 50">
            <circle cx="30" cy="32" r="18" />
            <circle cx="55" cy="22" r="22" />
            <circle cx="82" cy="30" r="17" />
            <rect x="28" y="30" width="58" height="20" rx="10" />
          </svg>
        ))}
      </div>
    </div>
  );
}

function Towers({ teams, phase, egg, attack }: { teams: HostTowerTeam[]; phase: TowerView["phase"] } & MonsterProps) {
  // One shared vertical scale so heights compare fairly between teams (egg and smashed blocks included).
  const rows = Math.max(8, ...teams.map((t) => Math.max(...t.columns) + 2), egg ? Math.max(...egg.cells.map((c) => c.row)) + 2 : 0, attack ? Math.max(...attack.before) + 1 : 0);
  const leader = Math.max(...teams.map((t) => t.floors));
  return (
    <div class={`towers n${teams.length}`}>
      <SkylineSvg />
      {teams.map((t) => (
        <section key={t.index} class="tower-col" style={{ "--team": t.color }}>
          <header class="tower-chip">
            <div class="tower-name">
              {t.floors > 0 && t.floors === leader && <span aria-label="Leading">👑 </span>}
              Team {t.name}
            </div>
            <div class="tower-floors">
              <b>{t.floors}</b> floor{t.floors === 1 ? "" : "s"}
            </div>
          </header>
          <div class="tower-art">
            <TowerSvg team={t} rows={rows} phase={phase} egg={egg} attack={attack?.target === t.index ? attack : null} />
          </div>
          {attack?.target === t.index && (
            <div class="monster-stage" key={attack.seq}>
              <MonsterSvg />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function TowerSvg({ team, rows, phase, egg, attack }: { team: HostTowerTeam; rows: number; phase: TowerView["phase"] } & MonsterProps) {
  const isFresh = useFreshKeys();
  const newFloor = useNewFloor(team.floors);
  const W = 3 * UNIT + 2 * SIDE;
  const H = rows * UNIT;
  const blocks = [];
  const puffs = [];
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < team.columns[c]!; r++) {
      const key = `${c}-${r}`;
      const x = SIDE + c * UNIT;
      const y = H - (r + 1) * UNIT;
      const fresh = isFresh(key);
      blocks.push(
        <BuildingBlock key={key} x={x} y={y} size={UNIT} color={team.color} team={team.index} col={c} row={r} fullFloor={r < team.floors} fresh={fresh} />,
      );
      if (fresh) puffs.push(<DustPuff key={`p${key}`} x={x + UNIT / 2} y={y + UNIT} size={UNIT} />);
    }
  }
  // Labels grow with the tower so they stay readable as the scale shrinks.
  const labelSize = 2.6 * Math.max(1, rows / 12);
  const marks = [];
  for (let f = 5; f < rows; f += 5) {
    const y = H - f * UNIT;
    marks.push(
      <g key={f} class="mark">
        <line x1={SIDE - 1.5} x2={W - SIDE + 1.5} y1={y} y2={y} />
        <text x={SIDE - 2} y={y + labelSize * 0.35} text-anchor="end" font-size={labelSize}>
          {f * METERS_PER_FLOOR} m
        </text>
      </g>,
    );
  }
  // Crane (while building) or flag (at the end) on the tallest column.
  const top = Math.max(...team.columns);
  const topCol = team.columns.indexOf(top);
  const roofX = SIDE + topCol * UNIT + UNIT / 2;
  const roofY = H - top * UNIT;
  return (
    <svg class="tower-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={`Team ${team.name}: ${team.floors} floors`}>
      {marks}
      <Tree x={SIDE / 2 - 0.5} y={H} size={7} seed={team.index * 2} />
      <Tree x={W - SIDE / 2 + 0.5} y={H} size={7} seed={team.index * 2 + 1} />
      {blocks}
      {newFloor !== null && newFloor <= team.floors && (
        <FloorSparkle key={`s${newFloor}`} x={SIDE} y={H - newFloor * UNIT} width={3 * UNIT} size={UNIT} />
      )}
      {puffs}
      {attack &&
        attack.before.flatMap((top, c) =>
          Array.from({ length: Math.max(0, top - attack.after[c]!) }, (_, k) => {
            const r = attack.after[c]! + k;
            const dir = hash01(attack.seq, c, r) < 0.5 ? -1 : 1;
            return (
              <g
                key={`d${c}-${r}`}
                class="debris"
                style={{ "--dx": `${dir * (20 + hash01(r, c) * 40)}px`, "--rot": `${dir * (90 + hash01(c, r, 3) * 200)}deg`, animationDelay: `${1300 + k * 40}ms` }}
              >
                <BuildingBlock x={SIDE + c * UNIT} y={H - (r + 1) * UNIT} size={UNIT} color={team.color} team={team.index} col={c} row={r} fullFloor={false} />
              </g>
            );
          }),
        )}
      {phase === "playing" && <Crane x={roofX} y={roofY} x0={SIDE - 3} x1={W - SIDE + 3} size={UNIT} />}
      {phase === "podium" && top > 0 && <RoofFlag x={roofX} y={roofY} size={UNIT} color={team.color} />}
      {egg?.cells[team.index] && phase === "playing" && (
        <EggCell x={SIDE + egg.cells[team.index]!.col * UNIT} y={H - (egg.cells[team.index]!.row + 1) * UNIT} size={UNIT} />
      )}
    </svg>
  );
}

function TowerPodium({ view, send }: { view: TowerView; send: Send }) {
  const ranked = [...view.teams].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const places = [
    { team: ranked[1], cls: "second" },
    { team: ranked[0], cls: "first" },
    { team: ranked[2], cls: "third" },
  ];
  const a = view.awards;
  return (
    <main class="podium tower-podium">
      <div class="podium-bg scene" aria-hidden="true">
        <Scene teams={view.teams} phase="podium" />
      </div>
      <h1>🏆 Tallest tower</h1>
      <div class="podium-blocks">
        {places.map(({ team, cls }) =>
          team ? (
            <div key={cls} class={`place ${cls}`} style={{ "--team": team.color }}>
              <div class="place-name">Team {team.name}</div>
              <div class="place-score">
                {team.floors} floor{team.floors === 1 ? "" : "s"} · {team.placed} blocks
              </div>
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
              <span>
                {t.floors} floors · {t.placed} blocks
              </span>
            </li>
          ))}
        </ol>
      )}
      <div class="awards">
        <Award icon="🎯" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
        <Award icon="🧱" title="Master builder" award={a?.masterBuilder ?? null} unit="blocks placed" />
      </div>
      <footer class="controls">
        {view.hasResults && (
          <a class="btn ghost" href="/api/results/latest.csv" download>
            ⬇ Download results (CSV)
          </a>
        )}
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

function Award({ icon, title, award, unit }: { icon: string; title: string; award: { value: number; nicknames: string[] } | null; unit: string }) {
  return (
    <div class="award">
      <div class="award-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <div class="award-title">{title}</div>
        <div class="award-who">{award ? award.nicknames.join(", ") : "—"}</div>
        {award && (
          <div class="award-value">
            {award.value} {unit}
          </div>
        )}
      </div>
    </div>
  );
}
