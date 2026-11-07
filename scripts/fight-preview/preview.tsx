import { gingerbreadTerrain } from "../../src/shared/fight-ground.ts";
/** Standalone visual QA for Tower Fight's actual host and phone components. */
import { render } from "preact";
import { useState } from "preact/hooks";
import { TEAMS, type HostView, type PlayerFightView, type FightPhase, type FightState, type FightShot } from "../../src/shared/protocol.ts";
import type { FightTheme } from "../../src/shared/fight-theme.ts";
import { FightStage } from "../../src/client/host/fight.tsx";
import { FightPlayer } from "../../src/client/player/fight.tsx";
import { makeTerrain, launchVector, simulate, carve, type HillHeight } from "../../src/shared/fight-physics.ts";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";

function Preview({ phone }: { phone: boolean }) {
  const q = new URLSearchParams(location.search);
  const [theme, setTheme] = useState<FightTheme>(q.get("theme") === "classic" ? "classic" : "christmas");
  const [phase, setPhase] = useState<FightPhase>("playing");
  const [state, setState] = useState<FightState>((q.get("state") || "decide") as FightState);
  const [damage, setDamage] = useState(Number(q.get("damage")) || 0);
  const [team, setTeam] = useState(0);
  const [shot, setShot] = useState<FightShot | null>(null);
  const [hill, setHill] = useState<HillHeight>((q.get("hill") || "medium") as HillHeight);
  const [craters, setCraters] = useState(0);
  let terrain = theme === "christmas" ? gingerbreadTerrain(hill) : makeTerrain(hill, () => .5);
  for (let i = 0; i < craters; i++) terrain = carve(terrain, 500, 80, 40);
  const avatar = { avatar: "polarbear" as const, accessory: "santahat" as const };
  const teams = TEAMS.slice(0, 2).map((t, index) => ({ ...t, index, damage: index === 0 ? damage : Math.max(0, damage - 1), repairing: state === "repair", correct: 12, members: [{ id: `p${index}`, nickname: index ? "Blue Baker" : "Red Baker", avatar, connected: true, state, hits: 2, rebuilds: 1 }] }));
  const shoot = (side = team, elapsedMs = 0) => {
    const v = launchVector(side ? 110 : -110, -150)!;
    const result = simulate(terrain, side, v.vx, v.vy);
    setShot({ id: Date.now(), playerId: `p${side}`, nickname: "Baker", avatar, team: side, ...v, ...result, elapsedMs });
    setState("watch");
  };
  const host: Extract<HostView, { kind: "fight" }> = { kind: "fight", theme, phase, quiz: { id: "preview", title: "Christmas Quiz", questionCount: 10 }, phaseRemainingMs: phase === "countdown" ? 3000 : 0, hill, terrain, teams, shots: shot ? [shot] : [], events: [], outcome: phase === "podium" ? { winner: 0, reason: "damage" } : null, playerCount: 2, awards: null, errors: null, hasResults: false, join: { url: "http://localhost:8099/phone", qrSvg: "", address: "localhost", addresses: [], port: 8099 } };
  const player: PlayerFightView = { kind: "fight", hill, theme, phase, title: host.quiz.title, phaseRemainingMs: host.phaseRemainingMs, me: { id: `p${team}`, nickname: teams[team]!.members[0]!.nickname, avatar, correct: 12, hits: 2, rebuilds: 1 }, team: teams[team]!, teams, state, towardDecision: 2, decisionMs: 10000, repairMs: 2500, lastRepair: null, question: { seq: 1, type: "multiple_choice", text: "Which spice goes in gingerbread?", options: ["Ginger", "Basil", "Dill", "Mint"] }, feedback: null, damage: teams.map(t => t.damage), terrain, shot, result: phase === "podium" ? { outcome: { winner: 0, reason: "damage" }, awards: ["Master builder"] } : null };
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: 5, background: "#352238", zIndex: 10, fontSize: 12 }}>
      <select aria-label="Theme" value={theme} onChange={e => setTheme(e.currentTarget.value as FightTheme)}><option value="christmas">Gingerbread Siege</option><option value="classic">Normal</option></select>
      <select aria-label="Hill" value={hill} onChange={e => { setHill(e.currentTarget.value as HillHeight); setCraters(0); }}><option>low</option><option>medium</option><option>high</option></select>
      <button onClick={() => setCraters(n => n + 1)}>Crater</button>
      <select aria-label="Phase" value={phase} onChange={e => setPhase(e.currentTarget.value as FightPhase)}>{["playing", "countdown", "collapse", "podium"].map(p => <option key={p}>{p}</option>)}</select>
      <select aria-label="Damage" value={damage} onChange={e => setDamage(Number(e.currentTarget.value))}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
      <select aria-label="State" value={state} onChange={e => setState(e.currentTarget.value as FightState)}>{["question", "decide", "aim", "repair", "watch"].map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Team" value={team} onChange={e => setTeam(Number(e.currentTarget.value))}><option value="0">Red</option><option value="1">Blue</option></select>
      <button onClick={() => shoot(0)}>Fire Red</button><button onClick={() => shoot(1)}>Fire Blue</button><button onClick={() => shoot(team, 2000)}>Old shot</button>
      <a href={phone ? "/" : "/phone"}>{phone ? "Host" : "Phone"}</a>
    </nav>
    <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
      {phone ? <FightPlayer view={player} send={m => { if (m.type === "fight.fire") shoot(); if (m.type === "fight.choose") setState(m.action === "attack" ? "aim" : "repair"); }} /> : <FightStage view={host} send={() => {}} />}
    </div>
  </div>;
}
export function mount(phone: boolean) {
  if (phone) setPhoneArt();
  render(<Preview phone={phone} />, document.getElementById("app")!);
}
