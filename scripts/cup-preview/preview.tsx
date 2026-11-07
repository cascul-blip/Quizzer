/** Interactive preview using the production host and phone components. */
import { render } from "preact";
import { useState } from "preact/hooks";
import type { HostView, PlayerCupView, CupPhase } from "../../src/shared/protocol.ts";
import type { CupTheme } from "../../src/shared/cup-theme.ts";
import type { AvatarId } from "../../src/shared/avatars.ts";
import { CupStage } from "../../src/client/host/cup.tsx";
import { CupPlayer } from "../../src/client/player/cup.tsx";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";

function Preview({ phone }: { phone: boolean }) {
  const query = new URLSearchParams(location.search);
  const [theme, setTheme] = useState<CupTheme>(query.get("theme") === "classic" ? "classic" : "christmas");
  const [scene, setScene] = useState("quiz");
  const [count, setCount] = useState(6);
  const [cups, setCups] = useState(3);
  const [seq, setSeq] = useState(1);
  const phase: CupPhase = scene === "launch" || scene === "next" || scene === "sip" ? "reveal" : scene === "practice" ? "quiz" : scene as CupPhase;
  const launched = scene === "launch" || scene === "next" || scene === "practice";
  const avatarIds: AvatarId[] = ["cat", "fox", "penguin", "bear", "bunny", "reindeer"];
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`, nickname: ["Merry", "Jingle", "Cocoa", "Holly", "Frost", "Sparkle"][i % 6]! + (i >= 6 ? i : ""),
    avatar: { avatar: avatarIds[i % 6]!, accessory: "none" as const }, connected: true, cups,
    out: (launched && i === 0) || (scene === "next" && i === 1), target: 4, progress: i % 5,
    safe: i % 5 === 4, drinker: i < 2, picked: false,
  }));
  const drinks = players.slice(0, 2).map((p, i) => ({ id: p.id, cup: 0, cupsBefore: cups, auto: cups === 1, verdict: (i === 0 && launched) || (i === 1 && scene === "next") ? "poison" as const : null }));
  const current = scene === "next" ? 1 : 0;
  const host: Extract<HostView, { kind: "cup" }> = {
    kind: "cup", theme, phase, quiz: { id: "preview", title: "Cup of Cheer artwork preview", questionCount: 10 },
    round: 2, phaseRemainingMs: phase === "countdown" ? 3000 : 20000, phaseDurationMs: 30000,
    players, startCups: cups, reveal: phase === "reveal" ? { seq, round: 2, current, drinks } : null,
    playerCount: count, standings: phase === "podium" ? players.map((p, i) => ({ ...p, rank: i + 1, outRound: i ? 2 : null, correct: 12 - i })) : null,
    awards: null, errors: null, hasResults: phase === "podium",
    join: { url: "http://localhost:8096/phone", qrSvg: "", address: "localhost", addresses: [], port: 8096 },
  };
  const me = players[0]!;
  const player: PlayerCupView = {
    kind: "cup", theme, phase, title: host.quiz.title, round: 2,
    phaseRemainingMs: host.phaseRemainingMs, phaseDurationMs: host.phaseDurationMs,
    me: { ...me, correct: 12 }, startCups: cups,
    question: { seq: 1, type: "multiple_choice", text: "Which reindeer has a red nose?", options: ["Rudolph", "Comet", "Dasher"] }, feedback: null,
    drink: phase === "drink" ? { picked: null } : null,
    myDrink: phase === "reveal" ? { ...drinks[0]!, seq, turn: current === 0, waiting: false } : null,
    alive: players.filter(p => !p.out).length,
    result: phase === "podium" ? { rank: 2, playerCount: count, won: false, outRound: 2, awards: [] } : null,
  };
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "#142e26", zIndex: 10, fontSize: 12 }}>
      <select aria-label="Theme" value={theme} onChange={e => setTheme(e.currentTarget.value as CupTheme)}><option value="christmas">Santa's Workshop</option><option value="classic">Normal</option></select>
      <select aria-label="Scene" value={scene} onChange={e => setScene(e.currentTarget.value)}>{["countdown", "roll", "quiz", "drink", "sip", "practice", "podium"].map(p => <option key={p}>{p}</option>)}</select>
      <select aria-label="Players" value={count} onChange={e => setCount(Number(e.currentTarget.value))}>{[1, 6, 12, 24].map(n => <option key={n}>{n}</option>)}</select>
      <select aria-label="Cups" value={cups} onChange={e => setCups(Number(e.currentTarget.value))}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</select>
      <button onClick={() => { setScene("launch"); setSeq(seq + 1); }}>Blast off</button>
      <button onClick={() => setScene("next")}>Next launch</button>
      <a href={phone ? "/" : "/phone"}>{phone ? "Projector" : "Phone"}</a>
    </nav>
    <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
      {phone ? <CupPlayer view={player} send={() => {}} /> : <CupStage view={host} send={() => {}} />}
    </div>
  </div>;
}
export function mount(phone: boolean) {
  if (phone) setPhoneArt();
  render(<Preview phone={phone} />, document.getElementById("app")!);
}
