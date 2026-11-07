/** Interactive review fixture for both themes, all team colors and gameplay phases. */
import { render } from "preact";
import { useState } from "preact/hooks";
import { TEAMS, type HostView, type PlayerTowerView, type TowerPhase } from "../../src/shared/protocol.ts";
import type { TowerTheme } from "../../src/shared/tower-theme.ts";
import { TowerStage } from "../../src/client/host/tower.tsx";
import { TowerPlayer } from "../../src/client/player/tower.tsx";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";

function Preview({ phone }: { phone: boolean }) {
  const query = new URLSearchParams(location.search);
  const [theme, setTheme] = useState<TowerTheme>(query.get("theme") === "classic" ? "classic" : "christmas");
  const [phase, setPhase] = useState<TowerPhase>((query.get("phase") || "playing") as TowerPhase);
  const [seq, setSeq] = useState(0);
  const [teamIndex, setTeamIndex] = useState(0);
  const [count, setCount] = useState(Number(query.get("teams")) || 3);
  const [question, setQuestion] = useState(false);
  const high = Number(query.get("height")) || 0;
  const teams = TEAMS.slice(0, count).map((team, index) => {
    const columns = [5 + index % 3 + high, 6 + index % 3 + high, 5 + index % 3 + high];
    return { ...team, index, columns, floors: Math.min(...columns), placed: columns.reduce((a,b) => a+b, 0), rank: count-index, members: [{ id: `p${index}`, nickname: `Builder ${index+1}`, avatar: { avatar: "polarbear" as const, accessory: "none" as const }, connected: true, building: index === 0 }] };
  });
  const egg = { seq: 1, cells: teams.map(t=>({ col: 1, row: Math.max(...t.columns)+1 })) };
  const team = teams[Math.min(teamIndex, count-1)]!;
  const host: Extract<HostView, { kind: "tower" }> = {
    kind: "tower", theme, phase, quiz: { id: "preview", title: "Tower artwork preview", questionCount: 10 }, remainingMs: phase === "countdown" ? 3000 : 120000,
    teams, playerCount: count, dropCount: seq, monster: true, egg: phase === "playing" ? egg : null,
    lastAttack: seq ? { seq, byTeam: 1, byNickname: "Builder 2", target: 0, before: teams[0]!.columns.map(h=>h+2), after: teams[0]!.columns } : null,
    nextMonsterMs: null, awards: null, errors: null, hasResults: false,
    join: { url: "http://localhost:8098/phone", qrSvg: "", address: "localhost", addresses: [], port: 8098 },
  };
  const player: PlayerTowerView = {
    kind: "tower", theme, phase, title: host.quiz.title, remainingMs: host.remainingMs,
    me: { id: "preview", nickname: "Preview builder", avatar: { avatar: "polarbear", accessory: "none" }, correct: 12, placed: 15 },
    team, state: question ? "question" : "build", blocksHeld: 4, feedback: null,
    question: question ? { seq: 1, type: "multiple_choice", text: "What is 2 + 2?", options: ["3", "4", "5", "6"] } : null,
    egg: phase === "playing" ? { seq: 1, ...egg.cells[team.index]! } : null,
    monsterEvent: seq ? { seq, kind: "smashed", byTeam: "Blue", target: "Red" } : null,
    build: question ? null : { columns: team.columns, floors: team.floors, sweepMs: 1800 },
    result: { teamRank: 1, teamCount: count, floors: team.floors, placed: team.placed, awards: [] },
  };
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "#142333", zIndex: 10, fontSize: 12 }}>
      <select aria-label="Theme" value={theme} onChange={e=>setTheme(e.currentTarget.value as TowerTheme)}><option value="christmas">North Pole</option><option value="classic">Normal</option></select>
      <select aria-label="Phase" value={phase} onChange={e=>setPhase(e.currentTarget.value as TowerPhase)}>{["playing", "countdown", "podium"].map(p=><option key={p}>{p}</option>)}</select>
      <select aria-label="Team count" value={count} onChange={e=>setCount(Number(e.currentTarget.value))}>{[1,2,3,6].map(n=><option key={n}>{n}</option>)}</select>
      {phone && <select aria-label="Team color" value={teamIndex} onChange={e=>setTeamIndex(Number(e.currentTarget.value))}>{teams.map(t=><option value={t.index} key={t.index}>{t.name}</option>)}</select>}
      <button onClick={()=>setSeq(s=>s+1)}>Yeti attack</button>
      {phone && <button onClick={()=>setQuestion(q=>!q)}>Questions / build</button>}
      <a href={phone ? "/" : "/phone"}>{phone ? "Projector" : "Phone"}</a>
    </nav>
    <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
      {phone ? <TowerPlayer view={player} send={()=>{}} /> : <TowerStage view={host} send={()=>{}} />}
    </div>
  </div>;
}
export function mount(phone: boolean) {
  if (phone) setPhoneArt();
  render(<Preview phone={phone} />, document.getElementById("app")!);
}
