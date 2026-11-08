/** Artwork review using the actual host, phone, and hex-board components. */
import { render } from "preact";
import { useState } from "preact/hooks";
import { LandStage } from "../../src/client/host/land.tsx";
import { LandPlayer } from "../../src/client/player/land.tsx";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";
import { TEAMS, type HostView, type PlayerLandView, type LandPhase } from "../../src/shared/protocol.ts";
import { landBoardSize, startTiles, hexDistance } from "../../src/shared/land-board.ts";
import type { LandTheme } from "../../src/shared/land-theme.ts";
function Preview({ phone }: { phone: boolean }) {
  const [theme, setTheme] = useState<LandTheme>("christmas");
  const [count, setCount] = useState(6);
  const [phase, setPhase] = useState<LandPhase>("playing");
  const [claimed, setClaimed] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [details, setDetails] = useState(false);
  const size = landBoardSize(count);
  const starts = startTiles(count).map((tile, team) => ({ tile, team, out: false }));
  const owners = Array.from({ length: size * size }, (_, tile) => {
    if (details && Math.floor(tile / size) >= size - 3) return 0;
    const start = starts.find(s => hexDistance(size, tile, s.tile) <= (claimed ? 2 : 0));
    return start?.team ?? -1;
  });
  const board = { size, owners, starts };
  const teams = TEAMS.slice(0, count).map((t, index) => ({ ...t, index, tiles: owners.filter(o => o === index).length, correct: 12, rank: index + 1, out: false, conqueredBy: null, members: [{ id: `p${index}`, nickname: ["Holly", "Cocoa", "Jingle", "Noel", "Snow", "Cookie"][index]!, avatar: { avatar: "cat" as const, accessory: "none" as const }, connected: true, claiming: true }] }));
  const host: Extract<HostView, { kind: "land" }> = {
    kind: "land", theme, phase, quiz: { id: "preview", title: "North Pole · Land Grab", questionCount: 10 }, remainingMs: 222000,
    board, teams, lastPlace: null, lastCapture: null, playerCount: count, awards: null, errors: null,
    join: { url: "http://127.0.0.1:8095/phone", qrSvg: "", address: "localhost", addresses: [], port: 8095 },
  };
  const player: PlayerLandView = {
    kind: "land", theme, phase, title: host.quiz.title, remainingMs: host.remainingMs,
    me: { id: "p0", nickname: "Holly", avatar: { avatar: "cat", accessory: "none" }, correct: 9, placed: 12, stolen: 0 },
    team: teams[0]!, teamTiles: teams[0]!.tiles, state: quiz ? "question" : "claim", claims: 3, answered: 0, emptyMs: 0,
    question: quiz ? { seq: 1, type: "multiple_choice", text: "Where does Santa live?", options: ["The North Pole", "The South Pole"] } : null,
    feedback: null, board: quiz ? null : board, conquered: null, result: null,
  };
  return <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 6, background: "#30271e", fontSize: 12 }}>
      <select aria-label="Theme" value={theme} onChange={e => setTheme(e.currentTarget.value as LandTheme)}><option value="christmas">North Pole</option><option value="classic">Classic</option></select>
      <select aria-label="Teams" value={count} onChange={e => setCount(Number(e.currentTarget.value))}>{[2,3,4,5,6].map(n => <option key={n}>{n}</option>)}</select>
      <select aria-label="Phase" value={phase} onChange={e => setPhase(e.currentTarget.value as LandPhase)}>{["playing", "countdown", "podium"].map(p => <option key={p}>{p}</option>)}</select>
      <button onClick={() => setClaimed(!claimed)}>Territories</button>
      <button onClick={() => setQuiz(!quiz)}>Quiz</button>
      <button onClick={() => setDetails(!details)}>Map details</button>
      <a href={phone ? "/" : "/phone"}>{phone ? "Projector" : "Phone"}</a>
    </nav>
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
    {phone ? <LandPlayer view={player} send={() => {}} /> : <LandStage view={host} send={() => {}} />}
    </div>
  </div>;
}
export function mount(phone: boolean) {
  if (phone) setPhoneArt();
  render(<Preview phone={phone} />, document.getElementById("app")!);
}
